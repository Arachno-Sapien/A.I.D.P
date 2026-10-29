use rusqlite::{Connection, OptionalExtension};

pub fn get(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1;",
        [key],
        |row| row.get(0),
    )
    .optional()
}

pub fn set(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
        [key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_in_memory;

    #[test]
    fn settings_round_trip() {
        let conn = open_in_memory().unwrap();
        assert_eq!(get(&conn, "missing").unwrap(), None);

        set(&conn, "theme", "light").unwrap();
        assert_eq!(get(&conn, "theme").unwrap(), Some("light".to_string()));

        set(&conn, "theme", "dark").unwrap();
        assert_eq!(get(&conn, "theme").unwrap(), Some("dark".to_string()));
    }
}
