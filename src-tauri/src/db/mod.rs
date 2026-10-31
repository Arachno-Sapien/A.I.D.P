pub mod connections;
pub mod conversations;
pub mod settings;

use rusqlite::Connection;
use std::path::Path;

const MIGRATIONS: &[&str] = &[
    r#"
CREATE TABLE connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  last_tested_at INTEGER,
  last_test_ok INTEGER
);
CREATE TABLE models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  connection_id INTEGER NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  context_window INTEGER,
  is_default INTEGER NOT NULL DEFAULT 0,
  UNIQUE (connection_id, model_id)
);
"#,
    r#"
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"#,
    r#"
ALTER TABLE models ADD COLUMN supports_tools INTEGER;
"#,
    r#"
CREATE TABLE conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  workspace_path TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content_parts TEXT NOT NULL,
  model_ref TEXT,
  model_name TEXT,
  status TEXT NOT NULL,
  error_kind TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX messages_by_conversation ON messages (conversation_id, id);
ALTER TABLE models ADD COLUMN num_ctx INTEGER;
"#,
    r#"
ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
"#,
];

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let mut conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    migrate(&mut conn)?;
    Ok(conn)
}

pub fn open_in_memory() -> rusqlite::Result<Connection> {
    let mut conn = Connection::open_in_memory()?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    migrate(&mut conn)?;
    Ok(conn)
}

