use crate::connections::{AppError, Services};
use crate::gateway::ToolSpec;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fmt;
use std::time::Duration;

pub mod client;
pub mod hub;

pub const PROTOCOL_VERSION: &str = "2025-06-18";
pub const ACCEPTED_VERSIONS: [&str; 3] = ["2025-06-18", "2025-03-26", "2024-11-05"];
pub const START_TIMEOUT: Duration = Duration::from_secs(120);
pub const LIST_TIMEOUT: Duration = Duration::from_secs(30);
pub const CALL_TIMEOUT: Duration = Duration::from_secs(120);
pub const IDLE_STOP: Duration = Duration::from_secs(600);
pub const MAX_LINE_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_TOOLS_PER_SERVER: usize = 64;
pub const MAX_DESCRIPTION_CHARS: usize = 1024;
pub const MAX_COMMAND_CHARS: usize = 2000;
pub const STDERR_TAIL_BYTES: usize = 4096;
pub const NAME_PREFIX: &str = "mcp__";

#[derive(Debug, Clone, PartialEq)]
pub enum McpError {
    Start { message: String },
    Closed { stderr: String },
    Timeout,
    Stopped,
    Protocol { message: String },
    Rpc { code: i32, message: String },
}

impl fmt::Display for McpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Start { message } => write!(f, "The server could not be started: {message}"),
            Self::Closed { stderr } if stderr.is_empty() => write!(f, "The server stopped."),
            Self::Closed { stderr } => {
                write!(f, "The server stopped. Its last output: {stderr}")
            }
            Self::Timeout => write!(f, "The server did not answer in time."),
            Self::Stopped => write!(f, "Stopped."),
            Self::Protocol { message } => {
                write!(f, "The server sent something unexpected: {message}")
            }
            Self::Rpc { message, .. } => write!(f, "The server refused: {message}"),
        }
    }
}

impl std::error::Error for McpError {}

#[derive(Serialize, Deserialize, specta::Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    pub id: u32,
    pub name: String,
    pub command: String,
    pub enabled: bool,
}

/// `mcp__{server}__{tool}`, or `None` when the tool name is empty, has a character outside
/// `[A-Za-z0-9_-]`, or the full name is over 64 characters.
pub fn full_name(server: &str, tool: &str) -> Option<String> {
    if server.is_empty()
        || server.contains('_')
        || tool.is_empty()
        || !tool
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return None;
    }
    let name = format!("{NAME_PREFIX}{server}__{tool}");
    (name.len() <= 64).then_some(name)
}

/// `("browser", "browser_click")` for `"mcp__browser__browser_click"`; `None` for anything else.
/// Splits at the first `"__"` after the prefix (server names hold no underscore).
pub fn split_name(full: &str) -> Option<(&str, &str)> {
    let rest = full.strip_prefix(NAME_PREFIX)?;
    let (server, tool) = rest.split_once("__")?;
    if server.is_empty() || tool.is_empty() {
        return None;
    }
    Some((server, tool))
}

/// Ok when 1–16 characters of `[a-z0-9]`.
pub fn check_server_name(name: &str) -> Result<(), String> {
    if !name.is_empty()
        && name.len() <= 16
        && name
            .bytes()
            .all(|b| matches!(b, b'a'..=b'z' | b'0'..=b'9'))
    {
        Ok(())
    } else {
        Err("Use 1 to 16 lowercase letters and digits for the name.".to_string())
    }
}

/// Trims; Err when empty, over `MAX_COMMAND_CHARS`, or holding a control character.
pub fn check_command(command: &str) -> Result<String, String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("Enter the command that starts the server.".to_string());
    }
    if trimmed.chars().count() > MAX_COMMAND_CHARS {
        return Err("The command is too long.".to_string());
    }
    if trimmed.chars().any(char::is_control) {
        return Err("The command must be one line of plain text.".to_string());
    }
    Ok(trimmed.to_string())
}

