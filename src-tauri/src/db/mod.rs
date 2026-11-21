pub mod connections;
pub mod commands;
pub mod conversations;
pub mod mcp;
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
    r#"
ALTER TABLE models ADD COLUMN supports_vision INTEGER;
"#,
    r#"
CREATE TABLE mcp_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  command TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
"#,
    r#"
ALTER TABLE mcp_servers ADD COLUMN auto_approve INTEGER NOT NULL DEFAULT 0;
"#,
    r#"
CREATE TABLE allowed_commands (
  folder TEXT NOT NULL,
  command TEXT NOT NULL,
  PRIMARY KEY (folder, command)
);
"#,
    r#"
ALTER TABLE models ADD COLUMN effort TEXT;
ALTER TABLE models ADD COLUMN effort_support TEXT;
"#,
    // Which saved message mentions which hex run, so the attachment check is a
    // lookup instead of a read of every message under the one lock. `long` marks
    // runs over 64 characters, which can hold an ID inside them.
    r#"
CREATE TABLE message_hex (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  hex TEXT NOT NULL,
  long INTEGER NOT NULL,
  PRIMARY KEY (message_id, hex)
);
CREATE INDEX message_hex_by_hex ON message_hex(hex);
CREATE INDEX message_hex_long ON message_hex(long) WHERE long = 1;
"#,
];

