use crate::mcp::ServerConfig;
use rusqlite::{params, Connection};

pub fn list(conn: &Connection) -> rusqlite::Result<Vec<ServerConfig>> {
    let mut stmt =
        conn.prepare("SELECT id, name, command, enabled FROM mcp_servers ORDER BY id;")?;
    let rows = stmt.query_map([], |row| {
        let enabled_int: i64 = row.get(3)?;
        Ok(ServerConfig {
            id: row.get(0)?,
            name: row.get(1)?,
            command: row.get(2)?,
            enabled: enabled_int != 0,
        })
    })?;
    rows.collect()
}

pub fn add(conn: &Connection, name: &str, command: &str) -> rusqlite::Result<u32> {
    conn.execute(
        "INSERT INTO mcp_servers (name, command, enabled) VALUES (?1, ?2, 1);",
        params![name, command],
    )?;
    Ok(conn.last_insert_rowid() as u32)
}

pub fn set_enabled(conn: &Connection, id: u32, enabled: bool) -> rusqlite::Result<usize> {
    conn.execute(
        "UPDATE mcp_servers SET enabled = ?1 WHERE id = ?2;",
        params![i32::from(enabled), id],
    )
}

pub fn delete(conn: &Connection, id: u32) -> rusqlite::Result<usize> {
    conn.execute("DELETE FROM mcp_servers WHERE id = ?1;", [id])
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    #[test]
    fn servers_round_trip() {
        let conn = open_in_memory().unwrap();
        assert_eq!(list(&conn).unwrap(), Vec::new());

        let id1 = add(&conn, "browser", "npx -y @playwright/mcp").unwrap();
        let id2 = add(&conn, "docs", "node docs.js").unwrap();
        assert!(add(&conn, "browser", "other").is_err());

        let rows = list(&conn).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].id, id1);
        assert_eq!(rows[0].name, "browser");
        assert!(rows[0].enabled);
        assert_eq!(rows[1].id, id2);
        assert_eq!(rows[1].name, "docs");

        assert_eq!(set_enabled(&conn, id1, false).unwrap(), 1);
        assert_eq!(set_enabled(&conn, 999, true).unwrap(), 0);
        let rows = list(&conn).unwrap();
        assert!(!rows[0].enabled);

        assert_eq!(delete(&conn, id1).unwrap(), 1);
        assert_eq!(delete(&conn, 999).unwrap(), 0);
        let rows = list(&conn).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, id2);
    }
}