/// An object schema stays, minus a top-level `"$schema"` key, plus `"type":"object"` if it has
/// no `"type"`; anything else becomes `{"type":"object","properties":{}}`.
pub fn normalise_schema(schema: &Value) -> Value {
    let Some(obj) = schema.as_object() else {
        return json!({ "type": "object", "properties": {} });
    };
    if let Some(t) = obj.get("type")
        && t.as_str() != Some("object")
    {
        return json!({ "type": "object", "properties": {} });
    }
    let mut copy = obj.clone();
    copy.remove("$schema");
    copy.entry("type".to_string())
        .or_insert_with(|| Value::String("object".to_string()));
    Value::Object(copy)
}

/// Converts a server's `RemoteTool` list into normalized `ToolSpec`s capped at `MAX_TOOLS_PER_SERVER`.
pub fn to_specs(server: &str, tools: &[client::RemoteTool]) -> Vec<ToolSpec> {
    let mut seen = HashSet::new();
    let mut specs = Vec::new();
    for tool in tools {
        if specs.len() >= MAX_TOOLS_PER_SERVER {
            break;
        }
        let Some(name) = full_name(server, &tool.name) else {
            continue;
        };
        if !seen.insert(name.clone()) {
            continue;
        }
        let description: String = tool
            .description
            .chars()
            .take(MAX_DESCRIPTION_CHARS)
            .collect();
        specs.push(ToolSpec {
            name,
            description,
            schema: normalise_schema(&tool.schema),
        });
    }
    specs
}

impl Services {
    pub fn mcp_servers(&self) -> Result<Vec<ServerConfig>, AppError> {
        let conn = self.db.lock().map_err(|e| AppError::Storage {
            message: e.to_string(),
        })?;
        crate::db::mcp::list(&conn).map_err(AppError::from)
    }

    pub fn add_mcp_server(&self, name: &str, command: &str) -> Result<ServerConfig, AppError> {
        check_server_name(name).map_err(|message| AppError::InvalidInput { message })?;
        let command =
            check_command(command).map_err(|message| AppError::InvalidInput { message })?;
        let conn = self.db.lock().map_err(|e| AppError::Storage {
            message: e.to_string(),
        })?;
        if crate::db::mcp::list(&conn)?
            .iter()
            .any(|s| s.name == name)
        {
            return Err(AppError::InvalidInput {
                message: "A server with that name already exists.".to_string(),
            });
        }
        let id = crate::db::mcp::add(&conn, name, &command)?;
        Ok(ServerConfig {
            id,
            name: name.to_string(),
            command,
            enabled: true,
        })
    }

    pub fn set_mcp_server_enabled(&self, id: u32, enabled: bool) -> Result<(), AppError> {
        let conn = self.db.lock().map_err(|e| AppError::Storage {
            message: e.to_string(),
        })?;
        let changed = crate::db::mcp::set_enabled(&conn, id, enabled)?;
        if changed == 0 {
            return Err(AppError::NotFound);
        }
        Ok(())
    }

