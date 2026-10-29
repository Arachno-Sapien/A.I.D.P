use crate::db::connections::{
    delete_connection, get_connection, insert_connection, list_chat_models, list_connections,
    record_test, set_default_model, set_models, update_key_hint, ConnectionRow,
};
use crate::gateway::url::check_base_url;
use crate::gateway::{
    provider, ChatEvent, ChatMessage, ChatRequest, ConnectionKind, ModelInfo, ProviderError, Usage,
};
use crate::secrets::{key_hint, SecretError, SecretStore};
use rusqlite::Connection;
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

fn now_secs() -> u32 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as u32)
        .unwrap_or(0)
}

pub struct Services {
    db: Mutex<Connection>,
    secrets: Arc<dyn SecretStore>,
    http: reqwest::Client,
}

impl Services {
    pub fn new(db: Connection, secrets: Arc<dyn SecretStore>, http: reqwest::Client) -> Self {
        Self {
            db: Mutex::new(db),
            secrets,
            http,
        }
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
        let exists = {
            let db = self.db.lock().map_err(|e| AppError::Storage {
                message: e.to_string(),
            })?;
            get_connection(&db, id)?.is_some()
        };

        if !exists {
            return Err(AppError::NotFound);
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
            .map(|r| ChatModel {
                connection_id: r.connection_id,
                connection_label: r.connection_label,
                model_id: r.model_id,
                display_name: r.display_name,
                is_default: r.is_default,
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

    pub async fn stream(
        &self,
        connection_id: u32,
        model_id: String,
        messages: Vec<ChatMessage>,
        out: Channel<ChatEvent>,
        cancel: CancellationToken,
    ) -> Result<Usage, AppError> {
        let row = {
            let db = self.db.lock().map_err(|e| AppError::Storage {
                message: e.to_string(),
            })?;
            get_connection(&db, connection_id)?.ok_or(AppError::NotFound)?
        };

        let key = match self.secrets.get(connection_id) {
            Ok(k) => k,
            Err(SecretError::NotFound) => return Err(AppError::KeyMissing),
            Err(SecretError::Unavailable(m)) => return Err(AppError::Keychain { message: m }),
        };

        let prov = provider(row.kind, self.http.clone(), row.base_url, key);
        let usage = prov
            .stream_chat(
                ChatRequest {
                    model: model_id,
                    messages,
                },
                out,
                cancel,
            )
            .await?;
        Ok(usage)
    }
}
