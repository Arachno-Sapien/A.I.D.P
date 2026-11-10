use super::{ACCEPTED_VERSIONS, MAX_LINE_BYTES, McpError, PROTOCOL_VERSION};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError, Weak};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::sync::{oneshot, Mutex as AsyncMutex};
use tokio::task::AbortHandle;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, PartialEq)]
pub struct RemoteTool {
    pub name: String,
    pub description: String,
    pub schema: Value,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CallResult {
    pub text: String,
    pub is_error: bool,
}

type PendingMap = HashMap<u64, oneshot::Sender<Result<Value, McpError>>>;

pub struct Client {
    next_id: AtomicU64,
    pending: Mutex<PendingMap>,
    writer: AsyncMutex<Box<dyn AsyncWrite + Unpin + Send>>,
    closed: AtomicBool,
    reader_abort: AbortHandle,
}

impl Drop for Client {
    fn drop(&mut self) {
        self.reader_abort.abort();
    }
}

impl Client {
    /// Spawns the reader task (`tokio::spawn`) and returns at once.
    pub fn new<R, W>(reader: R, writer: W) -> Arc<Client>
    where
        R: AsyncRead + Unpin + Send + 'static,
        W: AsyncWrite + Unpin + Send + 'static,
    {
        Arc::new_cyclic(|weak| {
            let weak_clone = Weak::clone(weak);
            let handle = tokio::spawn(async move {
                reader_loop(reader, weak_clone).await;
            });
            Client {
                next_id: AtomicU64::new(1),
                pending: Mutex::new(HashMap::new()),
                writer: AsyncMutex::new(Box::new(writer)),
                closed: AtomicBool::new(false),
                reader_abort: handle.abort_handle(),
            }
        })
    }

    pub fn is_closed(&self) -> bool {
        self.closed.load(Ordering::Acquire)
    }

    fn close_and_fail(&self, err: McpError) {
        self.closed.store(true, Ordering::Release);
        let waiters: Vec<_> = {
            let mut guard = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
            guard.drain().map(|(_, tx)| tx).collect()
        };
        for tx in waiters {
            let _ = tx.send(Err(err.clone()));
        }
    }

    async fn write_value(&self, value: &Value) -> Result<(), McpError> {
        let mut line = serde_json::to_string(value).map_err(|e| McpError::Protocol {
            message: e.to_string(),
        })?;
        line.push('\n');
        let mut w = self.writer.lock().await;
        if w.write_all(line.as_bytes()).await.is_err() || w.flush().await.is_err() {
            drop(w);
            let err = McpError::Closed {
                stderr: String::new(),
            };
            self.close_and_fail(err.clone());
            return Err(err);
        }
        Ok(())
    }

    pub async fn request(
        &self,
        method: &str,
        params: Value,
        timeout: Duration,
        cancel: &CancellationToken,
    ) -> Result<Value, McpError> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        {
            let mut guard = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
            if self.closed.load(Ordering::Acquire) {
                return Err(McpError::Closed {
                    stderr: String::new(),
                });
            }
            guard.insert(id, tx);
        }

