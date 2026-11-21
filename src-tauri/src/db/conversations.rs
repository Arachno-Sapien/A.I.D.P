use crate::history::NewMessage;
use rusqlite::{params, Connection, OptionalExtension};

pub struct ConversationRow {
    pub id: u32,
    pub title: String,
    pub workspace_path: Option<String>,
    pub created_at: u32,
    pub updated_at: u32,
    pub pinned: bool,
    pub archived: bool,
}

pub struct MessageRow {
    pub id: u32,
    pub conversation_id: u32,
    pub role: String,
    pub content_parts: String,
    pub model_ref: Option<String>,
    pub model_name: Option<String>,
    pub status: String,
    pub error_kind: Option<String>,
    pub tokens_in: Option<u32>,
    pub tokens_out: Option<u32>,
    pub created_at: u32,
}

pub fn insert_conversation(
    conn: &Connection,
    title: &str,
    workspace_path: Option<&str>,
    now: u32,
) -> rusqlite::Result<u32> {
    conn.execute(
        "INSERT INTO conversations (title, workspace_path, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
        params![title, workspace_path, now, now],
    )?;
    let row_id = conn.last_insert_rowid();
    u32::try_from(row_id).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(0, row_id))
}

pub fn list_conversations(
    conn: &Connection,
    workspace_path: Option<&str>,
) -> rusqlite::Result<Vec<ConversationRow>> {
    let mut rows = Vec::new();
    if let Some(path) = workspace_path {
        let mut stmt = conn.prepare(
            "SELECT id, title, workspace_path, created_at, updated_at, pinned, archived
             FROM conversations
             WHERE workspace_path = ?1
             ORDER BY updated_at DESC, id DESC",
        )?;
        let mapped = stmt.query_map(params![path], map_conversation_row)?;
        for r in mapped {
            rows.push(r?);
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, title, workspace_path, created_at, updated_at, pinned, archived
             FROM conversations
             WHERE workspace_path IS NULL
             ORDER BY updated_at DESC, id DESC",
        )?;
        let mapped = stmt.query_map([], map_conversation_row)?;
        for r in mapped {
            rows.push(r?);
        }
    }
    Ok(rows)
}

fn map_conversation_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ConversationRow> {
    let id_i64: i64 = row.get(0)?;
    let id = u32::try_from(id_i64).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(0, id_i64))?;
    let title: String = row.get(1)?;
    let workspace_path: Option<String> = row.get(2)?;
    let created_at_i64: i64 = row.get(3)?;
    let created_at = u32::try_from(created_at_i64)
        .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(3, created_at_i64))?;
    let updated_at_i64: i64 = row.get(4)?;
    let updated_at = u32::try_from(updated_at_i64)
        .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(4, updated_at_i64))?;
    let pinned_i64: i64 = row.get(5)?;
    let pinned = pinned_i64 != 0;
    let archived_i64: i64 = row.get(6)?;
    let archived = archived_i64 != 0;
    Ok(ConversationRow {
        id,
        title,
        workspace_path,
        created_at,
        updated_at,
        pinned,
        archived,
    })
}

pub fn delete_conversation(conn: &Connection, id: u32) -> rusqlite::Result<bool> {
    let affected = conn.execute(
        "DELETE FROM conversations WHERE id = ?1",
        params![id],
    )?;
    Ok(affected > 0)
}

/// Length of an attachment ID (SHA-256 in hex).
const ID_LEN: usize = 64;

/// Every run of hex digits at least as long as an attachment ID.
fn hex_runs(text: &str) -> impl Iterator<Item = &str> {
    text.split(|c: char| !c.is_ascii_hexdigit())
        .filter(|run| run.len() >= ID_LEN)
}

/// Records the hex runs `text` holds against message `message_id`, so the attachment
/// check never has to read the messages themselves.
fn index_message(conn: &Connection, message_id: u32, text: &str) -> rusqlite::Result<()> {
    let mut stmt =
        conn.prepare_cached("INSERT OR IGNORE INTO message_hex (message_id, hex, long) VALUES (?1, ?2, ?3)")?;
    for run in hex_runs(text) {
        stmt.execute(params![message_id, run, run.len() > ID_LEN])?;
    }
    Ok(())
}

/// Indexes every saved message; run once by the migration that creates `message_hex`.
pub fn index_all_messages(conn: &Connection) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare("SELECT id, content_parts FROM messages")?;
    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let id: u32 = row.get(0)?;
        let text: String = row.get(1)?;
        index_message(conn, id, &text)?;
    }
    Ok(())
}

