use crate::gateway::http::{
    list_error, map_http_error, map_reqwest_error, read_sse, Step, LIST_TIMEOUT,
};
use crate::gateway::{
    ChatEvent, ChatRequest, ModelInfo, ModelProvider, ProviderError, Reply, Role, Usage,
};
use async_trait::async_trait;
use reqwest::header::HeaderValue;
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;
use serde_json::json;
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

pub fn map_error_type(r#type: &str, message: &str) -> ProviderError {
    match r#type {
        "authentication_error" | "permission_error" => ProviderError::InvalidKey,
        "rate_limit_error" => ProviderError::RateLimited {
            retry_after_secs: None,
        },
        "not_found_error" => ProviderError::ModelNotFound,
        _ => ProviderError::Provider {
            message: message.to_string(),
        },
    }
}

pub struct Anthropic {
    client: reqwest::Client,
    base_url: String,
    api_key: SecretString,
}

impl Anthropic {
    pub fn new(client: reqwest::Client, base_url: String, api_key: SecretString) -> Self {
        Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key,
        }
    }

    fn key_header(&self) -> Result<HeaderValue, ProviderError> {
        let mut value = HeaderValue::from_str(self.api_key.expose_secret())
            .map_err(|_| ProviderError::InvalidKey)?;
        value.set_sensitive(true);
        Ok(value)
    }
}

#[derive(Deserialize)]
struct ModelsResponse {
    data: Vec<ModelEntry>,
}

#[derive(Deserialize)]
struct ModelEntry {
    id: String,
    display_name: Option<String>,
    max_input_tokens: Option<u32>,
}

const MAX_TOKENS: u32 = 8192;
const MAX_TOKENS_WITH_TOOLS: u32 = 32000;

#[derive(Deserialize)]
#[serde(tag = "type")]
enum StreamEvent {
    #[serde(rename = "message_start")]
    MessageStart {
        message: Option<MessageStartPayload>,
    },
    #[serde(rename = "content_block_start")]
    ContentBlockStart {
        index: u32,
        content_block: serde_json::Value,
    },
    #[serde(rename = "content_block_delta")]
    ContentBlockDelta {
        index: u32,
        delta: serde_json::Value,
    },
    #[serde(rename = "content_block_stop")]
    ContentBlockStop {
        index: u32,
    },
    #[serde(rename = "message_delta")]
    MessageDelta {
        delta: Option<MessageDeltaPayload>,
        usage: Option<OutputUsagePayload>,
    },
    #[serde(rename = "error")]
    Error {
        error: Option<ErrorPayload>,
    },
    #[serde(rename = "message_stop")]
    MessageStop,
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
struct MessageStartPayload {
    usage: Option<InputUsagePayload>,
}

#[derive(Deserialize)]
struct InputUsagePayload {
    input_tokens: Option<u32>,
}

#[derive(Deserialize)]
struct OutputUsagePayload {
    output_tokens: Option<u32>,
}

#[derive(Deserialize)]
struct MessageDeltaPayload {
    stop_reason: Option<String>,
}

#[derive(Deserialize)]
struct ErrorPayload {
    #[serde(rename = "type")]
    error_type: Option<String>,
    message: Option<String>,
}

#[async_trait]
impl ModelProvider for Anthropic {
    async fn list_models(&self) -> Result<Vec<ModelInfo>, ProviderError> {
        let url = format!("{}/models?limit=1000", self.base_url);
        let resp = self
            .client
            .get(&url)
            .header("x-api-key", self.key_header()?)
            .header("anthropic-version", "2026-10-21")
            .timeout(LIST_TIMEOUT)
            .send()
            .await
            .map_err(map_reqwest_error)?;

        let status = resp.status();
        let retry_after = resp
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            let err = map_http_error(status.as_u16(), retry_after.as_deref(), &body);
            return Err(list_error(err));
        }

        let body = resp.text().await.map_err(map_reqwest_error)?;
        let parsed: ModelsResponse = serde_json::from_str(&body).map_err(|e| {
            ProviderError::Provider {
                message: format!("failed to parse models response: {e}"),
            }
        })?;

        let mut models: Vec<ModelInfo> = parsed
            .data
            .into_iter()
            .map(|entry| ModelInfo {
                display_name: entry.display_name.unwrap_or_else(|| entry.id.clone()),
                id: entry.id,
                context_window: entry.max_input_tokens,
                supports_tools: Some(true),
            })
            .collect();

        models.sort_by(|a, b| a.id.cmp(&b.id));
        Ok(models)
    }