        let payload = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params,
        });

        if let Err(err) = self.write_value(&payload).await {
            let mut guard = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
            guard.remove(&id);
            return Err(err);
        }

        tokio::select! {
            biased;
            _ = cancel.cancelled() => {
                {
                    let mut guard = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
                    guard.remove(&id);
                }
                let _ = self
                    .notify(
                        "notifications/cancelled",
                        Some(json!({ "requestId": id, "reason": "stopped" })),
                    )
                    .await;
                Err(McpError::Stopped)
            }
            res = rx => match res {
                Ok(r) => r,
                Err(_) => Err(McpError::Closed {
                    stderr: String::new(),
                }),
            },
            _ = tokio::time::sleep(timeout) => {
                {
                    let mut guard = self.pending.lock().unwrap_or_else(PoisonError::into_inner);
                    guard.remove(&id);
                }
                let _ = self
                    .notify(
                        "notifications/cancelled",
                        Some(json!({ "requestId": id, "reason": "timeout" })),
                    )
                    .await;
                Err(McpError::Timeout)
            }
        }
    }

    pub async fn notify(&self, method: &str, params: Option<Value>) -> Result<(), McpError> {
        if self.is_closed() {
            return Err(McpError::Closed {
                stderr: String::new(),
            });
        }
        let payload = match params {
            Some(p) => json!({ "jsonrpc": "2.0", "method": method, "params": p }),
            None => json!({ "jsonrpc": "2.0", "method": method }),
        };
        self.write_value(&payload).await
    }

    pub async fn initialize(
        &self,
        timeout: Duration,
        cancel: &CancellationToken,
    ) -> Result<(), McpError> {
        let result = self
            .request(
                "initialize",
                json!({
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {
                        "name": "aidp",
                        "version": env!("CARGO_PKG_VERSION"),
                    },
                }),
                timeout,
                cancel,
            )
            .await?;

        let version = result
            .get("protocolVersion")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if !ACCEPTED_VERSIONS.contains(&version) {
            return Err(McpError::Protocol {
                message: format!("protocol version {version}"),
            });
        }

        self.notify("notifications/initialized", None).await
    }

    pub async fn list_tools(
        &self,
        timeout: Duration,
        cancel: &CancellationToken,
    ) -> Result<Vec<RemoteTool>, McpError> {
        let mut tools = Vec::new();
        let mut cursor: Option<String> = None;

        for _ in 0..20 {
            let params = match &cursor {
                Some(c) => json!({ "cursor": c }),
                None => json!({}),
            };
            let result = self.request("tools/list", params, timeout, cancel).await?;
            let list = result
                .get("tools")
                .and_then(|t| t.as_array())
                .ok_or_else(|| McpError::Protocol {
                    message: "missing tools list".into(),
                })?;

            for item in list {
                let Some(name) = item.get("name").and_then(|n| n.as_str()) else {
                    continue;
                };
                let description = item
                    .get("description")
                    .and_then(|d| d.as_str())
                    .unwrap_or("")
                    .to_string();
                let schema = item.get("inputSchema").cloned().unwrap_or(Value::Null);
                tools.push(RemoteTool {
                    name: name.to_string(),
                    description,
                    schema,
                });
            }

            match result.get("nextCursor").and_then(|c| c.as_str()) {
                Some(c) if !c.is_empty() => cursor = Some(c.to_string()),
                _ => break,
            }
        }

        Ok(tools)
    }

    pub async fn call_tool(
        &self,
        name: &str,
        arguments: Value,
        timeout: Duration,
        cancel: &CancellationToken,
    ) -> Result<CallResult, McpError> {
        let result = self
            .request(
                "tools/call",
                json!({ "name": name, "arguments": arguments }),
                timeout,
                cancel,
            )
            .await?;

        Ok(CallResult {
            text: flatten(result.get("content").unwrap_or(&Value::Null)),
            is_error: result
                .get("isError")
                .and_then(|b| b.as_bool())
                .unwrap_or(false),
        })
    }
}

enum LineRead {
    Line(Vec<u8>),
    Eof,
    TooLong,
}

async fn read_line_capped<R: AsyncBufReadExt + Unpin>(reader: &mut R) -> LineRead {
    let mut line = Vec::new();
    loop {
        let chunk = match reader.fill_buf().await {
            Ok(b) => b,
            Err(_) => return LineRead::Eof,
        };
        if chunk.is_empty() {
            if line.is_empty() {
                return LineRead::Eof;
            }
            return LineRead::Line(line);
        }
        if let Some(pos) = chunk.iter().position(|&b| b == b'\n') {
            if line.len() + pos > MAX_LINE_BYTES {
                reader.consume(pos + 1);
                return LineRead::TooLong;
            }
            line.extend_from_slice(&chunk[..pos]);
            reader.consume(pos + 1);
            return LineRead::Line(line);
        }
        let n = chunk.len();
        if line.len() + n > MAX_LINE_BYTES {
            reader.consume(n);
            return LineRead::TooLong;
        }
        line.extend_from_slice(chunk);
        reader.consume(n);
    }
}

