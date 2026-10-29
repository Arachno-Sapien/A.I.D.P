use crate::gateway::http::{
    list_error, map_http_error, map_reqwest_error, read_sse, Step, LIST_TIMEOUT,
};
use crate::gateway::{
    ChatEvent, ChatRequest, ModelInfo, ModelProvider, ProviderError, Role, Usage,
};
use async_trait::async_trait;
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
            base_url,
            api_key,
        }
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

#[derive(Deserialize)]
#[serde(tag = "type")]
enum StreamEvent {
    #[serde(rename = "message_start")]
    MessageStart {
        message: Option<MessageStartPayload>,
    },
    #[serde(rename = "content_block_delta")]
    ContentBlockDelta {
        delta: Option<DeltaPayload>,
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
struct DeltaPayload {
    #[serde(rename = "type")]
    delta_type: Option<String>,
    text: Option<String>,
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
            .header("x-api-key", self.api_key.expose_secret())
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
    ) -> Result<Usage, ProviderError> {
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

        let mut body_map = serde_json::Map::new();
        body_map.insert("model".to_string(), json!(req.model));
        body_map.insert("stream".to_string(), json!(true));
        body_map.insert("max_tokens".to_string(), json!(8192));
        if !system_parts.is_empty() {
            body_map.insert("system".to_string(), json!(system_parts.join("\n\n")));
        }
        body_map.insert("messages".to_string(), json!(anthropic_messages));
        let body_json = serde_json::Value::Object(body_map);

        let url = format!("{}/messages", self.base_url);
        let request = self
            .client
            .post(&url)
            .header("x-api-key", self.api_key.expose_secret())
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
            let body = resp.text().await.unwrap_or_default();
            return Err(map_http_error(
                status.as_u16(),
                retry_after.as_deref(),
                &body,
            ));
        }

        let mut usage = Usage::default();

        read_sse(resp, &cancel, |payload| {
            let event = match serde_json::from_str::<StreamEvent>(payload) {
                Ok(ev) => ev,
                Err(_) => return Ok(Step::Continue),
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
                StreamEvent::ContentBlockDelta { delta } => {
                    if let Some(d) = delta
                        && d.delta_type.as_deref() == Some("text_delta")
                        && let Some(text) = d.text
                    {
                        let _ = out.send(ChatEvent::Delta(text));
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
                        && d.stop_reason.as_deref() == Some("refusal")
                    {
                        return Err(ProviderError::Provider {
                            message: "The model declined to answer this request.".to_string(),
                        });
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

        Ok(usage)
    }
}

