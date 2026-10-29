use crate::gateway::sse::SseLines;
use crate::gateway::ProviderError;
use futures_util::StreamExt;
use std::time::Duration;
use tokio_util::sync::CancellationToken;

pub const LIST_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, PartialEq, Eq)]
pub enum Step {
    Continue,
    Done,
}

#[derive(serde::Deserialize)]
struct ErrorEnvelope {
    error: Option<ErrorMessage>,
}

#[derive(serde::Deserialize)]
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

pub fn map_http_error(status: u16, retry_after: Option<&str>, body: &str) -> ProviderError {
    match status {
        401 | 403 => ProviderError::InvalidKey,
        404 => ProviderError::ModelNotFound,
        413 => ProviderError::ContextTooLong,
        429 => ProviderError::RateLimited {
            retry_after_secs: retry_after.and_then(|h| h.trim().parse::<u32>().ok()),
        },
        400 if body.contains("context_length_exceeded")
            || body.contains("maximum context length")
            || body.contains("prompt is too long") =>
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

pub fn list_error(e: ProviderError) -> ProviderError {
    if matches!(e, ProviderError::ModelNotFound) {
        ProviderError::Provider {
            message: "the provider has no models endpoint at this URL (HTTP 404). Check the base URL.".to_string(),
        }
    } else {
        e
    }
}

pub fn map_reqwest_error(e: reqwest::Error) -> ProviderError {
    if e.is_connect() || e.is_timeout() {
        ProviderError::Offline
    } else {
        ProviderError::Provider {
            message: e.to_string(),
        }
    }
}

pub async fn read_sse(
    resp: reqwest::Response,
    cancel: &CancellationToken,
    mut on_data: impl FnMut(&str) -> Result<Step, ProviderError>,
) -> Result<(), ProviderError> {
    let mut stream = resp.bytes_stream();
    let mut sse_lines = SseLines::default();
    let mut done = false;

    while !done {
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
            match on_data(&line)? {
                Step::Done => {
                    done = true;
                    break;
                }
                Step::Continue => {}
            }
        }
    }

    if !done && let Some(tail) = sse_lines.finish() {
        done = matches!(on_data(&tail)?, Step::Done);
    }

    if !done {
        return Err(ProviderError::Provider {
            message: "the connection closed before the reply finished".to_string(),
        });
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn map_http_error_table() {
        assert_eq!(map_http_error(401, None, ""), ProviderError::InvalidKey);
        assert_eq!(map_http_error(403, None, ""), ProviderError::InvalidKey);
        assert_eq!(map_http_error(404, None, ""), ProviderError::ModelNotFound);
        assert_eq!(
            map_http_error(429, Some("7"), ""),
            ProviderError::RateLimited {
                retry_after_secs: Some(7)
            }
        );
        assert_eq!(
            map_http_error(413, None, ""),
            ProviderError::ContextTooLong
        );
        assert_eq!(
            map_http_error(400, None, "prompt is too long: 250000 tokens"),
            ProviderError::ContextTooLong
        );
        assert_eq!(
            map_http_error(400, None, "maximum context length exceeded"),
            ProviderError::ContextTooLong
        );
        assert_eq!(
            map_http_error(500, None, r#"{"error":{"message":"boom"}}"#),
            ProviderError::Provider {
                message: "HTTP 500: boom".to_string()
            }
        );
    }
}

