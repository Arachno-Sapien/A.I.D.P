use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

pub mod openai_compat;
pub mod sse;

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    System,
    User,
    Assistant,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub tokens_in: Option<u32>,
    pub tokens_out: Option<u32>,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ProviderError {
    InvalidKey,
    RateLimited {
        #[serde(rename = "retryAfterSecs")]
        retry_after_secs: Option<u32>,
    },
    ModelNotFound,
    ContextTooLong,
    Offline,
    Provider {
        message: String,
    },
    Cancelled,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum ChatEvent {
    Delta(String),
    Done(Usage),
    Error(ProviderError),
}

#[async_trait]
pub trait ModelProvider: Send + Sync {
    async fn stream_chat(
        &self,
        req: ChatRequest,
        out: Channel<ChatEvent>,
        cancel: CancellationToken,
    ) -> Result<Usage, ProviderError>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chat_event_json_shape() {
        assert_eq!(
            serde_json::to_string(&ChatEvent::Delta("hi".into())).unwrap(),
            r#"{"event":"delta","data":"hi"}"#
        );
        assert_eq!(
            serde_json::to_string(&ChatEvent::Error(ProviderError::RateLimited {
                retry_after_secs: Some(7)
            }))
            .unwrap(),
            r#"{"event":"error","data":{"kind":"rateLimited","retryAfterSecs":7}}"#
        );
        assert_eq!(
            serde_json::to_string(&ChatEvent::Done(Usage {
                tokens_in: Some(10),
                tokens_out: Some(20)
            }))
            .unwrap(),
            r#"{"event":"done","data":{"tokensIn":10,"tokensOut":20}}"#
        );
    }
}