/// The attachment IDs among `ids` that some message's stored parts mention, anywhere
/// in the text, as a substring search would find them. An ID that is a whole hex run
/// is one indexed lookup; one inside a longer run is found by searching only the
/// (rare) long runs, never the messages.
pub fn attachments_in_use(
    conn: &Connection,
    ids: &[String],
) -> rusqlite::Result<std::collections::HashSet<String>> {
    let mut used = std::collections::HashSet::new();
    let mut exact = conn.prepare_cached("SELECT 1 FROM message_hex WHERE hex = ?1 LIMIT 1")?;
    for id in ids {
        if exact.exists([id])? {
            used.insert(id.clone());
        }
    }
    let rest: std::collections::HashSet<&str> = ids
        .iter()
        .map(String::as_str)
        .filter(|id| !used.contains(*id))
        .collect();
    if rest.is_empty() {
        return Ok(used);
    }
    // ponytail: scans every long run; fine while they are rare (pasted hex dumps).
    let mut long = conn.prepare("SELECT hex FROM message_hex WHERE long = 1")?;
    let mut rows = long.query([])?;
    while let Some(row) = rows.next()? {
        let run: String = row.get(0)?;
        // ASCII hex digits only, so every window is on a char boundary.
        for s in 0..=run.len() - ID_LEN {
            if let Some(id) = rest.get(&run[s..s + ID_LEN]) {
                used.insert((*id).to_string());
            }
        }
        if used.len() == ids.len() {
            break;
        }
    }
    Ok(used)
}

pub fn set_pinned(conn: &Connection, id: u32, pinned: bool) -> rusqlite::Result<bool> {
    let affected = conn.execute(
        "UPDATE conversations SET pinned = ?1 WHERE id = ?2",
        params![if pinned { 1 } else { 0 }, id],
    )?;
    Ok(affected > 0)
}

pub fn set_archived(conn: &Connection, id: u32, archived: bool) -> rusqlite::Result<bool> {
    let affected = if archived {
        conn.execute(
            "UPDATE conversations SET archived = 1, pinned = 0 WHERE id = ?1",
            params![id],
        )?
    } else {
        conn.execute(
            "UPDATE conversations SET archived = 0 WHERE id = ?1",
            params![id],
        )?
    };
    Ok(affected > 0)
}

pub fn insert_message(
    conn: &Connection,
    conversation_id: u32,
    msg: &NewMessage,
    now: u32,
) -> rusqlite::Result<u32> {
    // One transaction with the index rows: a message saved without them could have
    // its attachment removed as unused.
    let tx = conn.unchecked_transaction()?;
    let conn = &tx;
    conn.execute(
        "INSERT INTO messages (conversation_id, role, content_parts, model_ref, model_name, status, error_kind, tokens_in, tokens_out, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            conversation_id,
            msg.role.as_str(),
            msg.content_parts,
            msg.model_ref,
            msg.model_name,
            msg.status,
            msg.error_kind,
            msg.tokens_in,
            msg.tokens_out,
            now,
        ],
    )?;
    let row_id = conn.last_insert_rowid();
    let msg_id =
        u32::try_from(row_id).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(0, row_id))?;
    index_message(conn, msg_id, &msg.content_parts)?;

    conn.execute(
        "UPDATE conversations SET updated_at = CASE WHEN updated_at >= ?1 THEN updated_at + 1 ELSE ?1 END, archived = 0 WHERE id = ?2",
        params![now, conversation_id],
    )?;
    tx.commit()?;

    Ok(msg_id)
}

pub fn list_messages(conn: &Connection, conversation_id: u32) -> rusqlite::Result<Vec<MessageRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, conversation_id, role, content_parts, model_ref, model_name, status, error_kind, tokens_in, tokens_out, created_at
         FROM messages
         WHERE conversation_id = ?1
         ORDER BY id ASC",
    )?;

    let rows = stmt.query_map(params![conversation_id], |row| {
        let id_i64: i64 = row.get(0)?;
        let id =
            u32::try_from(id_i64).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(0, id_i64))?;
        let conv_id_i64: i64 = row.get(1)?;
        let conversation_id = u32::try_from(conv_id_i64)
            .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(1, conv_id_i64))?;
        let role: String = row.get(2)?;
        let content_parts: String = row.get(3)?;
        let model_ref: Option<String> = row.get(4)?;
        let model_name: Option<String> = row.get(5)?;
        let status: String = row.get(6)?;
        let error_kind: Option<String> = row.get(7)?;
        let tokens_in_i64: Option<i64> = row.get(8)?;
        let tokens_in = tokens_in_i64
            .map(u32::try_from)
            .transpose()
            .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(8, tokens_in_i64.unwrap_or(0)))?;
        let tokens_out_i64: Option<i64> = row.get(9)?;
        let tokens_out = tokens_out_i64
            .map(u32::try_from)
            .transpose()
            .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(9, tokens_out_i64.unwrap_or(0)))?;
        let created_at_i64: i64 = row.get(10)?;
        let created_at = u32::try_from(created_at_i64)
            .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(10, created_at_i64))?;

        Ok(MessageRow {
            id,
            conversation_id,
            role,
            content_parts,
            model_ref,
            model_name,
            status,
            error_kind,
            tokens_in,
            tokens_out,
            created_at,
        })
    })?;

    let mut result = Vec::new();
    for r in rows {
        result.push(r?);
    }
    Ok(result)
}

pub fn conversation_exists(conn: &Connection, id: u32) -> rusqlite::Result<bool> {
    let exists: Option<i64> = conn
        .query_row(
            "SELECT 1 FROM conversations WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(exists.is_some())
}
