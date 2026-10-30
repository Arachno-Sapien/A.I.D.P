use crate::db::connections::{
    delete_connection, get_connection, insert_connection, list_chat_models, list_connections,
    record_test, set_default_model, set_models, update_key_hint, ConnectionRow,
};
use crate::gateway::url::check_base_url;
use crate::gateway::{
    provider, ChatEvent, ChatMessage, ChatRequest, ConnectionKind, LocalOptions, ModelInfo,
    ModelProvider, ProviderError, Usage,
};
use crate::ollama::{local_num_ctx, valid_model_name, LocalModelView, Ollama};
use crate::secrets::{key_hint, SecretError, SecretStore};
use rusqlite::{Connection, OptionalExtension};
use secrecy::SecretString;
use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

#[derive(Deserialize, Type, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewConnection {
    pub kind: ConnectionKind,
    pub label: String,
    pub base_url: String,
    pub api_key: String,
}

impl std::fmt::Debug for NewConnection {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("NewConnection")
            .field("kind", &self.kind)
            .field("label", &self.label)
            .field("base_url", &self.base_url)
            .field("api_key", &"[REDACTED]")
            .finish()
    }
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionView {
    pub id: u32,
    pub kind: ConnectionKind,
    pub label: String,
    pub base_url: String,
    pub key_hint: String,
    pub last_tested_at: Option<u32>,
    pub last_test_ok: Option<bool>,
}

impl From<ConnectionRow> for ConnectionView {
    fn from(r: ConnectionRow) -> Self {
        Self {
            id: r.id,
            kind: r.kind,
            label: r.label,
            base_url: r.base_url,
            key_hint: r.key_hint,
            last_tested_at: r.last_tested_at,
            last_test_ok: r.last_test_ok,
        }
    }
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AddedConnection {
    pub connection: ConnectionView,
    pub available: Vec<ModelInfo>,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatModel {
    pub connection_id: u32,
    pub connection_label: String,
    pub model_id: String,
    pub display_name: String,
    pub is_default: bool,
    pub supports_tools: Option<bool>,
    pub is_local: bool,
    pub context_tokens: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, Default)]
#[serde(rename_all = "camelCase")]
pub enum Theme {
    #[default]
    Dark,
    Light,
    System,
}

impl Theme {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Dark => "dark",
            Self::Light => "light",
            Self::System => "system",
        }
    }

    pub fn from_str_opt(s: Option<&str>) -> Self {
        match s {
            Some("light") => Self::Light,
            Some("system") => Self::System,
            _ => Self::Dark,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type, Default)]
#[serde(rename_all = "camelCase")]
pub enum KeepAlive {
    #[default]
    OllamaDefault,
    FiveMinutes,
    ThirtyMinutes,
    OneHour,
    UntilFreed,
    AfterEachReply,
}

impl KeepAlive {
    pub fn seconds(&self) -> Option<i32> {
        match self {
            Self::OllamaDefault => None,
            Self::FiveMinutes => Some(300),
            Self::ThirtyMinutes => Some(1800),
            Self::OneHour => Some(3600),
            Self::UntilFreed => Some(-1),
            Self::AfterEachReply => Some(0),
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::OllamaDefault => "ollamaDefault",
            Self::FiveMinutes => "fiveMinutes",
            Self::ThirtyMinutes => "thirtyMinutes",
            Self::OneHour => "oneHour",
            Self::UntilFreed => "untilFreed",
            Self::AfterEachReply => "afterEachReply",
        }
    }

    pub fn from_str_opt(s: Option<&str>) -> Self {
        match s {
            Some("fiveMinutes") => Self::FiveMinutes,
            Some("thirtyMinutes") => Self::ThirtyMinutes,
            Some("oneHour") => Self::OneHour,
            Some("untilFreed") => Self::UntilFreed,
            Some("afterEachReply") => Self::AfterEachReply,
            _ => Self::OllamaDefault,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: Theme,
    pub keep_alive: KeepAlive,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AppError {
    Provider { error: ProviderError },
    NotFound,
    KeyMissing,
    InvalidInput { message: String },
    InsecureUrl { url: String },
    Keychain { message: String },
    Storage { message: String },
    Ollama { message: String },
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        AppError::Storage {
            message: e.to_string(),
        }
    }
}

impl From<ProviderError> for AppError {
    fn from(error: ProviderError) -> Self {
        AppError::Provider { error }
    }
}

pub(crate) fn now_secs() -> u32 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as u32)
        .unwrap_or(0)
}