    pub fn delete_mcp_server(&self, id: u32) -> Result<(), AppError> {
        let conn = self.db.lock().map_err(|e| AppError::Storage {
            message: e.to_string(),
        })?;
        let changed = crate::db::mcp::delete(&conn, id)?;
        if changed == 0 {
            return Err(AppError::NotFound);
        }
        Ok(())
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use crate::mcp::client::RemoteTool;
    use serde_json::json;

    #[test]
    fn tool_name_table() {
        assert_eq!(
            full_name("browser", "browser_click").as_deref(),
            Some("mcp__browser__browser_click")
        );
        assert_eq!(full_name("a", "get-item_2").as_deref(), Some("mcp__a__get-item_2"));
        assert_eq!(full_name("a", "has.dot"), None);
        assert_eq!(full_name("a", "has space"), None);
        assert_eq!(full_name("a", ""), None);
        // "mcp__" (5) + "a" (1) + "__" (2) + 56 = 64, the most a provider takes.
        assert_eq!(full_name("a", &"x".repeat(56)).map(|n| n.len()), Some(64));
        assert_eq!(full_name("a", &"x".repeat(57)), None);
        assert_eq!(
            split_name("mcp__browser__browser_click"),
            Some(("browser", "browser_click"))
        );
        assert_eq!(split_name("mcp__a__b__c"), Some(("a", "b__c")));
        assert_eq!(split_name("read_file"), None);
        assert_eq!(split_name("mcp__nounderscore"), None);
    }

    #[test]
    fn server_name_table() {
        assert_eq!(check_server_name("browser"), Ok(()));
        assert_eq!(check_server_name("a1"), Ok(()));
        let msg = "Use 1 to 16 lowercase letters and digits for the name.".to_string();
        assert_eq!(check_server_name(""), Err(msg.clone()));
        assert_eq!(check_server_name("Browser"), Err(msg.clone()));
        assert_eq!(check_server_name("my_server"), Err(msg.clone()));
        assert_eq!(check_server_name("a-b"), Err(msg.clone()));
        assert_eq!(check_server_name(&"a".repeat(17)), Err(msg));
    }

    #[test]
    fn command_table() {
        assert_eq!(check_command("  npx x  "), Ok("npx x".to_string()));
        assert_eq!(
            check_command(""),
            Err("Enter the command that starts the server.".to_string())
        );
        assert_eq!(
            check_command("   "),
            Err("Enter the command that starts the server.".to_string())
        );
        assert_eq!(
            check_command("a\nb"),
            Err("The command must be one line of plain text.".to_string())
        );
        assert_eq!(
            check_command("a\u{7}b"),
            Err("The command must be one line of plain text.".to_string())
        );
        assert_eq!(
            check_command(&"a".repeat(2001)),
            Err("The command is too long.".to_string())
        );
    }

    #[test]
    fn schema_is_normalised() {
        assert_eq!(
            normalise_schema(&json!({
                "type": "object",
                "$schema": "https://json-schema.org/draft/2020-12/schema",
                "properties": { "a": {} }
            })),
            json!({
                "type": "object",
                "properties": { "a": {} }
            })
        );
        assert_eq!(
            normalise_schema(&json!({ "properties": {} })),
            json!({ "type": "object", "properties": {} })
        );
        for bad in [json!(null), json!("str"), json!([])] {
            assert_eq!(
                normalise_schema(&bad),
                json!({ "type": "object", "properties": {} })
            );
        }
    }

    #[test]
    fn to_specs_skips_and_cuts() {
        let tools = vec![
            RemoteTool {
                name: "ok".to_string(),
                description: "first".to_string(),
                schema: json!({"type": "object"}),
            },
            RemoteTool {
                name: "bad.name".to_string(),
                description: "skipped".to_string(),
                schema: json!({"type": "object"}),
            },
            RemoteTool {
                name: "ok".to_string(),
                description: "duplicate".to_string(),
                schema: json!({"type": "object"}),
            },
            RemoteTool {
                name: "long".to_string(),
                description: "z".repeat(2000),
                schema: json!(null),
            },
        ];
        let specs = to_specs("s", &tools);
        assert_eq!(specs.len(), 2);
        assert_eq!(specs[0].name, "mcp__s__ok");
        assert_eq!(specs[0].description, "first");
        assert_eq!(specs[1].name, "mcp__s__long");
        assert_eq!(specs[1].description.chars().count(), 1024);
        assert_eq!(specs[1].schema, json!({"type": "object", "properties": {}}));

        let many: Vec<RemoteTool> = (0..70)
            .map(|i| RemoteTool {
                name: format!("tool_{i}"),
                description: String::new(),
                schema: json!({"type": "object"}),
            })
            .collect();
        assert_eq!(to_specs("s", &many).len(), 64);
    }
}

