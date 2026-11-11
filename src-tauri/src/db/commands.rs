//! Commands the user chose to always allow in a folder (decision 0030).

use rusqlite::{params, Connection};
use serde::Serialize;
use specta::Type;

#[derive(Serialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AllowedCommand {
    pub folder: String,
    pub command: String,
}

/// Remembers `command` for `folder`. Only its ends are trimmed, so a match is exact.
pub fn allow(conn: &Connection, folder: &str, command: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO allowed_commands (folder, command) VALUES (?1, ?2);",
        params![folder, command.trim()],
    )?;
    Ok(())
}

pub fn is_allowed(conn: &Connection, folder: &str, command: &str) -> rusqlite::Result<bool> {
    conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM allowed_commands WHERE folder = ?1 AND command = ?2);",
        params![folder, command.trim()],
        |row| row.get(0),
    )
}

pub fn list(conn: &Connection) -> rusqlite::Result<Vec<AllowedCommand>> {
    let mut stmt =
        conn.prepare("SELECT folder, command FROM allowed_commands ORDER BY folder, command;")?;
    let rows = stmt.query_map([], |row| {
        Ok(AllowedCommand {
            folder: row.get(0)?,
            command: row.get(1)?,
        })
    })?;
    rows.collect()
}

pub fn remove(conn: &Connection, folder: &str, command: &str) -> rusqlite::Result<usize> {
    conn.execute(
        "DELETE FROM allowed_commands WHERE folder = ?1 AND command = ?2;",
        params![folder, command],
    )
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    #[test]
    fn allowed_command_is_exact() {
        let conn = open_in_memory().unwrap();
        let f = "C:/work/app";
        allow(&conn, f, "npm test").unwrap();
        allow(&conn, f, " npm test ").unwrap(); // the same command, stored once
        assert!(is_allowed(&conn, f, "  npm test\n").unwrap());
        assert!(!is_allowed(&conn, f, "npm test && del /q *").unwrap());
        assert!(!is_allowed(&conn, f, "npm  test").unwrap());
        assert!(!is_allowed(&conn, "C:/work/other", "npm test").unwrap());
        assert_eq!(
            list(&conn).unwrap(),
            vec![AllowedCommand { folder: f.into(), command: "npm test".into() }]
        );
        assert_eq!(remove(&conn, f, "npm test").unwrap(), 1);
        assert!(!is_allowed(&conn, f, "npm test").unwrap());
        assert_eq!(remove(&conn, f, "npm test").unwrap(), 0);
    }
}