/// Every request with a model name from the UI checks it first.
pub(crate) fn check_model_name(name: &str) -> Result<(), AppError> {
    if valid_model_name(name) {
        Ok(())
    } else {
        Err(AppError::InvalidInput {
            message: "Invalid model name.".to_string(),
        })
    }
}

pub struct Services {
    pub(crate) db: Mutex<Connection>,
    secrets: Arc<dyn SecretStore>,
    http: reqwest::Client,
    ollama_url: String,
}

impl Services {
    pub fn new(db: Connection, secrets: Arc<dyn SecretStore>, http: reqwest::Client) -> Self {
        Self {
            db: Mutex::new(db),
            secrets,
            http,
            ollama_url: crate::ollama::OLLAMA_URL.to_string(),
        }
    }

    pub fn with_ollama_url(mut self, url: String) -> Self {
        self.ollama_url = url;
        self
    }

    pub fn ollama(&self) -> Ollama {
        Ollama::new(self.http.clone(), self.ollama_url.clone())
    }

    pub fn db_conn(&self) -> Result<std::sync::MutexGuard<'_, Connection>, AppError> {
        self.db.lock().map_err(|e| AppError::Storage {
            message: e.to_string(),
        })
    }

    pub async fn add_connection(&self, input: NewConnection) -> Result<AddedConnection, AppError> {
        let label = input.label.trim();
        let key = input.api_key.trim();
        if label.is_empty() {
            return Err(AppError::InvalidInput {
                message: "label cannot be blank".to_string(),
            });
        }
        if key.is_empty() {
            return Err(AppError::InvalidInput {
                message: "key cannot be empty".to_string(),
            });
        }

        let mut base_url = input.base_url.trim().to_string();
        if base_url.ends_with('/') {
            base_url.pop();
        }
        if check_base_url(&base_url).is_none() {
            return Err(AppError::InsecureUrl { url: base_url });
        }

        let secret_key = SecretString::from(key.to_string());
        let prov = provider(
            input.kind,
            self.http.clone(),
            base_url.clone(),
            secret_key.clone(),
        );
        let available = prov.list_models().await?;

        let hint = key_hint(&secret_key);
        let now = now_secs();
        let id = {
            let db = self.db.lock().map_err(|e| AppError::Storage {
                message: e.to_string(),
            })?;
            insert_connection(&db, input.kind, label, &base_url, &hint, now)?
        };

        if let Err(e) = self.secrets.set(id, &secret_key) {
            if let Ok(db) = self.db.lock() {
                let _ = delete_connection(&db, id);
            }
            return Err(match e {
                SecretError::Unavailable(m) => AppError::Keychain { message: m },
                SecretError::NotFound => AppError::Keychain {
                    message: "failed to store key".to_string(),
                },
            });
        }

        let connection = ConnectionView {
            id,
            kind: input.kind,
            label: label.to_string(),
            base_url,
            key_hint: hint,
            last_tested_at: Some(now),
            last_test_ok: Some(true),
        };

        Ok(AddedConnection {
            connection,
            available,
        })
    }

    pub fn list_connections(&self) -> Result<Vec<ConnectionView>, AppError> {
        let db = self.db.lock().map_err(|e| AppError::Storage {
            message: e.to_string(),
        })?;
        let rows = list_connections(&db)?;
        Ok(rows.into_iter().map(ConnectionView::from).collect())
    }

    pub async fn test_connection(&self, id: u32) -> Result<(), AppError> {
        let row = {
            let db = self.db.lock().map_err(|e| AppError::Storage {
                message: e.to_string(),
            })?;
            get_connection(&db, id)?.ok_or(AppError::NotFound)?
        };

        let key = match self.secrets.get(id) {
            Ok(k) => k,
            Err(SecretError::NotFound) => return Err(AppError::KeyMissing),
            Err(SecretError::Unavailable(m)) => return Err(AppError::Keychain { message: m }),
        };

        let prov = provider(row.kind, self.http.clone(), row.base_url, key);
        let test_res = prov.test_connection().await;
        let now = now_secs();
        let ok = test_res.is_ok();

        {
            let db = self.db.lock().map_err(|e| AppError::Storage {
                message: e.to_string(),
            })?;
            record_test(&db, id, ok, now)?;
        }

        test_res?;
        Ok(())
    }

    pub async fn available_models(&self, id: u32) -> Result<Vec<ModelInfo>, AppError> {
        let row = {
            let db = self.db.lock().map_err(|e| AppError::Storage {
                message: e.to_string(),
            })?;
            get_connection(&db, id)?.ok_or(AppError::NotFound)?
        };

        let key = match self.secrets.get(id) {
            Ok(k) => k,
            Err(SecretError::NotFound) => return Err(AppError::KeyMissing),
            Err(SecretError::Unavailable(m)) => return Err(AppError::Keychain { message: m }),
        };

        let prov = provider(row.kind, self.http.clone(), row.base_url, key);
        let models = prov.list_models().await?;
        Ok(models)
    }

    pub async fn replace_key(&self, id: u32, api_key: String) -> Result<ConnectionView, AppError> {
        let api_key = api_key.trim();
        if api_key.is_empty() {
            return Err(AppError::InvalidInput {
                message: "key cannot be empty".to_string(),
            });
        }

        let row = {
            let db = self.db.lock().map_err(|e| AppError::Storage {
                message: e.to_string(),
            })?;
            get_connection(&db, id)?.ok_or(AppError::NotFound)?
        };

        let new_secret_key = SecretString::from(api_key.to_string());
        let prov = provider(
            row.kind,
            self.http.clone(),
            row.base_url.clone(),
            new_secret_key.clone(),
        );
        prov.test_connection().await?;

        if let Err(e) = self.secrets.set(id, &new_secret_key) {
            return Err(match e {
                SecretError::Unavailable(m) => AppError::Keychain { message: m },
                SecretError::NotFound => AppError::Keychain {
                    message: "failed to store key".to_string(),
                },
            });
        }

        let hint = key_hint(&new_secret_key);
        let now = now_secs();
        {
            let db = self.db.lock().map_err(|e| AppError::Storage {
                message: e.to_string(),
            })?;
            update_key_hint(&db, id, &hint)?;
            record_test(&db, id, true, now)?;
        }

        Ok(ConnectionView {
            id,
            kind: row.kind,
            label: row.label,
            base_url: row.base_url,
            key_hint: hint,
            last_tested_at: Some(now),
            last_test_ok: Some(true),
        })
    }

    pub fn delete_connection(&self, id: u32) -> Result<(), AppError> {
        let row = {
            let db = self.db.lock().map_err(|e| AppError::Storage {
                message: e.to_string(),
            })?;
            get_connection(&db, id)?.ok_or(AppError::NotFound)?
        };

        if row.kind == ConnectionKind::Ollama {
            return Err(AppError::InvalidInput {
                message: "Ollama is managed on the Local panel.".to_string(),
            });
        }

        if let Err(e) = self.secrets.delete(id) {
            return Err(match e {
                SecretError::Unavailable(m) => AppError::Keychain { message: m },
                SecretError::NotFound => AppError::NotFound,
            });
        }

        let db = self.db.lock().map_err(|e| AppError::Storage {
            message: e.to_string(),
        })?;
        let deleted = delete_connection(&db, id)?;
        if !deleted {
            return Err(AppError::NotFound);
        }
        Ok(())
    }

    pub fn set_models(&self, connection_id: u32, models: Vec<ModelInfo>) -> Result<(), AppError> {
        let mut db = self.db.lock().map_err(|e| AppError::Storage {
            message: e.to_string(),
        })?;
        let row = get_connection(&db, connection_id)?;
        if row.is_none() {
            return Err(AppError::NotFound);
        }
        set_models(&mut db, connection_id, &models)?;
        Ok(())
    }

    pub fn chat_models(&self) -> Result<Vec<ChatModel>, AppError> {
        let db = self.db.lock().map_err(|e| AppError::Storage {
            message: e.to_string(),
        })?;
        let rows = list_chat_models(&db)?;
        Ok(rows
            .into_iter()
            .map(|r| {
                let is_local = r.connection_kind == ConnectionKind::Ollama;
                let context_tokens = if is_local {
                    Some(local_num_ctx(r.num_ctx, r.context_window))
                } else {
                    r.context_window
                };
                ChatModel {
                    connection_id: r.connection_id,
                    connection_label: r.connection_label,
                    model_id: r.model_id,
                    display_name: r.display_name,
                    is_default: r.is_default,
                    supports_tools: r.supports_tools,
                    is_local,
                    context_tokens,
                }
            })
            .collect())
    }

    pub fn set_default_model(&self, connection_id: u32, model_id: String) -> Result<(), AppError> {
        let mut db = self.db.lock().map_err(|e| AppError::Storage {
            message: e.to_string(),
        })?;
        let ok = set_default_model(&mut db, connection_id, &model_id)?;
        if !ok {
            return Err(AppError::NotFound);
        }
        Ok(())
    }

    pub fn setting(&self, key: &str) -> Result<Option<String>, AppError> {
        let conn = self.db.lock().map_err(|e| AppError::Storage {
            message: e.to_string(),
        })?;
        crate::db::settings::get(&conn, key).map_err(AppError::from)
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<(), AppError> {
        let conn = self.db.lock().map_err(|e| AppError::Storage {
            message: e.to_string(),
        })?;
        crate::db::settings::set(&conn, key, value).map_err(AppError::from)
    }

    pub fn get_settings(&self) -> Result<AppSettings, AppError> {
        let theme_str = self.setting("theme")?;
        let keep_alive_str = self.setting("keep_alive")?;
        Ok(AppSettings {
            theme: Theme::from_str_opt(theme_str.as_deref()),
            keep_alive: KeepAlive::from_str_opt(keep_alive_str.as_deref()),
        })
    }

    pub fn set_theme(&self, theme: Theme) -> Result<(), AppError> {
        self.set_setting("theme", theme.as_str())
    }

    pub fn set_keep_alive(&self, keep_alive: KeepAlive) -> Result<(), AppError> {
        self.set_setting("keep_alive", keep_alive.as_str())
    }

    pub fn ensure_ollama_connection(&self) -> Result<u32, AppError> {
        let db = self.db.lock().map_err(|e| AppError::Storage {
            message: e.to_string(),
        })?;
        let connections = list_connections(&db)?;
        if let Some(c) = connections.iter().find(|c| c.kind == ConnectionKind::Ollama) {
            return Ok(c.id);
        }
        let now = now_secs();
        let id = insert_connection(
            &db,
            ConnectionKind::Ollama,
            "Ollama (local)",
            &self.ollama_url,
            "",
            now,
        )?;
        Ok(id)
    }

    pub async fn sync_local_models(&self) -> Result<(), AppError> {
        let ollama_id = self.ensure_ollama_connection()?;
        let ollama = self.ollama();
        let tags = ollama.tags().await?;
        let mut models = Vec::with_capacity(tags.len());
        for tag in tags {
            let details = ollama.show(&tag.name).await.ok();
            let (supports_tools, context_window) = match details {
                Some(d) => (Some(d.supports_tools), d.context_length),
                None => (None, None),
            };
            models.push(ModelInfo {
                id: tag.name.clone(),
                display_name: tag.name,
                supports_tools,
                context_window,
            });
        }
        self.set_models(ollama_id, models)?;
        Ok(())
    }

    pub fn model_options(&self, connection_id: u32, model_id: &str) -> LocalOptions {
        let db = match self.db.lock() {
            Ok(d) => d,
            Err(_) => return LocalOptions::default(),
        };
        let row = match get_connection(&db, connection_id) {
            Ok(Some(r)) => r,
            _ => return LocalOptions::default(),
        };
        if row.kind != ConnectionKind::Ollama {
            return LocalOptions::default();
        }
        let query_res: rusqlite::Result<(Option<i64>, Option<i64>)> = db.query_row(
            "SELECT num_ctx, context_window FROM models WHERE connection_id = ?1 AND model_id = ?2",
            rusqlite::params![connection_id, model_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        );
        let (num_ctx_val, context_window_val) = match query_res {
            Ok((nc, cw)) => (nc.map(|v| v as u32), cw.map(|v| v as u32)),
            Err(_) => (None, None),
        };
        let keep_alive_str = crate::db::settings::get(&db, "keep_alive").ok().flatten();
        let keep_alive = KeepAlive::from_str_opt(keep_alive_str.as_deref()).seconds();
        LocalOptions {
            num_ctx: Some(local_num_ctx(num_ctx_val, context_window_val)),
            keep_alive,
        }
    }

    pub fn context_tokens(&self, connection_id: u32, model_id: &str) -> Option<u32> {
        let db = match self.db.lock() {
            Ok(d) => d,
            Err(_) => return None,
        };
        let query_res: rusqlite::Result<(String, Option<i64>, Option<i64>)> = db.query_row(
            "SELECT c.kind, m.num_ctx, m.context_window
             FROM models m
             JOIN connections c ON m.connection_id = c.id
             WHERE m.connection_id = ?1 AND m.model_id = ?2",
            rusqlite::params![connection_id, model_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        );
        match query_res {
            Ok((kind_str, num_ctx, context_window)) => {
                let kind = ConnectionKind::from_db(&kind_str).unwrap_or(ConnectionKind::OpenaiCompat);
                if kind == ConnectionKind::Ollama {
                    Some(local_num_ctx(
                        num_ctx.map(|v| v as u32),
                        context_window.map(|w| w as u32),
                    ))
                } else {
                    context_window.map(|w| w as u32)
                }
            }
            Err(_) => None,
        }
    }

    pub fn set_model_context(&self, model_id: &str, num_ctx: u32) -> Result<(), AppError> {
        let db = self.db.lock().map_err(|e| AppError::Storage {
            message: e.to_string(),
        })?;
        let row_opt: Option<(u32, String, Option<i64>)> = db
            .query_row(
                "SELECT m.connection_id, c.kind, m.context_window
                 FROM models m
                 JOIN connections c ON m.connection_id = c.id
                 WHERE m.model_id = ?1
                 ORDER BY (c.kind = 'ollama') DESC, m.id
                 LIMIT 1",
                rusqlite::params![model_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()?;

        let (conn_id, kind_str, context_window) = row_opt.ok_or(AppError::NotFound)?;
        let kind = ConnectionKind::from_db(&kind_str).unwrap_or(ConnectionKind::OpenaiCompat);
        if kind != ConnectionKind::Ollama {
            return Err(AppError::InvalidInput {
                message: "Context length can only be set on local Ollama models.".to_string(),
            });
        }

        if num_ctx < 2048 {
            return Err(AppError::InvalidInput {
                message: "Context must be at least 2,048 tokens.".to_string(),
            });
        }

        if let Some(max) = context_window {
            let max = max as u32;
            if num_ctx > max {
                return Err(AppError::InvalidInput {
                    message: format!("Context cannot exceed the model's maximum of {} tokens.", max),
                });
            }
        }

        db.execute(
            "UPDATE models SET num_ctx = ?1 WHERE connection_id = ?2 AND model_id = ?3",
            rusqlite::params![num_ctx as i64, conn_id, model_id],
        )?;

        Ok(())
    }

    /// Deletes a downloaded model, then resyncs the picker.
    pub async fn delete_local_model(&self, name: &str) -> Result<(), AppError> {
        check_model_name(name)?;
        self.ollama().delete(name).await?;
        let _ = self.sync_local_models().await;
        Ok(())
    }

    /// Unloads a model from memory ("Free memory").
    pub async fn unload_local_model(&self, name: &str) -> Result<(), AppError> {
        check_model_name(name)?;
        self.ollama().unload(name).await?;
        Ok(())
    }

    pub async fn local_models(&self) -> Result<Vec<LocalModelView>, AppError> {
        let ollama = self.ollama();
        let tags = ollama.tags().await?;
        let loaded = ollama.loaded().await.unwrap_or_default();
        let ollama_id = self.ensure_ollama_connection()?;

        struct DbModelInfo {
            model_id: String,
            supports_tools: Option<bool>,
            context_window: Option<u32>,
            num_ctx: Option<u32>,
        }

        let rows: Vec<DbModelInfo> = {
            let db = self.db.lock().map_err(|e| AppError::Storage {
                message: e.to_string(),
            })?;
            let mut stmt = db.prepare(
                "SELECT model_id, supports_tools, context_window, num_ctx FROM models WHERE connection_id = ?1",
            )?;
            let mapped = stmt.query_map(rusqlite::params![ollama_id], |r| {
                let model_id: String = r.get(0)?;
                let st: Option<i64> = r.get(1)?;
                let cw: Option<i64> = r.get(2)?;
                let nc: Option<i64> = r.get(3)?;
                Ok(DbModelInfo {
                    model_id,
                    supports_tools: st.map(|v| v != 0),
                    context_window: cw.map(|v| v as u32),
                    num_ctx: nc.map(|v| v as u32),
                })
            })?;
            mapped.collect::<Result<Vec<_>, _>>()?
        };

        let mut result = Vec::with_capacity(tags.len());
        for tag in tags {
            let loaded_entry = loaded.iter().find(|l| l.name == tag.name).cloned();
            let db_info = rows.iter().find(|r| r.model_id == tag.name);
            let (supports_tools, context_length, num_ctx) = match db_info {
                Some(r) => (
                    r.supports_tools,
                    r.context_window,
                    local_num_ctx(r.num_ctx, r.context_window),
                ),
                None => (None, None, local_num_ctx(None, None)),
            };

            result.push(LocalModelView {
                name: tag.name,
                size_mb: tag.size_mb,
                parameter_size: tag.parameter_size,
                quantization: tag.quantization,
                loaded: loaded_entry,
                supports_tools,
                context_length,
                num_ctx,
            });
        }

        Ok(result)
    }

    pub fn provider_for(&self, connection_id: u32) -> Result<Box<dyn ModelProvider>, AppError> {
        let row = {
            let db = self.db.lock().map_err(|e| AppError::Storage {
                message: e.to_string(),
            })?;
            get_connection(&db, connection_id)?.ok_or(AppError::NotFound)?
        };

        let key = if row.kind == ConnectionKind::Ollama {
            SecretString::from(String::new())
        } else {
            match self.secrets.get(connection_id) {
                Ok(k) => k,
                Err(SecretError::NotFound) => return Err(AppError::KeyMissing),
                Err(SecretError::Unavailable(m)) => return Err(AppError::Keychain { message: m }),
            }
        };

        Ok(provider(row.kind, self.http.clone(), row.base_url, key))
    }

    pub async fn stream(
        &self,
        connection_id: u32,
        model_id: String,
        messages: Vec<ChatMessage>,
        out: Channel<ChatEvent>,
        cancel: CancellationToken,
    ) -> Result<Usage, AppError> {
        let prov = self.provider_for(connection_id)?;
        let local = self.model_options(connection_id, &model_id);
        let reply = prov
            .stream_chat(
                ChatRequest {
                    model: model_id,
                    messages,
                    tools: vec![],
                    rounds: vec![],
                    local,
                },
                out,
                cancel,
            )
            .await?;
        Ok(reply.usage)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keep_alive_seconds_table() {
        assert_eq!(KeepAlive::OllamaDefault.seconds(), None);
        assert_eq!(KeepAlive::FiveMinutes.seconds(), Some(300));
        assert_eq!(KeepAlive::ThirtyMinutes.seconds(), Some(1800));
        assert_eq!(KeepAlive::OneHour.seconds(), Some(3600));
        assert_eq!(KeepAlive::UntilFreed.seconds(), Some(-1));
        assert_eq!(KeepAlive::AfterEachReply.seconds(), Some(0));
    }
}
