use crate::connections::{now_secs, AppError, Services};
use crate::db;
use crate::gateway::Role;
use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: u32,
    pub title: String,
    pub workspace_path: Option<String>,
    pub updated_at: u32,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NewMessage {
    pub role: Role,
    pub content_parts: String,
    pub model_ref: Option<String>,
    pub model_name: Option<String>,
    pub status: String,
    pub error_kind: Option<String>,
    pub tokens_in: Option<u32>,
    pub tokens_out: Option<u32>,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredMessage {
    pub id: u32,
    pub role: Role,
    pub content_parts: String,
    pub model_ref: Option<String>,
    pub model_name: Option<String>,
    pub status: String,
    pub error_kind: Option<String>,
    pub tokens_in: Option<u32>,
    pub tokens_out: Option<u32>,
    pub created_at: u32,
}

pub fn extract_title(first_text: &str) -> String {
    for line in first_text.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            if trimmed.chars().count() <= 60 {
                return trimmed.to_string();
            }
            return trimmed.chars().take(60).collect();
        }
    }
    "New chat".to_string()
}

impl Services {
    pub fn create_conversation(
        &self,
        first_text: &str,
        workspace_path: Option<String>,
    ) -> Result<Conversation, AppError> {
        let title = extract_title(first_text);
        let now = now_secs();
        let conn = self.db.lock().map_err(|_| AppError::Storage {
            message: "database lock poisoned".to_string(),
        })?;
        let id =
            db::conversations::insert_conversation(&conn, &title, workspace_path.as_deref(), now)?;
        Ok(Conversation {
            id,
            title,
            workspace_path,
            updated_at: now,
        })
    }

    pub fn conversations(
        &self,
        workspace_path: Option<String>,
    ) -> Result<Vec<Conversation>, AppError> {
        let conn = self.db.lock().map_err(|_| AppError::Storage {
            message: "database lock poisoned".to_string(),
        })?;
        let rows = db::conversations::list_conversations(&conn, workspace_path.as_deref())?;
        Ok(rows
            .into_iter()
            .map(|r| Conversation {
                id: r.id,
                title: r.title,
                workspace_path: r.workspace_path,
                updated_at: r.updated_at,
            })
            .collect())
    }

    pub fn delete_conversation(&self, id: u32) -> Result<(), AppError> {
        let conn = self.db.lock().map_err(|_| AppError::Storage {
            message: "database lock poisoned".to_string(),
        })?;
        let deleted = db::conversations::delete_conversation(&conn, id)?;
        if !deleted {
            return Err(AppError::NotFound);
        }
        Ok(())
    }

    pub fn messages(&self, conversation_id: u32) -> Result<Vec<StoredMessage>, AppError> {
        let conn = self.db.lock().map_err(|_| AppError::Storage {
            message: "database lock poisoned".to_string(),
        })?;
        let rows = db::conversations::list_messages(&conn, conversation_id)?;
        Ok(rows
            .into_iter()
            .map(|r| StoredMessage {
                id: r.id,
                role: Role::from_db(&r.role).unwrap_or(Role::User),
                content_parts: r.content_parts,
                model_ref: r.model_ref,
                model_name: r.model_name,
                status: r.status,
                error_kind: r.error_kind,
                tokens_in: r.tokens_in,
                tokens_out: r.tokens_out,
                created_at: r.created_at,
            })
            .collect())
    }

    pub fn append_message(
        &self,
        conversation_id: u32,
        message: NewMessage,
    ) -> Result<u32, AppError> {
        if message.status != "complete" && message.status != "stopped" && message.status != "error" {
            return Err(AppError::InvalidInput {
                message: format!("invalid message status: '{}'", message.status),
            });
        }

        let conn = self.db.lock().map_err(|_| AppError::Storage {
            message: "database lock poisoned".to_string(),
        })?;

        if !db::conversations::conversation_exists(&conn, conversation_id)? {
            return Err(AppError::NotFound);
        }

        let now = now_secs();
        let id = db::conversations::insert_message(&conn, conversation_id, &message, now)?;
        Ok(id)
    }
}