async fn reader_loop<R: AsyncRead + Unpin>(reader: R, weak: Weak<Client>) {
    let mut buffered = BufReader::new(reader);
    loop {
        match read_line_capped(&mut buffered).await {
            LineRead::Eof => {
                if let Some(client) = weak.upgrade() {
                    client.close_and_fail(McpError::Closed {
                        stderr: String::new(),
                    });
                }
                break;
            }
            LineRead::TooLong => {
                if let Some(client) = weak.upgrade() {
                    client.close_and_fail(McpError::Protocol {
                        message: "a message over 8 MB".into(),
                    });
                }
                break;
            }
            LineRead::Line(mut bytes) => {
                if bytes.ends_with(b"\r") {
                    bytes.pop();
                }
                let Ok(msg) = serde_json::from_slice::<Value>(&bytes) else {
                    continue;
                };
                if let (Some(method), Some(id_val)) = (
                    msg.get("method").and_then(|m| m.as_str()),
                    msg.get("id").filter(|v| !v.is_null()),
                ) {
                    let reply = if method == "ping" {
                        json!({ "jsonrpc": "2.0", "id": id_val, "result": {} })
                    } else {
                        json!({
                            "jsonrpc": "2.0",
                            "id": id_val,
                            "error": { "code": -32601, "message": "Method not found" },
                        })
                    };
                    if let Some(client) = weak.upgrade() {
                        let _ = client.write_value(&reply).await;
                    }
                    continue;
                }
                if msg.get("method").is_some() {
                    continue;
                }
                let Some(id) = msg.get("id").and_then(|v| v.as_u64()) else {
                    continue;
                };
                let Some(client) = weak.upgrade() else {
                    break;
                };
                let sender = {
                    let mut guard = client
                        .pending
                        .lock()
                        .unwrap_or_else(PoisonError::into_inner);
                    guard.remove(&id)
                };
                let Some(tx) = sender else {
                    continue;
                };
                if let Some(err) = msg.get("error").filter(|e| !e.is_null()) {
                    let code = err
                        .get("code")
                        .and_then(|c| c.as_i64())
                        .and_then(|c| i32::try_from(c).ok())
                        .unwrap_or(-32000);
                    let message = err
                        .get("message")
                        .and_then(|m| m.as_str())
                        .unwrap_or("Unknown error")
                        .to_string();
                    let _ = tx.send(Err(McpError::Rpc { code, message }));
                } else if let Some(result) = msg.get("result") {
                    let _ = tx.send(Ok(result.clone()));
                } else {
                    let _ = tx.send(Err(McpError::Protocol {
                        message: "missing result".into(),
                    }));
                }
            }
        }
    }
}

