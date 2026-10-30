use crate::gateway::http::{map_http_error, map_reqwest_error, read_json_lines, Step};
use crate::gateway::{
    ChatEvent, ChatRequest, ModelInfo, ModelProvider, ProviderError, Reply, ToolCall, Usage,
};
use crate::ollama::Ollama;
use async_trait::async_trait;
use serde_json::json;
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

const CUT_OFF_TOOL_ERROR: &str = "The reply was cut off before its tool call was complete.";

pub struct OllamaChat {
    client: reqwest::Client,
    base_url: String,
}

impl OllamaChat {
    pub fn new(client: reqwest::Client, base_url: String) -> Self {
        Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
        }
    }
}

#[async_trait]
impl ModelProvider for OllamaChat {
    async fn list_models(&self) -> Result<Vec<ModelInfo>, ProviderError> {
        let ollama = Ollama::new(self.client.clone(), self.base_url.clone());
        let tags = ollama.tags().await?;
        let models = tags
            .into_iter()
            .map(|m| ModelInfo {
                id: m.name.clone(),
                display_name: m.name,
                context_window: None,
                supports_tools: None,
            })
            .collect();
        Ok(models)
    }

    async fn test_connection(&self) -> Result<(), ProviderError> {
        let ollama = Ollama::new(self.client.clone(), self.base_url.clone());
        ollama.version().await.map(|_| ())
    }

    async fn stream_chat(
        &self,
        req: ChatRequest,
        out: Channel<ChatEvent>,
        cancel: CancellationToken,
    ) -> Result<Reply, ProviderError> {
        let url = format!("{}/api/chat", self.base_url);

        let mut messages = Vec::new();
        for m in &req.messages {
            messages.push(json!({
                "role": m.role.as_str(),
                "content": m.content,
            }));
        }

        for round in &req.rounds {
            messages.push(round.assistant.clone());

            let round_tool_calls = round
                .assistant
                .get("tool_calls")
                .and_then(|v| v.as_array());

            for (idx, result) in round.results.iter().enumerate() {
                let tool_name = round_tool_calls
                    .and_then(|arr| arr.get(idx))
                    .and_then(|c| c.get("function"))
                    .and_then(|f| f.get("name"))
                    .and_then(|n| n.as_str())
                    .unwrap_or("");

                let content = if result.is_error {
                    format!("Error: {}", result.content)
                } else {
                    result.content.clone()
                };

                messages.push(json!({
                    "role": "tool",
                    "tool_name": tool_name,
                    "content": content,
                }));
            }
        }

        let mut body = json!({
            "model": req.model,
            "messages": messages,
            "stream": true,
        });

        if !req.tools.is_empty() {
            let tools_json = req
                .tools
                .iter()
                .map(|t| {
                    json!({
                        "type": "function",
                        "function": {
                            "name": t.name,
                            "description": t.description,
                            "parameters": t.schema,
                        }
                    })
                })
                .collect::<Vec<_>>();
            body["tools"] = json!(tools_json);
        }

        if let Some(num_ctx) = req.local.num_ctx {
            body["options"] = json!({ "num_ctx": num_ctx });
        }

        if let Some(keep_alive) = req.local.keep_alive {
            body["keep_alive"] = json!(keep_alive);
        }

        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(map_reqwest_error)?;

        let status = resp.status();
        if !status.is_success() {
            let status_code = status.as_u16();
            let retry_after = resp
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .map(String::from);
            let body_text = resp.text().await.unwrap_or_default();

            // 404 → ModelNotFound and "does not support tools" → TOOLS_UNSUPPORTED
            // are mapped there; the status decides, not words in the body.
            return Err(map_http_error(
                status_code,
                retry_after.as_deref(),
                &body_text,
            ));
        }

        let mut accumulated_content = String::new();
        let mut accumulated_thinking = String::new();
        let mut tool_calls = Vec::new();
        let mut raw_tool_calls = Vec::new();
        let mut tokens_in = None;
        let mut tokens_out = None;

        read_json_lines(resp, &cancel, |line| {
            let val: serde_json::Value =
                serde_json::from_str(line).map_err(|e| ProviderError::Provider {
                    message: e.to_string(),
                })?;

            if let Some(err) = val.get("error").and_then(|v| v.as_str()) {
                return Err(ProviderError::Provider {
                    message: err.to_string(),
                });
            }

            if let Some(msg) = val.get("message") {
                if let Some(content) = msg.get("content").and_then(|v| v.as_str())
                    && !content.is_empty()
                {
                    accumulated_content.push_str(content);
                    out.send(ChatEvent::Delta(content.to_string()))
                        .map_err(|_| ProviderError::Cancelled)?;
                }

                if let Some(thinking) = msg.get("thinking").and_then(|v| v.as_str())
                    && !thinking.is_empty()
                {
                    accumulated_thinking.push_str(thinking);
                }

                if let Some(tcs) = msg.get("tool_calls").and_then(|v| v.as_array()) {
                    for call in tcs {
                        let fn_obj = call.get("function").unwrap_or(call);
                        let name = fn_obj
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let raw_args =
                            fn_obj.get("arguments").cloned().unwrap_or(serde_json::Value::Null);

                        let input = match &raw_args {
                            serde_json::Value::Object(_) => raw_args.clone(),
                            serde_json::Value::String(s) => serde_json::from_str(s)
                                .unwrap_or_else(|_| serde_json::Value::String(s.clone())),
                            other => other.clone(),
                        };

                        // Ollama parses replayed arguments into a map and rejects
                        // anything else, so the replay always carries an object.
                        let replay_args = if input.is_object() {
                            input.clone()
                        } else {
                            json!({})
                        };

                        let call_id = format!("call_{}", tool_calls.len());
                        tool_calls.push(ToolCall {
                            id: call_id,
                            name: name.clone(),
                            input,
                        });

                        raw_tool_calls.push(json!({
                            "function": {
                                "name": name,
                                "arguments": replay_args,
                            }
                        }));
                    }
                }
            }

            if val.get("done").and_then(|v| v.as_bool()).unwrap_or(false) {
                if let Some(tin) = val.get("prompt_eval_count").and_then(|v| v.as_u64()) {
                    tokens_in = Some(tin as u32);
                }
                if let Some(tout) = val.get("eval_count").and_then(|v| v.as_u64()) {
                    tokens_out = Some(tout as u32);
                }

                if let Some(reason) = val.get("done_reason").and_then(|v| v.as_str())
                    && reason == "length"
                    && !tool_calls.is_empty()
                {
                    return Err(ProviderError::Provider {
                        message: CUT_OFF_TOOL_ERROR.to_string(),
                    });
                }

                return Ok(Step::Done);
            }

            Ok(Step::Continue)
        })
        .await?;

        let mut assistant_map = serde_json::Map::new();
        assistant_map.insert("role".to_string(), json!("assistant"));
        assistant_map.insert("content".to_string(), json!(accumulated_content));
        if !accumulated_thinking.is_empty() {
            assistant_map.insert("thinking".to_string(), json!(accumulated_thinking));
        }
        if !raw_tool_calls.is_empty() {
            assistant_map.insert(
                "tool_calls".to_string(),
                serde_json::Value::Array(raw_tool_calls),
            );
        }
        let assistant = serde_json::Value::Object(assistant_map);

        Ok(Reply {
            usage: Usage {
                tokens_in,
                tokens_out,
            },
            tool_calls,
            assistant,
        })
    }
}
