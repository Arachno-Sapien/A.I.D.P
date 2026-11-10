use std::fmt;
use std::time::Duration;

pub mod client;

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

