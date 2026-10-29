use crate::gateway::http::{
    list_error, map_http_error, map_reqwest_error, read_sse, Step, LIST_TIMEOUT,
};
use crate::gateway::{ChatEvent, ChatRequest, ModelInfo, ModelProvider, ProviderError, Usage};
use async_trait::async_trait;
use reqwest::header::HeaderValue;
use secrecy::{ExposeSecret, SecretString};
use serde::Deserialize;
use serde_json::json;
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

pub struct OpenAiCompat {
    client: reqwest::Client,
    base_url: String,
    api_key: SecretString,
}

impl OpenAiCompat {
    pub fn new(client: reqwest::Client, base_url: String, api_key: SecretString) -> Self {
        Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key,
        }
    }
}

#[derive(Deserialize)]
struct ChunkChoiceDelta {
    content: Option<String>,
}

#[derive(Deserialize)]
struct ChunkChoice {
    delta: Option<ChunkChoiceDelta>,
}

#[derive(Deserialize)]
struct ChunkUsage {
    prompt_tokens: Option<u32>,
    completion_tokens: Option<u32>,
}

#[derive(Deserialize)]
struct ErrorMessage {
    message: Option<String>,
}

#[derive(Deserialize)]
struct StreamChunk {
    #[serde(default)]
    choices: Vec<ChunkChoice>,
    usage: Option<ChunkUsage>,
    error: Option<ErrorMessage>,
}

#[async_trait]
impl ModelProvider for OpenAiCompat {
    async fn list_models(&self) -> Result<Vec<ModelInfo>, ProviderError> {
        let url = format!("{}/models", self.base_url);
        let mut auth_header =
            match HeaderValue::from_str(&format!("Bearer {}", self.api_key.expose_secret())) {
                Ok(val) => val,
                Err(_) => return Err(ProviderError::InvalidKey),
            };
        auth_header.set_sensitive(true);

        let request = self
            .client
            .get(&url)
            .header(reqwest::header::AUTHORIZATION, auth_header)
            .timeout(LIST_TIMEOUT);

        let resp = match request.send().await {
            Ok(r) => r,
            Err(err) => return Err(map_reqwest_error(err)),
        };

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let retry_after = resp
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
            let body_text = resp.text().await.unwrap_or_default();
            let err = map_http_error(status, retry_after.as_deref(), &body_text);
            return Err(list_error(err));
        }

        #[derive(Deserialize)]
        struct ModelItem {
            id: Option<String>,
            name: Option<String>,
            context_length: Option<u32>,
        }

        #[derive(Deserialize)]
        struct ModelsResponse {
            #[serde(default)]
            data: Vec<ModelItem>,
        }

        let body = match resp.json::<ModelsResponse>().await {
            Ok(b) => b,
            Err(_) => {
                return Err(ProviderError::Provider {
                    message: "the provider sent data the app could not read".to_string(),
                });
            }
        };

        let mut models: Vec<ModelInfo> = body
            .data
            .into_iter()
            .filter_map(|m| {
                let id = m.id?;
                let display_name = m.name.unwrap_or_else(|| id.clone());
                Some(ModelInfo {
                    id,
                    display_name,
                    context_window: m.context_length,
                })
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
        let url = format!("{}/chat/completions", self.base_url);

        let mut auth_header =
            match HeaderValue::from_str(&format!("Bearer {}", self.api_key.expose_secret())) {
                Ok(val) => val,
                Err(_) => return Err(ProviderError::InvalidKey),
            };
        auth_header.set_sensitive(true);

        let body = json!({
            "model": req.model,
            "messages": req.messages,
            "stream": true,
        });

        let request = self
            .client
            .post(&url)
            .header(reqwest::header::AUTHORIZATION, auth_header)
            .json(&body);

        let send_fut = request.send();
        let resp = match cancel.run_until_cancelled(send_fut).await {
            Some(Ok(resp)) => resp,
            Some(Err(err)) => return Err(map_reqwest_error(err)),
            None => return Err(ProviderError::Cancelled),
        };

        if !resp.status().is_success() {
            let status = resp.status().as_u16();
            let retry_after = resp
                .headers()
                .get(reqwest::header::RETRY_AFTER)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());

            let text_fut = resp.text();
            let body_text = match cancel.run_until_cancelled(text_fut).await {
                Some(Ok(text)) => text,
                Some(Err(_)) => String::new(),
                None => return Err(ProviderError::Cancelled),
            };

            return Err(map_http_error(status, retry_after.as_deref(), &body_text));
        }

        let mut final_usage = Usage::default();

        let on_data = |line: &str| -> Result<Step, ProviderError> {
            if line == "[DONE]" {
                return Ok(Step::Done);
            }

            let chunk: StreamChunk = match serde_json::from_str(line) {
                Ok(c) => c,
                Err(_) => {
                    return Err(ProviderError::Provider {
                        message: "the provider sent data the app could not read".to_string(),
                    });
                }
            };

            if let Some(err) = chunk.error {
                let msg = err.message.unwrap_or_else(|| {
                    "the provider reported an error during the reply".to_string()
                });
                return Err(ProviderError::Provider {
                    message: if msg.chars().count() > 200 {
                        msg.chars().take(200).collect()
                    } else {
                        msg
                    },
                });
            }

            if let Some(usage) = chunk.usage {
                if usage.prompt_tokens.is_some() {
                    final_usage.tokens_in = usage.prompt_tokens;
                }
                if usage.completion_tokens.is_some() {
                    final_usage.tokens_out = usage.completion_tokens;
                }
            }

            if let Some(content) = chunk
                .choices
                .first()
                .and_then(|c| c.delta.as_ref())
                .and_then(|d| d.content.as_deref())
                && !content.is_empty()
                && out.send(ChatEvent::Delta(content.to_string())).is_err()
            {
                return Err(ProviderError::Cancelled);
            }

            Ok(Step::Continue)
        };

        read_sse(resp, &cancel, on_data).await?;

        Ok(final_usage)
    }
}
