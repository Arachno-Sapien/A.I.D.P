use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

pub mod anthropic;
pub mod http;
pub mod ollama_chat;
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
    Ollama,
}

impl ConnectionKind {
    pub fn as_db(&self) -> &'static str {
        match self {
            Self::OpenaiCompat => "openai_compat",
            Self::Anthropic => "anthropic",
            Self::Ollama => "ollama",
        }
    }

    pub fn from_db(s: &str) -> Option<Self> {
        match s {
            "openai_compat" => Some(Self::OpenaiCompat),
            "anthropic" => Some(Self::Anthropic),
            "ollama" => Some(Self::Ollama),
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
        ConnectionKind::Ollama => {
            Box::new(ollama_chat::OllamaChat::new(client, base_url))
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

impl Role {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::System => "system",
            Self::User => "user",
            Self::Assistant => "assistant",
        }
    }

    pub fn from_db(s: &str) -> Option<Self> {
        match s {
            "system" => Some(Self::System),
            "user" => Some(Self::User),
            "assistant" => Some(Self::Assistant),
            _ => None,
        }
    }
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

pub const TOOLS_UNSUPPORTED: &str =
    "This model can't use tools. Turn off Agent to ask without them.";

#[derive(Clone, Debug, PartialEq)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub schema: serde_json::Value,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub input: serde_json::Value,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ToolOutput {
    pub call_id: String,
    pub content: String,
    pub is_error: bool,
}

/// The text before a round's tool images, where they go in a user message of their own.
pub const TOOL_IMAGES_NOTE: &str = "Images from the tool results above:";

#[derive(Clone, Debug, PartialEq)]
pub struct ToolRound {
    pub assistant: serde_json::Value,
    pub results: Vec<ToolOutput>,
    /// Images the round's tools returned, for a model that reads images (decision 0031).
    /// Each adapter sends them after the round's results.
    pub images: Vec<ImageInput>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Reply {
    pub usage: Usage,
    pub tool_calls: Vec<ToolCall>,
    pub assistant: serde_json::Value,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LocalOptions {
    pub num_ctx: Option<u32>,
    pub keep_alive: Option<i32>,
}

/// An image attached to one message, as base64 (decision 0019), or returned by an
/// outside tool (decision 0031).
#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImageInput {
    pub mime: String,
    pub data_base64: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    /// The images of `messages[i]` are `images[i]`; shorter, or empty, where there are none.
    pub images: Vec<Vec<ImageInput>>,
    pub tools: Vec<ToolSpec>,
    pub rounds: Vec<ToolRound>,
    pub local: LocalOptions,
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
    ToolCall {
        id: u32,
        action: crate::tools::ToolAction,
        #[serde(rename = "needsAnswer")]
        needs_answer: bool,
    },
    ToolResult {
        id: u32,
        outcome: crate::tools::ToolOutcome,
    },
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
    ) -> Result<Reply, ProviderError>;
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
        assert_eq!(
            serde_json::to_string(&ChatEvent::ToolCall {
                id: 3,
                action: crate::tools::ToolAction::ReadFile {
                    path: "src/a.ts".to_string(),
                },
                needs_answer: false,
            })
            .unwrap(),
            r#"{"event":"toolCall","data":{"id":3,"action":{"tool":"readFile","path":"src/a.ts"},"needsAnswer":false}}"#
        );
        assert_eq!(
            serde_json::to_string(&ChatEvent::ToolResult {
                id: 3,
                outcome: crate::tools::ToolOutcome::Command {
                    exit_code: Some(0),
                    output: "ok".to_string(),
                    timed_out: false,
                },
            })
            .unwrap(),
            r#"{"event":"toolResult","data":{"id":3,"outcome":{"status":"command","exitCode":0,"output":"ok","timedOut":false}}}"#
        );
        assert_eq!(
            serde_json::to_string(&ChatEvent::ToolCall {
                id: 4,
                action: crate::tools::ToolAction::McpTool {
                    server: "browser".to_string(),
                    name: "browser_click".to_string(),
                    arguments: "{}".to_string(),
                },
                needs_answer: true,
            })
            .unwrap(),
            r#"{"event":"toolCall","data":{"id":4,"action":{"tool":"mcpTool","server":"browser","name":"browser_click","arguments":"{}"},"needsAnswer":true}}"#
        );
        assert_eq!(
            serde_json::to_string(&ChatEvent::ToolResult {
                id: 4,
                outcome: crate::tools::ToolOutcome::Text {
                    output: "ok".to_string(),
                    images: vec![ImageInput {
                        mime: "image/png".to_string(),
                        data_base64: "iVBORw0KGgo=".to_string(),
                    }],
                },
            })
            .unwrap(),
            r#"{"event":"toolResult","data":{"id":4,"outcome":{"status":"text","output":"ok","images":[{"mime":"image/png","dataBase64":"iVBORw0KGgo="}]}}}"#
        );
    }
}