    async fn stream_chat(
        &self,
        req: ChatRequest,
        out: Channel<ChatEvent>,
        cancel: CancellationToken,
    ) -> Result<Reply, ProviderError> {
        let mut system_parts = Vec::new();
        let mut anthropic_messages = Vec::new();

        for msg in &req.messages {
            match msg.role {
                Role::System => system_parts.push(msg.content.as_str()),
                Role::User => anthropic_messages.push(json!({
                    "role": "user",
                    "content": &msg.content,
                })),
                Role::Assistant => anthropic_messages.push(json!({
                    "role": "assistant",
                    "content": &msg.content,
                })),
            }
        }

        for round in req.rounds {
            anthropic_messages.push(round.assistant);
            let results_val: Vec<serde_json::Value> = round
                .results
                .into_iter()
                .map(|res| {
                    let mut obj = json!({
                        "type": "tool_result",
                        "tool_use_id": res.call_id,
                        "content": res.content,
                    });
                    if res.is_error {
                        obj["is_error"] = json!(true);
                    }
                    obj
                })
                .collect();
            anthropic_messages.push(json!({
                "role": "user",
                "content": results_val,
            }));
        }

        let max_tokens = if req.tools.is_empty() {
            MAX_TOKENS
        } else {
            MAX_TOKENS_WITH_TOOLS
        };

        let mut body_map = serde_json::Map::new();
        body_map.insert("model".to_string(), json!(req.model));
        body_map.insert("stream".to_string(), json!(true));
        body_map.insert("max_tokens".to_string(), json!(max_tokens));
        if !system_parts.is_empty() {
            body_map.insert("system".to_string(), json!(system_parts.join("\n\n")));
        }
        body_map.insert("messages".to_string(), json!(anthropic_messages));

        if !req.tools.is_empty() {
            let tools_val: Vec<serde_json::Value> = req
                .tools
                .into_iter()
                .map(|spec| {
                    json!({
                        "name": spec.name,
                        "description": spec.description,
                        "input_schema": spec.schema,
                    })
                })
                .collect();
            body_map.insert("tools".to_string(), json!(tools_val));
        }

        let body_json = serde_json::Value::Object(body_map);

        let url = format!("{}/messages", self.base_url);
        let request = self
            .client
            .post(&url)
            .header("x-api-key", self.key_header()?)
            .header("anthropic-version", "2026-10-21")
            .header("content-type", "application/json")
            .json(&body_json);

        let resp = match cancel.run_until_cancelled(request.send()).await {
            Some(res) => res.map_err(map_reqwest_error)?,
            None => return Err(ProviderError::Cancelled),
        };

        let status = resp.status();
        let retry_after = resp
            .headers()
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string());

        if !status.is_success() {
            let body = match cancel.run_until_cancelled(resp.text()).await {
                Some(text) => text.unwrap_or_default(),
                None => return Err(ProviderError::Cancelled),
            };
            return Err(map_http_error(
                status.as_u16(),
                retry_after.as_deref(),
                &body,
            ));
        }

        let mut usage = Usage::default();
        let mut blocks: std::collections::BTreeMap<u32, serde_json::Value> =
            std::collections::BTreeMap::new();
        let mut input_buffers: std::collections::BTreeMap<u32, String> =
            std::collections::BTreeMap::new();
        let mut tool_call_inputs: std::collections::BTreeMap<u32, serde_json::Value> =
            std::collections::BTreeMap::new();
        let mut last_stop_reason: Option<String> = None;

