use crate::gateway::{
    sse::SseLines, ChatEvent, ChatRequest, ModelProvider, ProviderError, Usage,
};
use async_trait::async_trait;
use futures_util::StreamExt;
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
    pub fn new(base_url: String, api_key: SecretString) -> Self {
        Self {
            client: reqwest::Client::new(),
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
struct StreamChunk {
    #[serde(default)]
    choices: Vec<ChunkChoice>,
    usage: Option<ChunkUsage>,
}

#[derive(Deserialize)]
struct ErrorEnvelope {
    error: Option<ErrorMessage>,
}

#[derive(Deserialize)]
struct ErrorMessage {
    message: Option<String>,
}

fn parse_error_detail(body: &str) -> String {
    let msg = serde_json::from_str::<ErrorEnvelope>(body)
        .ok()
        .and_then(|e| e.error)
        .and_then(|e| e.message)
        .unwrap_or_else(|| body.to_string());

    let char_count = msg.chars().count();
    if char_count > 200 {
        msg.chars().take(200).collect()
    } else {
        msg
    }
}

fn map_http_error(status: u16, retry_after: Option<&str>, body: &str) -> ProviderError {
    match status {
        401 | 403 => ProviderError::InvalidKey,
        429 => ProviderError::RateLimited {
            retry_after_secs: retry_after.and_then(|h| h.trim().parse::<u32>().ok()),
        },
        404 => ProviderError::ModelNotFound,
        400 if body.contains("context_length_exceeded")
            || body.contains("maximum context length") =>
        {
            ProviderError::ContextTooLong
        }
        _ => {
            let detail = parse_error_detail(body);
            ProviderError::Provider {
                message: format!("HTTP {status}: {detail}"),
            }
        }
    }
}

fn map_reqwest_error(e: reqwest::Error) -> ProviderError {
    if e.is_connect() || e.is_timeout() {
        ProviderError::Offline
    } else {
        ProviderError::Provider {
            message: e.to_string(),
        }
    }
}

#[async_trait]
impl ModelProvider for OpenAiCompat {
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

        let mut stream = resp.bytes_stream();
        let mut sse_lines = SseLines::default();
        let mut final_usage = Usage::default();
        let mut done_received = false;

        while !done_received {
            let next_chunk = match cancel.run_until_cancelled(stream.next()).await {
                Some(Some(Ok(bytes))) => bytes,
                Some(Some(Err(_))) => {
                    return Err(ProviderError::Provider {
                        message: "the connection closed before the reply finished".to_string(),
                    });
                }
                Some(None) => break,
                None => return Err(ProviderError::Cancelled),
            };

            let lines = sse_lines.push(&next_chunk);
            for line in lines {
                if line == "[DONE]" {
                    done_received = true;
                    break;
                }

                let chunk: StreamChunk = match serde_json::from_str(&line) {
                    Ok(c) => c,
                    Err(_) => {
                        return Err(ProviderError::Provider {
                            message: "the provider sent data the app could not read".to_string(),
                        });
                    }
                };

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
            }
        }

        if !done_received && sse_lines.finish().as_deref() == Some("[DONE]") {
            done_received = true;
        }

        if !done_received {
            return Err(ProviderError::Provider {
                message: "the connection closed before the reply finished".to_string(),
            });
        }

        Ok(final_usage)
    }
}