/// The migration that creates `message_hex`; existing messages are indexed with it.
const HEX_INDEX_MIGRATION: usize = 10;

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
        if idx == HEX_INDEX_MIGRATION {
            conversations::index_all_messages(&tx)?;
        }
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
        assert_eq!(version, 11);

        migrate(&mut conn).unwrap();
        let version_after: i32 = conn
            .query_row("PRAGMA user_version;", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version_after, 11);
    }

    fn saved_message(conn: &Connection, text: &str) -> (u32, u32) {
        use crate::db::conversations::{insert_conversation, insert_message};
        use crate::gateway::Role;
        use crate::history::NewMessage;
        let conv = insert_conversation(conn, "c", None, 100).unwrap();
        let msg = NewMessage {
            role: Role::User,
            content_parts: text.to_string(),
            model_ref: None,
            model_name: None,
            status: "complete".to_string(),
            error_kind: None,
            tokens_in: None,
            tokens_out: None,
        };
        (conv, insert_message(conn, conv, &msg, 100).unwrap())
    }

    fn in_use(conn: &Connection, ids: &[&str]) -> std::collections::HashSet<String> {
        let ids: Vec<String> = ids.iter().map(|s| s.to_string()).collect();
        crate::db::conversations::attachments_in_use(conn, &ids).unwrap()
    }

    /// The check reads the index, not the messages: blanking the stored text after
    /// saving doesn't hide the reference. An ID inside a longer hex run still counts.
    #[test]
    fn attachment_check_reads_the_index() {
        let conn = open_in_memory().unwrap();
        let exact = "a".repeat(64);
        let buried = format!("{}1", "0".repeat(63));
        let (conv, _) = saved_message(&conn, &format!(r#"{{"id":"{exact}","text":"ab{buried}cd"}}"#));
        conn.execute("UPDATE messages SET content_parts = ''", []).unwrap();

        let unused = "9".repeat(64);
        assert_eq!(
            in_use(&conn, &[&exact, &buried, &unused]),
            std::collections::HashSet::from([exact.clone(), buried.clone()])
        );

        crate::db::conversations::delete_conversation(&conn, conv).unwrap();
        assert!(in_use(&conn, &[&exact, &buried]).is_empty());
        let left: i64 = conn.query_row("SELECT COUNT(*) FROM message_hex", [], |r| r.get(0)).unwrap();
        assert_eq!(left, 0, "deleting the chat leaves index rows behind");
    }

    /// Messages saved before the index existed are indexed by the migration.
    #[test]
    fn the_index_migration_backfills_old_messages() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();
        for (idx, sql) in MIGRATIONS.iter().enumerate().take(10) {
            conn.execute_batch(sql).unwrap();
            conn.pragma_update(None, "user_version", (idx + 1) as i32).unwrap();
        }
        let old = "c".repeat(64);
        conn.execute("INSERT INTO conversations (title, created_at, updated_at) VALUES ('old', 1, 1)", [])
            .unwrap();
        conn.execute(
            "INSERT INTO messages (conversation_id, role, content_parts, status, created_at) VALUES (1, 'user', ?1, 'complete', 1)",
            [format!(r#"{{"id":"{old}"}}"#)],
        )
        .unwrap();

        migrate(&mut conn).unwrap();
        assert_eq!(in_use(&conn, &[&old]), std::collections::HashSet::from([old.clone()]));
    }

    fn model_with_support(id: &str, support: Option<&str>) -> ModelInfo {
        ModelInfo {
            id: id.to_string(),
            display_name: id.to_string(),
            context_window: None,
            supports_tools: None,
            effort_support: support.map(str::to_string),
        }
    }

    fn row<'a>(rows: &'a [ChatModelRow], id: &str) -> &'a ChatModelRow {
        rows.iter().find(|r| r.model_id == id).unwrap()
    }

    #[test]
    fn set_models_preserves_effort_and_refreshes_support() {
        let mut conn = open_in_memory().unwrap();
        let id = insert_connection(&conn, ConnectionKind::OpenaiCompat, "c", "https://x.test", "1234", 100).unwrap();
        set_models(&mut conn, id, &[model_with_support("a", Some("levels")), model_with_support("b", None)]).unwrap();
        assert!(set_effort(&conn, id, "a", Some("high")).unwrap());
        set_models(&mut conn, id, &[model_with_support("a", Some("none")), model_with_support("b", None)]).unwrap();
        let rows = list_chat_models(&conn).unwrap();
        assert_eq!(row(&rows, "a").effort.as_deref(), Some("high"));
        assert_eq!(row(&rows, "a").effort_support.as_deref(), Some("none"));
        assert_eq!(row(&rows, "b").effort, None);
    }

    #[test]
    fn effort_support_kept_when_the_provider_says_nothing() {
        let mut conn = open_in_memory().unwrap();
        let id = insert_connection(&conn, ConnectionKind::OpenaiCompat, "c", "https://x.test", "1234", 100).unwrap();
        set_models(&mut conn, id, &[model_with_support("a", None)]).unwrap();
        assert!(set_effort_support(&conn, id, "a", Some("none")).unwrap());
        set_models(&mut conn, id, &[model_with_support("a", None)]).unwrap();
        let rows = list_chat_models(&conn).unwrap();
        assert_eq!(row(&rows, "a").effort_support.as_deref(), Some("none"));
    }

    #[test]
    fn set_effort_on_a_missing_model_changes_nothing() {
        let conn = open_in_memory().unwrap();
        assert!(!set_effort(&conn, 1, "nope", Some("high")).unwrap());
        assert!(!set_effort_support(&conn, 1, "nope", Some("none")).unwrap());
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
            effort_support: None,
        };
        let m2 = ModelInfo {
            id: "m2".to_string(),
            display_name: "M2".to_string(),
            context_window: None,
            supports_tools: Some(false),
            effort_support: None,
        };
        let m3 = ModelInfo {
            id: "m3".to_string(),
            display_name: "M3".to_string(),
            context_window: None,
            supports_tools: None,
            effort_support: None,
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
    fn set_models_preserves_supports_vision() {
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
        let model = |id: &str| ModelInfo {
            id: id.to_string(),
            display_name: id.to_string(),
            context_window: None,
            supports_tools: None,
            effort_support: None,
        };
        set_models(&mut conn, id, &[model("yes"), model("no"), model("unset")]).unwrap();
        set_supports_vision(&conn, id, "yes", Some(true)).unwrap();
        set_supports_vision(&conn, id, "no", Some(false)).unwrap();

        set_models(&mut conn, id, &[model("yes"), model("no"), model("unset")]).unwrap();
        let rows = list_chat_models(&conn).unwrap();
        let vision = |m: &str| rows.iter().find(|r| r.model_id == m).unwrap().supports_vision;
        assert_eq!(vision("yes"), Some(true));
        assert_eq!(vision("no"), Some(false));
        assert_eq!(vision("unset"), None);
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
            effort_support: None,
        };
        let m2 = ModelInfo {
            id: "m2".to_string(),
            display_name: "M2".to_string(),
            context_window: Some(8192),
            supports_tools: Some(true),
            effort_support: None,
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
            effort_support: None,
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
                effort_support: None,
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
            effort_support: None,
        };
        let m_b = ModelInfo {
            id: "b".to_string(),
            display_name: "B".to_string(),
            context_window: None,
            supports_tools: None,
            effort_support: None,
        };
        let m_c = ModelInfo {
            id: "c".to_string(),
            display_name: "C".to_string(),
            context_window: None,
            supports_tools: None,
            effort_support: None,
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
            effort_support: None,
        };
        let m2 = ModelInfo {
            id: "m2".to_string(),
            display_name: "M2".to_string(),
            context_window: None,
            supports_tools: None,
            effort_support: None,
        };
        let m3 = ModelInfo {
            id: "m3".to_string(),
            display_name: "M3".to_string(),
            context_window: None,
            supports_tools: None,
            effort_support: None,
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
            effort_support: None,
        };
        let m2 = ModelInfo {
            id: "m2".to_string(),
            display_name: "M2".to_string(),
            context_window: None,
            supports_tools: None,
            effort_support: None,
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
            effort_support: None,
        };
        let m2 = ModelInfo {
            id: "z_model".to_string(),
            display_name: "Z Model".to_string(),
            context_window: None,
            supports_tools: None,
            effort_support: None,
        };

        set_models(&mut conn, id, &[m1, m2]).unwrap();
        set_default_model(&mut conn, id, "z_model").unwrap();

        let rows = list_chat_models(&conn).unwrap();
        assert_eq!(rows.first().unwrap().model_id, "z_model");
        assert!(rows.first().unwrap().is_default);
    }
}
