use crate::gateway::http::{
    list_error, map_http_error, map_reqwest_error, read_sse, Step, LIST_TIMEOUT,
};
use crate::gateway::{
    ChatEvent, ChatRequest, ModelInfo, ModelProvider, ProviderError, Reply, Usage,
};
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
struct ChunkDeltaFunction {
    name: Option<String>,
    arguments: Option<String>,
}

#[derive(Deserialize)]
struct ChunkDeltaToolCall {
    index: Option<u32>,
    id: Option<String>,
    #[serde(rename = "type")]
    #[allow(dead_code)]
    call_type: Option<String>,
    function: Option<ChunkDeltaFunction>,
    #[serde(flatten)]
    extra: serde_json::Map<String, serde_json::Value>,
}

#[derive(Deserialize)]
struct ChunkChoiceDelta {
    content: Option<String>,
    tool_calls: Option<Vec<ChunkDeltaToolCall>>,
}

#[derive(Deserialize)]
struct ChunkChoice {
    delta: Option<ChunkChoiceDelta>,
    finish_reason: Option<String>,
}

#[derive(Default)]
struct PartialCall {
    id: Option<String>,
    name: Option<String>,
    arguments: String,
    extra: serde_json::Map<String, serde_json::Value>,
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
            supported_parameters: Option<Vec<String>>,
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
                let supports_tools = m
                    .supported_parameters
                    .map(|params| params.iter().any(|p| p == "tools"));
                Some(ModelInfo {
                    id,
                    display_name,
                    context_window: m.context_length,
                    supports_tools,
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
    ) -> Result<Reply, ProviderError> {
        let url = format!("{}/chat/completions", self.base_url);

        let mut auth_header =
            match HeaderValue::from_str(&format!("Bearer {}", self.api_key.expose_secret())) {
                Ok(val) => val,
                Err(_) => return Err(ProviderError::InvalidKey),
            };
        auth_header.set_sensitive(true);

        let mut body_map = serde_json::Map::new();
        body_map.insert("model".to_string(), json!(req.model));
        body_map.insert("stream".to_string(), json!(true));

        let mut messages_val: Vec<serde_json::Value> = req
            .messages
            .into_iter()
            .map(|m| {
                json!({
                    "role": m.role,
                    "content": m.content,
                })
            })
            .collect();

        for round in req.rounds {
            messages_val.push(round.assistant);
            for res in round.results {
                let content = if res.is_error {
                    format!("Error: {}", res.content)
                } else {
                    res.content
                };
                messages_val.push(json!({
                    "role": "tool",
                    "tool_call_id": res.call_id,
                    "content": content,
                }));
            }
        }
        body_map.insert("messages".to_string(), json!(messages_val));

        if !req.tools.is_empty() {
            let tools_val: Vec<serde_json::Value> = req
                .tools
                .into_iter()
                .map(|spec| {
                    json!({
                        "type": "function",
                        "function": {
                            "name": spec.name,
                            "description": spec.description,
                            "parameters": spec.schema,
                        }
                    })
                })
                .collect();
            body_map.insert("tools".to_string(), json!(tools_val));
        }

        let body = serde_json::Value::Object(body_map);

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
        let mut accumulated_text = String::new();
        let mut accumulated_tool_calls: std::collections::BTreeMap<u32, PartialCall> =
            std::collections::BTreeMap::new();
        let mut last_finish_reason: Option<String> = None;

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

            if let Some(choice) = chunk.choices.first() {
                if let Some(reason) = &choice.finish_reason {
                    last_finish_reason = Some(reason.clone());
                }

                if let Some(delta) = &choice.delta {
                    if let Some(content) = delta.content.as_deref()
                        && !content.is_empty()
                    {
                        accumulated_text.push_str(content);
                        if out.send(ChatEvent::Delta(content.to_string())).is_err() {
                            return Err(ProviderError::Cancelled);
                        }
                    }

                    if let Some(tool_calls) = &delta.tool_calls {
                        for (idx, item) in tool_calls.iter().enumerate() {
                            let key = item.index.unwrap_or(idx as u32);
                            let partial = accumulated_tool_calls.entry(key).or_default();
                            if let Some(id) = &item.id
                                && !id.is_empty()
                            {
                                partial.id = Some(id.clone());
                            }
                            if let Some(func) = &item.function {
                                if let Some(name) = &func.name
                                    && !name.is_empty()
                                {
                                    partial.name = Some(name.clone());
                                }
                                if let Some(args) = &func.arguments {
                                    partial.arguments.push_str(args);
                                }
                            }
                            for (k, v) in &item.extra {
                                partial.extra.insert(k.clone(), v.clone());
                            }
                        }
                    }
                }
            }

            Ok(Step::Continue)
        };

        read_sse(resp, &cancel, on_data).await?;

        if last_finish_reason.as_deref() == Some("length") && !accumulated_tool_calls.is_empty() {
            return Err(ProviderError::Provider {
                message: "The reply was cut off before its tool call was complete.".to_string(),
            });
        }

        let mut tool_calls = Vec::new();
        let mut tool_calls_json = Vec::new();

        for (idx, mut partial) in accumulated_tool_calls {
            // Some providers send "" for a call without arguments.
            if partial.arguments.trim().is_empty() {
                partial.arguments = "{}".to_string();
            }
            let call_id = partial.id.unwrap_or_else(|| format!("call_{idx}"));
            let func_name = partial.name.unwrap_or_default();
            let input = match serde_json::from_str::<serde_json::Value>(&partial.arguments) {
                Ok(val) => val,
                Err(_) => serde_json::Value::String(partial.arguments.clone()),
            };

            tool_calls.push(crate::gateway::ToolCall {
                id: call_id.clone(),
                name: func_name.clone(),
                input,
            });

            let mut call_obj = serde_json::Map::new();
            call_obj.insert("id".to_string(), serde_json::Value::String(call_id));
            call_obj.insert(
                "type".to_string(),
                serde_json::Value::String("function".to_string()),
            );
            call_obj.insert(
                "function".to_string(),
                json!({
                    "name": func_name,
                    "arguments": partial.arguments,
                }),
            );
            for (k, v) in partial.extra {
                call_obj.insert(k, v);
            }
            tool_calls_json.push(serde_json::Value::Object(call_obj));
        }

        let mut assistant_map = serde_json::Map::new();
        assistant_map.insert(
            "role".to_string(),
            serde_json::Value::String("assistant".to_string()),
        );
        if accumulated_text.is_empty() {
            assistant_map.insert("content".to_string(), serde_json::Value::Null);
        } else {
            assistant_map.insert(
                "content".to_string(),
                serde_json::Value::String(accumulated_text),
            );
        }
        if !tool_calls_json.is_empty() {
            assistant_map.insert(
                "tool_calls".to_string(),
                serde_json::Value::Array(tool_calls_json),
            );
        }
        let assistant = serde_json::Value::Object(assistant_map);

        Ok(Reply {
            usage: final_usage,
            tool_calls,
            assistant,
        })
    }
}