/// Joins a `tools/call` result's `content` items with `\n`.
pub fn flatten(content: &Value) -> String {
    let Some(items) = content.as_array() else {
        return "[content not shown]".to_string();
    };

    items
        .iter()
        .map(|item| {
            let kind = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
            match kind {
                "text" => item
                    .get("text")
                    .and_then(|t| t.as_str())
                    .unwrap_or("")
                    .to_string(),
                "image" => {
                    let mime = item
                        .get("mimeType")
                        .and_then(|m| m.as_str())
                        .unwrap_or("");
                    format!("[image {mime}, not shown]")
                }
                "audio" => {
                    let mime = item
                        .get("mimeType")
                        .and_then(|m| m.as_str())
                        .unwrap_or("");
                    format!("[audio {mime}, not shown]")
                }
                "resource" => {
                    let res = item.get("resource");
                    if let Some(txt) = res.and_then(|r| r.get("text")).and_then(|t| t.as_str()) {
                        txt.to_string()
                    } else {
                        let uri = res
                            .and_then(|r| r.get("uri"))
                            .and_then(|u| u.as_str())
                            .unwrap_or("");
                        format!("[file {uri}, not shown]")
                    }
                }
                "resource_link" => {
                    let uri = item.get("uri").and_then(|u| u.as_str()).unwrap_or("");
                    format!("[link {uri}]")
                }
                _ => "[content not shown]".to_string(),
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use crate::mcp::{McpError, MAX_LINE_BYTES};
    use serde_json::{json, Value};
    use std::sync::Arc;
    use std::time::Duration;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, DuplexStream};
    use tokio_util::sync::CancellationToken;

    /// A client wired to an in-memory "server": returns the client, a line reader of
    /// what the client wrote, and a writer for what the server says.
    fn pair() -> (Arc<Client>, tokio::io::Lines<BufReader<DuplexStream>>, DuplexStream) {
        let (client_out, server_in) = tokio::io::duplex(64 * 1024);
        let (server_out, client_in) = tokio::io::duplex(64 * 1024);
        (
            Client::new(client_in, client_out),
            BufReader::new(server_in).lines(),
            server_out,
        )
    }

    async fn read_json(lines: &mut tokio::io::Lines<BufReader<DuplexStream>>) -> Value {
        let line = tokio::time::timeout(Duration::from_secs(5), lines.next_line())
            .await
            .expect("timed out reading client line")
            .expect("read failed")
            .expect("client closed stream");
        serde_json::from_str(&line).expect("invalid json from client")
    }

    async fn write_json(out: &mut DuplexStream, v: &Value) {
        let mut s = serde_json::to_string(v).unwrap();
        s.push('\n');
        out.write_all(s.as_bytes()).await.unwrap();
        out.flush().await.unwrap();
    }

    #[tokio::test]
    async fn initialize_sends_version_and_initialized() {
        let (client, mut from_client, mut to_client) = pair();
        let cancel = CancellationToken::new();

        let srv = tokio::spawn(async move {
            let first = read_json(&mut from_client).await;
            assert_eq!(first["method"], "initialize");
            assert_eq!(first["params"]["protocolVersion"], "2025-06-18");
            assert_eq!(first["params"]["capabilities"], json!({}));
            assert_eq!(first["params"]["clientInfo"]["name"], "aidp");

            write_json(
                &mut to_client,
                &json!({
                    "jsonrpc": "2.0",
                    "id": first["id"],
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": { "tools": {} },
                        "serverInfo": { "name": "test", "version": "1" }
                    }
                }),
            )
            .await;

            let second = tokio::time::timeout(Duration::from_secs(5), from_client.next_line())
                .await
                .unwrap()
                .unwrap()
                .unwrap();
            assert_eq!(
                second,
                r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#
            );
        });

        let res = client.initialize(Duration::from_secs(5), &cancel).await;
        assert_eq!(res, Ok(()));
        srv.await.unwrap();
    }

    #[tokio::test]
    async fn unsupported_version_is_refused() {
        let (client, mut from_client, mut to_client) = pair();
        let cancel = CancellationToken::new();

        let srv = tokio::spawn(async move {
            let first = read_json(&mut from_client).await;
            write_json(
                &mut to_client,
                &json!({
                    "jsonrpc": "2.0",
                    "id": first["id"],
                    "result": {
                        "protocolVersion": "1999-01-01",
                        "capabilities": {}
                    }
                }),
            )
            .await;

            let next = tokio::time::timeout(Duration::from_millis(200), from_client.next_line()).await;
            assert!(next.is_err(), "client should not send notifications/initialized");
        });

        let res = client.initialize(Duration::from_secs(5), &cancel).await;
        assert!(matches!(res, Err(McpError::Protocol { .. })));
        srv.await.unwrap();
    }

    #[tokio::test]
    async fn non_json_and_notifications_are_skipped() {
        let (client, mut from_client, mut to_client) = pair();
        let cancel = CancellationToken::new();

        let srv = tokio::spawn(async move {
            let req = read_json(&mut from_client).await;
            to_client.write_all(b"starting up...\n").await.unwrap();
            write_json(
                &mut to_client,
                &json!({"jsonrpc": "2.0", "method": "notifications/message", "params": {}}),
            )
            .await;
            write_json(
                &mut to_client,
                &json!({"jsonrpc": "2.0", "id": req["id"], "result": {"ok": true}}),
            )
            .await;
        });

        let res = client
            .request("ping", json!({}), Duration::from_secs(5), &cancel)
            .await;
        assert_eq!(res, Ok(json!({"ok": true})));
        srv.await.unwrap();
    }

    #[tokio::test]
    async fn ping_from_server_is_answered() {
        let (client, mut from_client, mut to_client) = pair();

        write_json(
            &mut to_client,
            &json!({"jsonrpc": "2.0", "id": "s1", "method": "ping"}),
        )
        .await;
        let r1 = read_json(&mut from_client).await;
        assert_eq!(r1, json!({"jsonrpc": "2.0", "id": "s1", "result": {}}));

        write_json(
            &mut to_client,
            &json!({"jsonrpc": "2.0", "id": 9, "method": "roots/list"}),
        )
        .await;
        let r2 = read_json(&mut from_client).await;
        assert_eq!(r2["id"], json!(9));
        assert_eq!(r2["error"]["code"], json!(-32601));
        drop(client);
    }

    #[tokio::test]
    async fn rpc_error_is_returned() {
        let (client, mut from_client, mut to_client) = pair();
        let cancel = CancellationToken::new();

        let srv = tokio::spawn(async move {
            let req = read_json(&mut from_client).await;
            write_json(
                &mut to_client,
                &json!({
                    "jsonrpc": "2.0",
                    "id": req["id"],
                    "error": { "code": -32602, "message": "Unknown tool" }
                }),
            )
            .await;
        });

        let res = client
            .request("tools/call", json!({}), Duration::from_secs(5), &cancel)
            .await;
        assert_eq!(
            res,
            Err(McpError::Rpc {
                code: -32602,
                message: "Unknown tool".into()
            })
        );
        srv.await.unwrap();
    }

    #[tokio::test]
    async fn closed_stream_fails_pending_request() {
        let (client, mut from_client, to_client) = pair();
        let cancel = CancellationToken::new();

        let srv = tokio::spawn(async move {
            let _req = read_json(&mut from_client).await;
            drop(to_client);
        });

        let res = tokio::time::timeout(
            Duration::from_secs(1),
            client.request("ping", json!({}), Duration::from_secs(5), &cancel),
        )
        .await
        .unwrap();
        assert!(matches!(res, Err(McpError::Closed { .. })));
        assert!(client.is_closed());
        srv.await.unwrap();

        let second = client
            .request("ping", json!({}), Duration::from_secs(5), &cancel)
            .await;
        assert!(matches!(second, Err(McpError::Closed { .. })));
    }

    #[tokio::test]
    async fn timeout_sends_cancelled() {
        let (client, mut from_client, _to_client) = pair();
        let cancel = CancellationToken::new();

        let req_task = {
            let client = Arc::clone(&client);
            let cancel = cancel.clone();
            tokio::spawn(async move {
                client
                    .request("slow", json!({}), Duration::from_millis(100), &cancel)
                    .await
            })
        };

        let first = read_json(&mut from_client).await;
        let cancelled = read_json(&mut from_client).await;
        assert_eq!(cancelled["method"], "notifications/cancelled");
        assert_eq!(cancelled["params"]["requestId"], first["id"]);
        assert_eq!(cancelled["params"]["reason"], "timeout");

        let res = req_task.await.unwrap();
        assert_eq!(res, Err(McpError::Timeout));
    }

    #[tokio::test]
    async fn stop_sends_cancelled() {
        let (client, mut from_client, _to_client) = pair();
        let cancel = CancellationToken::new();

        let req_task = {
            let client = Arc::clone(&client);
            let cancel = cancel.clone();
            tokio::spawn(async move {
                client
                    .request("slow", json!({}), Duration::from_secs(5), &cancel)
                    .await
            })
        };

        let first = read_json(&mut from_client).await;
        tokio::time::sleep(Duration::from_millis(50)).await;
        cancel.cancel();

        let res = tokio::time::timeout(Duration::from_secs(1), req_task)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(res, Err(McpError::Stopped));

        let cancelled = read_json(&mut from_client).await;
        assert_eq!(cancelled["method"], "notifications/cancelled");
        assert_eq!(cancelled["params"]["requestId"], first["id"]);
        assert_eq!(cancelled["params"]["reason"], "stopped");
    }

    #[tokio::test]
    async fn oversized_line_closes() {
        let (client, mut from_client, mut to_client) = pair();
        let cancel = CancellationToken::new();

        let srv = tokio::spawn(async move {
            let _req = read_json(&mut from_client).await;
            let chunk = vec![b'a'; 64 * 1024];
            let total = MAX_LINE_BYTES + 1;
            let mut written = 0;
            while written < total {
                let n = (total - written).min(chunk.len());
                if to_client.write_all(&chunk[..n]).await.is_err() {
                    break;
                }
                written += n;
            }
            let _ = to_client.flush().await;
            tokio::time::sleep(Duration::from_millis(100)).await;
        });

        let res = client
            .request("big", json!({}), Duration::from_secs(5), &cancel)
            .await;
        assert!(matches!(res, Err(McpError::Protocol { .. })));
        assert!(client.is_closed());
        let _ = srv.await;
    }

    #[tokio::test]
    async fn list_tools_follows_cursor() {
        let (client, mut from_client, mut to_client) = pair();
        let cancel = CancellationToken::new();

        let srv = tokio::spawn(async move {
            let p1 = read_json(&mut from_client).await;
            assert_eq!(p1["method"], "tools/list");
            write_json(
                &mut to_client,
                &json!({
                    "jsonrpc": "2.0",
                    "id": p1["id"],
                    "result": {
                        "tools": [{ "name": "a", "description": "tool a", "inputSchema": {"type": "object"} }],
                        "nextCursor": "c1"
                    }
                }),
            )
            .await;

            let p2 = read_json(&mut from_client).await;
            assert_eq!(p2["method"], "tools/list");
            assert_eq!(p2["params"]["cursor"], "c1");
            write_json(
                &mut to_client,
                &json!({
                    "jsonrpc": "2.0",
                    "id": p2["id"],
                    "result": {
                        "tools": [{ "name": "b", "inputSchema": {"type": "object"} }]
                    }
                }),
            )
            .await;
        });

        let tools = client.list_tools(Duration::from_secs(5), &cancel).await.unwrap();
        let names: Vec<&str> = tools.iter().map(|t| t.name.as_str()).collect();
        assert_eq!(names, vec!["a", "b"]);
        srv.await.unwrap();
    }

    #[tokio::test]
    async fn call_tool_flattens_content() {
        let (client, mut from_client, mut to_client) = pair();
        let cancel = CancellationToken::new();

        let srv = tokio::spawn(async move {
            let req = read_json(&mut from_client).await;
            assert_eq!(req["method"], "tools/call");
            assert_eq!(req["params"]["name"], "echo");
            assert_eq!(req["params"]["arguments"], json!({"text": "hi"}));
            write_json(
                &mut to_client,
                &json!({
                    "jsonrpc": "2.0",
                    "id": req["id"],
                    "result": {
                        "content": [
                            {"type": "text", "text": "one"},
                            {"type": "image", "mimeType": "image/png", "data": "AAAA"},
                            {"type": "resource_link", "uri": "file:///x"}
                        ],
                        "isError": true
                    }
                }),
            )
            .await;
        });

        let result = client
            .call_tool("echo", json!({"text": "hi"}), Duration::from_secs(5), &cancel)
            .await
            .unwrap();
        assert_eq!(
            result,
            CallResult {
                text: "one\n[image image/png, not shown]\n[link file:///x]".to_string(),
                is_error: true,
            }
        );
        assert_eq!(
            flatten(&json!([
                {"type": "audio", "mimeType": "audio/wav"},
                {"type": "resource", "resource": {"text": "inline", "uri": "file:///a"}},
                {"type": "resource", "resource": {"uri": "file:///b"}},
                {"type": "other"}
            ])),
            "[audio audio/wav, not shown]\ninline\n[file file:///b, not shown]\n[content not shown]"
        );
        assert_eq!(flatten(&json!("not an array")), "[content not shown]");
        srv.await.unwrap();
    }

    #[test]
    fn error_display_texts() {
        assert_eq!(
            McpError::Start {
                message: "not found".into()
            }
            .to_string(),
            "The server could not be started: not found"
        );
        assert_eq!(
            McpError::Closed {
                stderr: String::new()
            }
            .to_string(),
            "The server stopped."
        );
        assert_eq!(
            McpError::Closed {
                stderr: "boom".into()
            }
            .to_string(),
            "The server stopped. Its last output: boom"
        );
        assert_eq!(
            McpError::Timeout.to_string(),
            "The server did not answer in time."
        );
        assert_eq!(McpError::Stopped.to_string(), "Stopped.");
        assert_eq!(
            McpError::Protocol {
                message: "bad json".into()
            }
            .to_string(),
            "The server sent something unexpected: bad json"
        );
        assert_eq!(
            McpError::Rpc {
                code: -32602,
                message: "Unknown tool".into()
            }
            .to_string(),
            "The server refused: Unknown tool"
        );
    }
}

