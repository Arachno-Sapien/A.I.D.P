use crate::gateway::{ConnectionKind, ModelInfo};
use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConnectionRow {
    pub id: u32,
    pub kind: ConnectionKind,
    pub label: String,
    pub base_url: String,
    pub key_hint: String,
    pub last_tested_at: Option<u32>,
    pub last_test_ok: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatModelRow {
    pub connection_id: u32,
    pub connection_label: String,
    pub model_id: String,
    pub display_name: String,
    pub is_default: bool,
}

fn parse_connection_row(row: &rusqlite::Row) -> rusqlite::Result<ConnectionRow> {
    let id_i64: i64 = row.get(0)?;
    let id =
        u32::try_from(id_i64).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(0, id_i64))?;
    let kind_str: String = row.get(1)?;
    let kind = ConnectionKind::from_db(&kind_str).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            1,
            rusqlite::types::Type::Text,
            Box::new(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("unknown connection kind: {kind_str}"),
            )),
        )
    })?;
    let label: String = row.get(2)?;
    let base_url: String = row.get(3)?;
    let key_hint: String = row.get(4)?;
    let last_tested_at_i64: Option<i64> = row.get(5)?;
    let last_tested_at = match last_tested_at_i64 {
        Some(v) => {
            Some(u32::try_from(v).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(5, v))?)
        }
        None => None,
    };
    let last_test_ok_int: Option<i64> = row.get(6)?;
    let last_test_ok = last_test_ok_int.map(|v| v != 0);

    Ok(ConnectionRow {
        id,
        kind,
        label,
        base_url,
        key_hint,
        last_tested_at,
        last_test_ok,
    })
}

pub fn insert_connection(
    conn: &Connection,
    kind: ConnectionKind,
    label: &str,
    base_url: &str,
    key_hint: &str,
    now: u32,
) -> rusqlite::Result<u32> {
    conn.execute(
        "INSERT INTO connections (kind, label, base_url, key_hint, last_tested_at, last_test_ok) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![kind.as_db(), label, base_url, key_hint, now, 1],
    )?;
    let rowid = conn.last_insert_rowid();
    u32::try_from(rowid).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(1, rowid))
}

pub fn list_connections(conn: &Connection) -> rusqlite::Result<Vec<ConnectionRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, kind, label, base_url, key_hint, last_tested_at, last_test_ok FROM connections ORDER BY id ASC",
    )?;
    let rows = stmt.query_map([], parse_connection_row)?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn get_connection(conn: &Connection, id: u32) -> rusqlite::Result<Option<ConnectionRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, kind, label, base_url, key_hint, last_tested_at, last_test_ok FROM connections WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map(params![id], parse_connection_row)?;

    match rows.next() {
        Some(r) => Ok(Some(r?)),
        None => Ok(None),
    }
}

pub fn delete_connection(conn: &Connection, id: u32) -> rusqlite::Result<bool> {
    let count = conn.execute("DELETE FROM connections WHERE id = ?1", params![id])?;
    Ok(count > 0)
}

pub fn update_key_hint(conn: &Connection, id: u32, hint: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE connections SET key_hint = ?1 WHERE id = ?2",
        params![hint, id],
    )?;
    Ok(())
}

pub fn record_test(conn: &Connection, id: u32, ok: bool, now: u32) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE connections SET last_tested_at = ?1, last_test_ok = ?2 WHERE id = ?3",
        params![now, if ok { 1 } else { 0 }, id],
    )?;
    Ok(())
}

pub fn set_models(
    conn: &mut Connection,
    connection_id: u32,
    models: &[ModelInfo],
) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;

    let previous_default: Option<String> = tx
        .query_row(
            "SELECT model_id FROM models WHERE connection_id = ?1 AND is_default = 1",
            params![connection_id],
            |row| row.get(0),
        )
        .optional()?;

    let other_defaults_count: i64 = tx.query_row(
        "SELECT COUNT(*) FROM models WHERE is_default = 1 AND connection_id != ?1",
        params![connection_id],
        |row| row.get(0),
    )?;

    tx.execute(
        "DELETE FROM models WHERE connection_id = ?1",
        params![connection_id],
    )?;

    let target_default_model_id = if let Some(prev) = &previous_default
        && models.iter().any(|m| &m.id == prev)
    {
        Some(prev.clone())
    } else if other_defaults_count == 0 && !models.is_empty() {
        Some(models[0].id.clone())
    } else {
        None
    };

    let mut stmt = tx.prepare(
        "INSERT INTO models (connection_id, model_id, display_name, context_window, is_default) VALUES (?1, ?2, ?3, ?4, ?5)",
    )?;

    for model in models {
        let is_default = target_default_model_id.as_deref() == Some(&model.id);
        stmt.execute(params![
            connection_id,
            model.id,
            model.display_name,
            model.context_window,
            if is_default { 1 } else { 0 },
        ])?;
    }
    drop(stmt);

    tx.commit()?;
    Ok(())
}

pub fn list_chat_models(conn: &Connection) -> rusqlite::Result<Vec<ChatModelRow>> {
    let mut stmt = conn.prepare(
        "SELECT m.connection_id, c.label, m.model_id, m.display_name, m.is_default
         FROM models m
         JOIN connections c ON m.connection_id = c.id
         ORDER BY m.is_default DESC, m.connection_id ASC, m.display_name ASC",
    )?;

    let rows = stmt.query_map([], |row| {
        let conn_id_i64: i64 = row.get(0)?;
        let connection_id = u32::try_from(conn_id_i64)
            .map_err(|_| rusqlite::Error::IntegralValueOutOfRange(0, conn_id_i64))?;
        let connection_label: String = row.get(1)?;
        let model_id: String = row.get(2)?;
        let display_name: String = row.get(3)?;
        let is_default_int: i64 = row.get(4)?;
        let is_default = is_default_int != 0;

        Ok(ChatModelRow {
            connection_id,
            connection_label,
            model_id,
            display_name,
            is_default,
        })
    })?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row?);
    }
    Ok(result)
}

pub fn set_default_model(
    conn: &mut Connection,
    connection_id: u32,
    model_id: &str,
) -> rusqlite::Result<bool> {
    let tx = conn.transaction()?;

    let count: i64 = tx.query_row(
        "SELECT COUNT(*) FROM models WHERE connection_id = ?1 AND model_id = ?2",
        params![connection_id, model_id],
        |row| row.get(0),
    )?;

    if count == 0 {
        return Ok(false);
    }

    tx.execute("UPDATE models SET is_default = 0 WHERE is_default = 1", [])?;
    tx.execute(
        "UPDATE models SET is_default = 1 WHERE connection_id = ?1 AND model_id = ?2",
        params![connection_id, model_id],
    )?;

    tx.commit()?;
    Ok(true)
}