        read_sse(resp, &cancel, |payload| {
            let event = match serde_json::from_str::<StreamEvent>(payload) {
                Ok(ev) => ev,
                // Valid JSON in a shape we don't know is a newer event: skip it.
                Err(_) if serde_json::from_str::<serde::de::IgnoredAny>(payload).is_ok() => {
                    return Ok(Step::Continue);
                }
                Err(_) => {
                    return Err(ProviderError::Provider {
                        message: "the provider sent data the app could not read".to_string(),
                    });
                }
            };

            match event {
                StreamEvent::MessageStart { message } => {
                    if let Some(m) = message
                        && let Some(u) = m.usage
                    {
                        usage.tokens_in = u.input_tokens;
                    }
                    Ok(Step::Continue)
                }
                StreamEvent::ContentBlockStart {
                    index,
                    content_block,
                } => {
                    blocks.insert(index, content_block);
                    Ok(Step::Continue)
                }
                StreamEvent::ContentBlockDelta { index, delta } => {
                    let delta_type = delta
                        .get("type")
                        .and_then(|t| t.as_str())
                        .unwrap_or_default();
                    match delta_type {
                        "text_delta" => {
                            if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                                if let Some(block) = blocks.get_mut(&index) {
                                    if let Some(cur) =
                                        block.get_mut("text").and_then(|t| t.as_str())
                                    {
                                        let updated = format!("{cur}{text}");
                                        block["text"] = serde_json::Value::String(updated);
                                    } else {
                                        block["text"] =
                                            serde_json::Value::String(text.to_string());
                                    }
                                }
                                if out.send(ChatEvent::Delta(text.to_string())).is_err() {
                                    return Err(ProviderError::Cancelled);
                                }
                            }
                        }
                        "thinking_delta" => {
                            if let Some(th) = delta.get("thinking").and_then(|t| t.as_str())
                                && let Some(block) = blocks.get_mut(&index)
                            {
                                if let Some(cur) =
                                    block.get_mut("thinking").and_then(|t| t.as_str())
                                {
                                    let updated = format!("{cur}{th}");
                                    block["thinking"] = serde_json::Value::String(updated);
                                } else {
                                    block["thinking"] =
                                        serde_json::Value::String(th.to_string());
                                }
                            }
                        }
                        "signature_delta" => {
                            if let Some(sig) = delta.get("signature").and_then(|t| t.as_str())
                                && let Some(block) = blocks.get_mut(&index)
                            {
                                if let Some(cur) =
                                    block.get_mut("signature").and_then(|t| t.as_str())
                                {
                                    let updated = format!("{cur}{sig}");
                                    block["signature"] = serde_json::Value::String(updated);
                                } else {
                                    block["signature"] =
                                        serde_json::Value::String(sig.to_string());
                                }
                            }
                        }
                        "input_json_delta" => {
                            if let Some(pj) = delta.get("partial_json").and_then(|t| t.as_str()) {
                                input_buffers.entry(index).or_default().push_str(pj);
                            }
                        }
                        _ => {}
                    }
                    Ok(Step::Continue)
                }
                StreamEvent::ContentBlockStop { index } => {
                    if let Some(block) = blocks.get_mut(&index)
                        && block.get("type").and_then(|t| t.as_str()) == Some("tool_use")
                    {
                        let raw = input_buffers.remove(&index).unwrap_or_default();
                        let parsed = if raw.trim().is_empty() {
                            Ok(json!({}))
                        } else {
                            serde_json::from_str::<serde_json::Value>(&raw)
                        };
                        match parsed {
                            Ok(val) => {
                                block["input"] = val.clone();
                                tool_call_inputs.insert(index, val);
                            }
                            Err(_) => {
                                block["input"] = json!({});
                                tool_call_inputs
                                    .insert(index, serde_json::Value::String(raw));
                            }
                        }
                    }
                    Ok(Step::Continue)
                }
                StreamEvent::MessageDelta { delta, usage: u_out } => {
                    if let Some(u) = u_out
                        && u.output_tokens.is_some()
                    {
                        usage.tokens_out = u.output_tokens;
                    }
                    if let Some(d) = delta
                        && let Some(reason) = d.stop_reason
                    {
                        if reason == "refusal" {
                            return Err(ProviderError::Provider {
                                message: "The model declined to answer this request.".to_string(),
                            });
                        }
                        last_stop_reason = Some(reason);
                    }
                    Ok(Step::Continue)
                }
                StreamEvent::Error { error } => {
                    if let Some(err) = error {
                        let err_type = err.error_type.as_deref().unwrap_or("unknown");
                        let err_msg = err.message.as_deref().unwrap_or("error");
                        Err(map_error_type(err_type, err_msg))
                    } else {
                        Err(ProviderError::Provider {
                            message: "error event".to_string(),
                        })
                    }
                }
                StreamEvent::MessageStop => Ok(Step::Done),
                StreamEvent::Other => Ok(Step::Continue),
            }
        })
        .await?;

        let has_tool_use = blocks
            .values()
            .any(|b| b.get("type").and_then(|t| t.as_str()) == Some("tool_use"));

        if last_stop_reason.as_deref() == Some("max_tokens") && has_tool_use {
            return Err(ProviderError::Provider {
                message: "The reply was cut off before its tool call was complete.".to_string(),
            });
        }

        let mut tool_calls = Vec::new();
        let mut content_array = Vec::new();

        for (idx, block) in blocks {
            if block.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                let id = block
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                let name = block
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();
                let input = tool_call_inputs
                    .remove(&idx)
                    .or_else(|| block.get("input").cloned())
                    .unwrap_or_else(|| json!({}));

                tool_calls.push(crate::gateway::ToolCall { id, name, input });
            }
            content_array.push(block);
        }

        let assistant = json!({
            "role": "assistant",
            "content": content_array,
        });

        Ok(Reply {
            usage,
            tool_calls,
            assistant,
        })
    }
}