fn migrate(conn: &mut Connection) -> rusqlite::Result<()> {
    let current_version: u32 = conn.query_row("PRAGMA user_version;", [], |row| row.get(0))?;
    let start = current_version as usize;
    for (idx, sql) in MIGRATIONS.iter().enumerate().skip(start) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        let next_version = (idx + 1) as i32;
        tx.pragma_update(None, "user_version", next_version)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use crate::db::connections::*;
    use crate::gateway::{ConnectionKind, ModelInfo};

    #[test]
    fn migrations_apply_once() {
        let mut conn = open_in_memory().unwrap();
        let version: i32 = conn
            .query_row("PRAGMA user_version;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 5);

        migrate(&mut conn).unwrap();
        let version_after: i32 = conn
            .query_row("PRAGMA user_version;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version_after, 5);
    }

    #[test]
    fn chat_models_carry_tool_support() {
        let mut conn = open_in_memory().unwrap();
        let id = insert_connection(
            &conn,
            ConnectionKind::OpenaiCompat,
            "OpenRouter",
            "https://openrouter.ai/api/v1",
            "1234",
            100,
        )
        .unwrap();

        let m1 = ModelInfo {
            id: "m1".to_string(),
            display_name: "M1".to_string(),
            context_window: None,
            supports_tools: Some(true),
        };
        let m2 = ModelInfo {
            id: "m2".to_string(),
            display_name: "M2".to_string(),
            context_window: None,
            supports_tools: Some(false),
        };
        let m3 = ModelInfo {
            id: "m3".to_string(),
            display_name: "M3".to_string(),
            context_window: None,
            supports_tools: None,
        };

        set_models(&mut conn, id, &[m1, m2, m3]).unwrap();
        let rows = list_chat_models(&conn).unwrap();
        assert_eq!(rows.len(), 3);
        let r1 = rows.iter().find(|r| r.model_id == "m1").unwrap();
        let r2 = rows.iter().find(|r| r.model_id == "m2").unwrap();
        let r3 = rows.iter().find(|r| r.model_id == "m3").unwrap();
        assert_eq!(r1.supports_tools, Some(true));
        assert_eq!(r2.supports_tools, Some(false));
        assert_eq!(r3.supports_tools, None);
    }

    #[test]
    fn set_models_preserves_num_ctx() {
        let mut conn = open_in_memory().unwrap();
        let id = insert_connection(
            &conn,
            ConnectionKind::OpenaiCompat,
            "OpenRouter",
            "https://openrouter.ai/api/v1",
            "1234",
            100,
        )
        .unwrap();

        let m1 = ModelInfo {
            id: "m1".to_string(),
            display_name: "M1".to_string(),
            context_window: Some(32768),
            supports_tools: Some(true),
        };
        let m2 = ModelInfo {
            id: "m2".to_string(),
            display_name: "M2".to_string(),
            context_window: Some(8192),
            supports_tools: Some(true),
        };

        set_models(&mut conn, id, &[m1.clone(), m2.clone()]).unwrap();

        // Directly set num_ctx for m1 in models table
        conn.execute(
            "UPDATE models SET num_ctx = 4096 WHERE connection_id = ?1 AND model_id = 'm1'",
            rusqlite::params![id],
        )
        .unwrap();

        // Call set_models again with updated display names
        let m1_updated = ModelInfo {
            id: "m1".to_string(),
            display_name: "M1 (Renamed)".to_string(),
            context_window: Some(32768),
            supports_tools: Some(true),
        };
        set_models(&mut conn, id, &[m1_updated, m2]).unwrap();

        // Verify num_ctx is preserved for m1
        let num_ctx_m1: Option<u32> = conn
            .query_row(
                "SELECT num_ctx FROM models WHERE connection_id = ?1 AND model_id = 'm1'",
                rusqlite::params![id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(num_ctx_m1, Some(4096));

        // Verify m2 has no num_ctx
        let num_ctx_m2: Option<u32> = conn
            .query_row(
                "SELECT num_ctx FROM models WHERE connection_id = ?1 AND model_id = 'm2'",
                rusqlite::params![id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(num_ctx_m2, None);
    }

    #[test]
    fn deleting_a_connection_cascades_to_models() {
        let mut conn = open_in_memory().unwrap();
        let id = insert_connection(
            &conn,
            ConnectionKind::OpenaiCompat,
            "OpenRouter",
            "https://openrouter.ai/api/v1",
            "1234",
            100,
        )
        .unwrap();

        set_models(
            &mut conn,
            id,
            &[ModelInfo {
                id: "m1".to_string(),
                display_name: "Model 1".to_string(),
                context_window: Some(4096),
                supports_tools: None,
            }],
        )
        .unwrap();

        let count: i64 = conn
            .query_row("SELECT count(*) FROM models;", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);

        let deleted = delete_connection(&conn, id).unwrap();
        assert!(deleted);

        let count_after: i64 = conn
            .query_row("SELECT count(*) FROM models;", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count_after, 0);
    }

    #[test]
    fn set_models_replaces_the_set_and_keeps_the_default() {
        let mut conn = open_in_memory().unwrap();
        let id = insert_connection(
            &conn,
            ConnectionKind::OpenaiCompat,
            "OpenRouter",
            "https://openrouter.ai/api/v1",
            "1234",
            100,
        )
        .unwrap();

        let m_a = ModelInfo {
            id: "a".to_string(),
            display_name: "A".to_string(),
            context_window: None,
            supports_tools: None,
        };
        let m_b = ModelInfo {
            id: "b".to_string(),
            display_name: "B".to_string(),
            context_window: None,
            supports_tools: None,
        };
        let m_c = ModelInfo {
            id: "c".to_string(),
            display_name: "C".to_string(),
            context_window: None,
            supports_tools: None,
        };

        set_models(&mut conn, id, &[m_a, m_b.clone()]).unwrap();
        set_default_model(&mut conn, id, "b").unwrap();

        set_models(&mut conn, id, &[m_b, m_c]).unwrap();

        let rows = list_chat_models(&conn).unwrap();
        assert_eq!(rows.len(), 2);
        let b = rows.iter().find(|r| r.model_id == "b").unwrap();
        assert!(b.is_default);
        let c = rows.iter().find(|r| r.model_id == "c").unwrap();
        assert!(!c.is_default);
        assert!(rows.iter().all(|r| r.model_id != "a"));
    }

    #[test]
    fn first_models_become_default_only_when_none_exists() {
        let mut conn = open_in_memory().unwrap();
        let id1 = insert_connection(
            &conn,
            ConnectionKind::OpenaiCompat,
            "Conn 1",
            "https://api1.com",
            "1111",
            100,
        )
        .unwrap();
        let id2 = insert_connection(
            &conn,
            ConnectionKind::Anthropic,
            "Conn 2",
            "https://api2.com",
            "2222",
            100,
        )
        .unwrap();

        let m1 = ModelInfo {
            id: "m1".to_string(),
            display_name: "M1".to_string(),
            context_window: None,
            supports_tools: None,
        };
        let m2 = ModelInfo {
            id: "m2".to_string(),
            display_name: "M2".to_string(),
            context_window: None,
            supports_tools: None,
        };
        let m3 = ModelInfo {
            id: "m3".to_string(),
            display_name: "M3".to_string(),
            context_window: None,
            supports_tools: None,
        };

        set_models(&mut conn, id1, &[m1, m2]).unwrap();
        set_models(&mut conn, id2, &[m3]).unwrap();

        let rows = list_chat_models(&conn).unwrap();
        let m1_row = rows.iter().find(|r| r.model_id == "m1").unwrap();
        let m2_row = rows.iter().find(|r| r.model_id == "m2").unwrap();
        let m3_row = rows.iter().find(|r| r.model_id == "m3").unwrap();

        assert!(m1_row.is_default);
        assert!(!m2_row.is_default);
        assert!(!m3_row.is_default);
    }

    #[test]
    fn set_default_model_clears_the_previous_default() {
        let mut conn = open_in_memory().unwrap();
        let id = insert_connection(
            &conn,
            ConnectionKind::OpenaiCompat,
            "Conn",
            "https://api.com",
            "1234",
            100,
        )
        .unwrap();

        let m1 = ModelInfo {
            id: "m1".to_string(),
            display_name: "M1".to_string(),
            context_window: None,
            supports_tools: None,
        };
        let m2 = ModelInfo {
            id: "m2".to_string(),
            display_name: "M2".to_string(),
            context_window: None,
            supports_tools: None,
        };

        set_models(&mut conn, id, &[m1, m2]).unwrap();
        let ok = set_default_model(&mut conn, id, "m2").unwrap();
        assert!(ok);

        let rows = list_chat_models(&conn).unwrap();
        let m1_row = rows.iter().find(|r| r.model_id == "m1").unwrap();
        let m2_row = rows.iter().find(|r| r.model_id == "m2").unwrap();
        assert!(!m1_row.is_default);
        assert!(m2_row.is_default);

        let unknown_ok = set_default_model(&mut conn, id, "unknown").unwrap();
        assert!(!unknown_ok);
    }

    #[test]
    fn chat_models_list_the_default_first() {
        let mut conn = open_in_memory().unwrap();
        let id = insert_connection(
            &conn,
            ConnectionKind::OpenaiCompat,
            "Conn",
            "https://api.com",
            "1234",
            100,
        )
        .unwrap();

        let m1 = ModelInfo {
            id: "a_model".to_string(),
            display_name: "A Model".to_string(),
            context_window: None,
            supports_tools: None,
        };
        let m2 = ModelInfo {
            id: "z_model".to_string(),
            display_name: "Z Model".to_string(),
            context_window: None,
            supports_tools: None,
        };

        set_models(&mut conn, id, &[m1, m2]).unwrap();
        set_default_model(&mut conn, id, "z_model").unwrap();

        let rows = list_chat_models(&conn).unwrap();
        assert_eq!(rows.first().unwrap().model_id, "z_model");
        assert!(rows.first().unwrap().is_default);
    }
}
