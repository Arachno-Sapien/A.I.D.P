use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

pub mod anthropic;
pub mod http;
pub mod openai_compat;
pub mod sse;
pub mod url;

#[derive(
    Serialize,
    Deserialize,
    Type,
    Copy,
    Clone,
    Debug,
    PartialEq,
    Eq,
)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionKind {
    OpenaiCompat,
    Anthropic,
}

impl ConnectionKind {
    pub fn as_db(&self) -> &'static str {
        match self {
            Self::OpenaiCompat => "openai_compat",
            Self::Anthropic => "anthropic",
        }
    }

    pub fn from_db(s: &str) -> Option<Self> {
        match s {
            "openai_compat" => Some(Self::OpenaiCompat),
            "anthropic" => Some(Self::Anthropic),
            _ => None,
        }
    }
}

pub fn provider(
    kind: ConnectionKind,
    client: reqwest::Client,
    base_url: String,
    key: secrecy::SecretString,
) -> Box<dyn ModelProvider> {
    match kind {
        ConnectionKind::OpenaiCompat => {
            Box::new(openai_compat::OpenAiCompat::new(client, base_url, key))
        }
        ConnectionKind::Anthropic => {
            Box::new(anthropic::Anthropic::new(client, base_url, key))
        }
    }
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub display_name: String,
    pub context_window: Option<u32>,
    pub supports_tools: Option<bool>,
}

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
    async fn list_models(&self) -> Result<Vec<ModelInfo>, ProviderError>;

    async fn test_connection(&self) -> Result<(), ProviderError> {
        self.list_models().await.map(|_| ())
    }

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
