pub mod process;

use crate::gateway::http::{map_http_error, map_reqwest_error, read_json_lines, Step, LIST_TIMEOUT};
use crate::gateway::ProviderError;
use serde::{Deserialize, Serialize};
use serde_json::json;
use specta::Type;
use std::collections::HashMap;
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

pub const OLLAMA_URL: &str = "http://127.0.0.1:11434";
pub const OLLAMA_DOWNLOAD_URL: &str = "https://ollama.com/download";
/// The context length a local model gets until the user sets one (plan D5).
pub const DEFAULT_NUM_CTX: u32 = 8192;

/// The context length a local model runs with: the user's choice, else the
/// default capped at the model's maximum.
pub fn local_num_ctx(num_ctx: Option<u32>, context_window: Option<u32>) -> u32 {
    num_ctx.unwrap_or_else(|| context_window.map_or(DEFAULT_NUM_CTX, |w| w.min(DEFAULT_NUM_CTX)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_num_ctx_table() {
        assert_eq!(local_num_ctx(None, None), 8192);
        assert_eq!(local_num_ctx(None, Some(4096)), 4096);
        assert_eq!(local_num_ctx(None, Some(32768)), 8192);
        assert_eq!(local_num_ctx(Some(16384), Some(32768)), 16384);
    }
}

pub fn valid_model_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 200 {
        return false;
    }
    name.chars().all(|c| {
        c.is_ascii_alphanumeric()
            || c == '.'
            || c == '_'
            || c == ':'
            || c == '/'
            || c == '-'
    })
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum OllamaStatus {
    NotInstalled,
    Stopped,
    Running { version: String },
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LocalModelView {
    pub name: String,
    pub size_mb: u32,
    pub parameter_size: String,
    pub quantization: String,
    pub loaded: Option<LoadedModel>,
    pub supports_tools: Option<bool>,
    pub context_length: Option<u32>,
    pub num_ctx: u32,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LocalModel {
    pub name: String,
    pub size_mb: u32,
    pub parameter_size: String,
    pub quantization: String,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ModelDetails {
    pub supports_tools: bool,
    pub context_length: Option<u32>,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LoadedModel {
    pub name: String,
    pub size_mb: u32,
    pub vram_mb: u32,
    pub expires_at: String,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum PullEvent {
    Progress {
        status: String,
        #[serde(rename = "completedMb")]
        completed_mb: u32,
        #[serde(rename = "totalMb")]
        total_mb: u32,
    },
}

async fn map_resp_error(resp: reqwest::Response) -> ProviderError {
    let status = resp.status().as_u16();
    let retry_after = resp
        .headers()
        .get("retry-after")
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let body_text = resp.text().await.unwrap_or_default();
    map_http_error(status, retry_after.as_deref(), &body_text)
}

#[derive(Clone)]
pub struct Ollama {
    client: reqwest::Client,
    base: String,
}

impl Ollama {
    pub fn new(client: reqwest::Client, base: String) -> Self {
        Self {
            client,
            base: base.trim_end_matches('/').to_string(),
        }
    }

    pub async fn version(&self) -> Result<String, ProviderError> {
        let url = format!("{}/api/version", self.base);
        let resp = self
            .client
            .get(&url)
            .timeout(LIST_TIMEOUT)
            .send()
            .await
            .map_err(map_reqwest_error)?;

        if !resp.status().is_success() {
            return Err(map_resp_error(resp).await);
        }

        let val: serde_json::Value = resp.json().await.map_err(|e| ProviderError::Provider {
            message: e.to_string(),
        })?;

        let version = val
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        Ok(version)
    }

    pub async fn tags(&self) -> Result<Vec<LocalModel>, ProviderError> {
        let url = format!("{}/api/tags", self.base);
        let resp = self
            .client
            .get(&url)
            .timeout(LIST_TIMEOUT)
            .send()
            .await
            .map_err(map_reqwest_error)?;

        if !resp.status().is_success() {
            return Err(map_resp_error(resp).await);
        }

        let val: serde_json::Value = resp.json().await.map_err(|e| ProviderError::Provider {
            message: e.to_string(),
        })?;

        let mut models = Vec::new();
        if let Some(items) = val.get("models").and_then(|m| m.as_array()) {
            for item in items {
                let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let size_bytes = item.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                let size_mb = if size_bytes > 0 {
                    ((size_bytes as f64) / 1_048_576.0).ceil() as u32
                } else {
                    0
                };
                let details = item.get("details");
                let parameter_size = details
                    .and_then(|d| d.get("parameter_size"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let quantization = details
                    .and_then(|d| d.get("quantization_level"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                models.push(LocalModel {
                    name,
                    size_mb,
                    parameter_size,
                    quantization,
                });
            }
        }

        Ok(models)
    }

    pub async fn show(&self, name: &str) -> Result<ModelDetails, ProviderError> {
        let url = format!("{}/api/show", self.base);
        let resp = self
            .client
            .post(&url)
            .json(&json!({ "model": name }))
            .timeout(LIST_TIMEOUT)
            .send()
            .await
            .map_err(map_reqwest_error)?;

        if !resp.status().is_success() {
            return Err(map_resp_error(resp).await);
        }

        let val: serde_json::Value = resp.json().await.map_err(|e| ProviderError::Provider {
            message: e.to_string(),
        })?;

        let supports_tools = val
            .get("capabilities")
            .and_then(|c| c.as_array())
            .map(|arr| arr.iter().any(|v| v.as_str() == Some("tools")))
            .unwrap_or(false);

        let context_length = val
            .get("model_info")
            .and_then(|info| info.as_object())
            .and_then(|obj| {
                obj.iter()
                    .find(|(k, _)| k.ends_with(".context_length"))
                    .and_then(|(_, v)| v.as_u64())
                    .map(|n| n as u32)
            });

        Ok(ModelDetails {
            supports_tools,
            context_length,
        })
    }

    pub async fn loaded(&self) -> Result<Vec<LoadedModel>, ProviderError> {
        let url = format!("{}/api/ps", self.base);
        let resp = self
            .client
            .get(&url)
            .timeout(LIST_TIMEOUT)
            .send()
            .await
            .map_err(map_reqwest_error)?;

        if !resp.status().is_success() {
            return Err(map_resp_error(resp).await);
        }

        let val: serde_json::Value = resp.json().await.map_err(|e| ProviderError::Provider {
            message: e.to_string(),
        })?;

        let mut list = Vec::new();
        if let Some(models) = val.get("models").and_then(|m| m.as_array()) {
            for m in models {
                let name = m.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let size_bytes = m.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                let size_vram = m.get("size_vram").and_then(|v| v.as_u64()).unwrap_or(0);
                let size_mb = if size_bytes > 0 {
                    ((size_bytes as f64) / 1_048_576.0).ceil() as u32
                } else {
                    0
                };
                let vram_mb = if size_vram > 0 {
                    ((size_vram as f64) / 1_048_576.0).ceil() as u32
                } else {
                    0
                };
                let expires_at = m
                    .get("expires_at")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();

                list.push(LoadedModel {
                    name,
                    size_mb,
                    vram_mb,
                    expires_at,
                });
            }
        }

        Ok(list)
    }

    pub async fn pull(
        &self,
        name: &str,
        out: Channel<PullEvent>,
        cancel: &CancellationToken,
    ) -> Result<(), ProviderError> {
        let url = format!("{}/api/pull", self.base);
        let resp = self
            .client
            .post(&url)
            .json(&json!({ "model": name, "stream": true }))
            .send()
            .await
            .map_err(map_reqwest_error)?;

        if !resp.status().is_success() {
            return Err(map_resp_error(resp).await);
        }

        let mut digest_totals = HashMap::<String, u64>::new();
        let mut digest_completed = HashMap::<String, u64>::new();

        read_json_lines(resp, cancel, |line| {
            let val: serde_json::Value =
                serde_json::from_str(line).map_err(|e| ProviderError::Provider {
                    message: e.to_string(),
                })?;

            if let Some(err) = val.get("error").and_then(|v| v.as_str()) {
                return Err(ProviderError::Provider {
                    message: err.to_string(),
                });
            }

            let status = val
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            if status == "success" {
                return Ok(Step::Done);
            }

            if let Some(digest) = val.get("digest").and_then(|v| v.as_str()) {
                if let Some(total) = val.get("total").and_then(|v| v.as_u64()) {
                    digest_totals.insert(digest.to_string(), total);
                }
                if let Some(completed) = val.get("completed").and_then(|v| v.as_u64()) {
                    digest_completed.insert(digest.to_string(), completed);
                }
            }

            let total_bytes: u64 = digest_totals.values().sum();
            let completed_bytes: u64 = digest_completed.values().sum();

            let total_mb = if total_bytes > 0 {
                ((total_bytes as f64) / 1_048_576.0).ceil() as u32
            } else {
                0
            };
            let completed_mb = if completed_bytes > 0 {
                ((completed_bytes as f64) / 1_048_576.0).ceil() as u32
            } else {
                0
            };

            out.send(PullEvent::Progress {
                status,
                completed_mb,
                total_mb,
            })
            .map_err(|_| ProviderError::Cancelled)?;

            Ok(Step::Continue)
        })
        .await?;

        Ok(())
    }

    pub async fn delete(&self, name: &str) -> Result<(), ProviderError> {
        let url = format!("{}/api/delete", self.base);
        let resp = self
            .client
            .delete(&url)
            .json(&json!({ "model": name }))
            .timeout(LIST_TIMEOUT)
            .send()
            .await
            .map_err(map_reqwest_error)?;

        if resp.status().as_u16() == 404 {
            return Err(ProviderError::ModelNotFound);
        }

        if !resp.status().is_success() {
            return Err(map_resp_error(resp).await);
        }

        Ok(())
    }

    pub async fn unload(&self, name: &str) -> Result<(), ProviderError> {
        let url = format!("{}/api/chat", self.base);
        let resp = self
            .client
            .post(&url)
            .json(&json!({
                "model": name,
                "messages": [],
                "keep_alive": 0
            }))
            .timeout(LIST_TIMEOUT)
            .send()
            .await
            .map_err(map_reqwest_error)?;

        if !resp.status().is_success() {
            return Err(map_resp_error(resp).await);
        }

        Ok(())
    }
}
