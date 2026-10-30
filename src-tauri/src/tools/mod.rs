use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(tag = "tool", rename_all = "camelCase")]
pub enum ToolAction {
    ListFiles { path: String },
    ReadFile { path: String },
    Search { query: String, path: String },
    EditFile { path: String, before: String, after: String },
    CreateFile { path: String, text: String },
    RunCommand { command: String, folder: String },
    Invalid { name: String },
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ToolOutcome {
    Ok { summary: String },
    Command {
        #[serde(rename = "exitCode")]
        exit_code: Option<i32>,
        output: String,
        #[serde(rename = "timedOut")]
        timed_out: bool,
    },
    Declined,
    Error { message: String },
    Stopped,
}

