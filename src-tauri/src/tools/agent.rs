use super::approvals::{Answer, Approvals};
use super::command;
use super::run;
use super::{agent_system_for, head, show_arguments, specs, ToolAction, ToolOutcome, MAX_STEPS};
use crate::gateway::{
    ChatEvent, ChatMessage, ChatRequest, ImageInput, ModelProvider, ProviderError, Role,
    ToolOutput, ToolRound, Usage,
};
use crate::mcp::hub::Hub;
use crate::mcp::{split_name, McpError, ServerConfig, CALL_TIMEOUT};
use crate::workspace::display_path;
use std::path::PathBuf;
use std::time::Duration;
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

pub struct McpAccess<'a> {
    pub hub: &'a Hub,
    pub servers: Vec<ServerConfig>,
}

pub struct AgentRun<'a> {
    pub provider: &'a dyn ModelProvider,
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub root: PathBuf,
    pub approvals: &'a Approvals,
    pub out: Channel<ChatEvent>,
    pub cancel: CancellationToken,
    pub command_timeout: Duration,
    pub local: crate::gateway::LocalOptions,
    pub text_limit: usize,
    /// Edits and new files are written without asking; the UI shows them all for
    /// review when the run ends (decision 0028). Commands and outside tools still ask.
    pub review_at_end: bool,
    /// The user let this task's commands run without asking (decision 0030).
    pub run_commands: bool,
    /// Whether the user chose to always allow this exact command in this folder
    /// (decision 0030). Asked per call, so it applies within the same task.
    pub command_allowed: &'a (dyn Fn(&str) -> bool + Send + Sync),
    pub mcp: Option<McpAccess<'a>>,
}

/// Whether a command the model asked for waits for the user's answer.
/// `args.messages` is moved before the loop, so it takes the fields it reads.
fn command_asks(
    run_commands: bool,
    review_at_end: bool,
    allowed: &(dyn Fn(&str) -> bool + Send + Sync),
    command: &str,
) -> bool {
    // With Review at end the agent may already have changed what a remembered
    // command runs (a package.json script) without the user seeing a diff.
    let remembered = !review_at_end && allowed(command);
    !(run_commands || remembered)
}

/// The user's answer to a step; with no receiver (review at the end, a server or
/// commands set to run without asking) it goes ahead unless the user pressed Stop.
async fn edit_answer(
    approvals: &Approvals,
    id: u32,
    rx: Option<tokio::sync::oneshot::Receiver<bool>>,
    cancel: &CancellationToken,
) -> Answer {
    match rx {
        Some(rx) => approvals.wait(id, rx, cancel).await,
        None if cancel.is_cancelled() => Answer::Stopped,
        None => Answer::Yes,
    }
}

pub async fn run(args: AgentRun<'_>) -> Result<Usage, ProviderError> {
    run_with_images(args, Vec::new()).await
}

/// `run`, with `images[i]` attached to `args.messages[i]` (decision 0019).
pub async fn run_with_images(
    args: AgentRun<'_>,
    images: Vec<Vec<ImageInput>>,
) -> Result<Usage, ProviderError> {
    let mut specs_list = specs();
    let builtin_count = specs_list.len();
    if let Some(mcp) = &args.mcp {
        let mut enabled_ids = Vec::new();
        for server in mcp.servers.iter().filter(|s| s.enabled) {
            let id = args.approvals.next_id();
            args.out
                .send(ChatEvent::ToolCall {
                    id,
                    action: ToolAction::McpStart {
                        server: server.name.clone(),
                    },
                    needs_answer: false,
                })
                .map_err(|_| ProviderError::Cancelled)?;

            match mcp.hub.start(server, &args.cancel).await {
                Ok(n) => {
                    args.out
                        .send(ChatEvent::ToolResult {
                            id,
                            outcome: ToolOutcome::Ok {
                                summary: format!("{n} tools"),
                            },
                        })
                        .map_err(|_| ProviderError::Cancelled)?;
                    enabled_ids.push(server.id);
                }
                Err(McpError::Stopped) => {
                    let _ = args.out.send(ChatEvent::ToolResult {
                        id,
                        outcome: ToolOutcome::Stopped,
                    });
                    return Err(ProviderError::Cancelled);
                }
                Err(e) => {
                    let message =
                        head(&e.to_string(), crate::tools::OUTPUT_LIMIT.min(args.text_limit));
                    args.out
                        .send(ChatEvent::ToolResult {
                            id,
                            outcome: ToolOutcome::Error { message },
                        })
                        .map_err(|_| ProviderError::Cancelled)?;
                }
            }
        }
        if !enabled_ids.is_empty() {
            specs_list.extend(mcp.hub.specs(&enabled_ids).await);
        }
    }
    // Lives until the run ends, so the idle stop can't take a server away mid-run.
    let _hold = args.mcp.as_ref().map(|mcp| {
        let ids: Vec<u32> = mcp.servers.iter().filter(|s| s.enabled).map(|s| s.id).collect();
        mcp.hub.hold(&ids)
    });

    let mut full_messages = vec![ChatMessage {
        role: Role::System,
        content: agent_system_for(specs_list.len() > builtin_count, args.review_at_end),
    }];
    full_messages.extend(args.messages);
    // The system message has no images, so the rest move down one.
    let mut full_images = vec![Vec::new()];
    full_images.extend(images);

    let mut total_usage = Usage::default();
    let mut rounds: Vec<ToolRound> = Vec::new();

    for step in 1..=MAX_STEPS {
        let req = ChatRequest {
            model: args.model.clone(),
            messages: full_messages.clone(),
            images: full_images.clone(),
            tools: specs_list.clone(),
            rounds: rounds.clone(),
            local: args.local.clone(),
        };

        let reply = args
            .provider
            .stream_chat(req, args.out.clone(), args.cancel.clone())
            .await?;

        if let Some(t_in) = reply.usage.tokens_in {
            total_usage.tokens_in = Some(total_usage.tokens_in.unwrap_or(0) + t_in);
        }
        if let Some(t_out) = reply.usage.tokens_out {
            total_usage.tokens_out = Some(total_usage.tokens_out.unwrap_or(0) + t_out);
        }

        if reply.tool_calls.is_empty() {
            return Ok(total_usage);
        }
        // The last step's results would never reach the model: don't run or ask for them.
        if step == MAX_STEPS {
            break;
        }

        let mut results: Vec<ToolOutput> = Vec::new();
        for call in reply.tool_calls {
            let id = args.approvals.next_id();
            if let Some(mcp) = &args.mcp
                && let Some((server, tool)) = split_name(&call.name)
                // Only a tool a started server offered this run; anything else is an unknown tool.
                && specs_list[builtin_count..].iter().any(|s| s.name == call.name)
            {
                if !call.input.is_object() {
                    let err = format!(
                        "Invalid arguments for {}: they were not valid JSON.",
                        call.name
                    );
                    args.out
                        .send(ChatEvent::ToolCall {
                            id,
                            action: ToolAction::Invalid {
                                name: call.name.clone(),
                            },
                            needs_answer: false,
                        })
                        .map_err(|_| ProviderError::Cancelled)?;
                    args.out
                        .send(ChatEvent::ToolResult {
                            id,
                            outcome: ToolOutcome::Error {
                                message: err.clone(),
                            },
                        })
                        .map_err(|_| ProviderError::Cancelled)?;
                    results.push(ToolOutput {
                        call_id: call.id,
                        content: err,
                        is_error: true,
                    });
                    continue;
                }

                // The user set this server to run without asking (decision 0029).
                let ask = !mcp
                    .servers
                    .iter()
                    .any(|s| s.name == server && s.auto_approve);
                let rx = ask.then(|| args.approvals.register(id));
                args.out
                    .send(ChatEvent::ToolCall {
                        id,
                        action: ToolAction::McpTool {
                            server: server.to_string(),
                            name: tool.to_string(),
                            arguments: show_arguments(&call.input),
                        },
                        needs_answer: rx.is_some(),
                    })
                    .map_err(|_| ProviderError::Cancelled)?;

                match edit_answer(args.approvals, id, rx, &args.cancel).await {
                    Answer::Yes => {
                        match mcp
                            .hub
                            .call(&call.name, call.input.clone(), CALL_TIMEOUT, &args.cancel)
                            .await
                        {
                            Ok(res) => {
                                let text = head(
                                    &res.text,
                                    crate::tools::OUTPUT_LIMIT.min(args.text_limit),
                                );
                                let outcome = if res.is_error {
                                    ToolOutcome::Error {
                                        message: text.clone(),
                                    }
                                } else {
                                    ToolOutcome::Text {
                                        output: text.clone(),
                                    }
                                };
                                args.out
                                    .send(ChatEvent::ToolResult { id, outcome })
                                    .map_err(|_| ProviderError::Cancelled)?;
                                results.push(ToolOutput {
                                    call_id: call.id,
                                    content: text,
                                    is_error: res.is_error,
                                });
                            }
                            Err(McpError::Stopped) => {
                                let _ = args.out.send(ChatEvent::ToolResult {
                                    id,
                                    outcome: ToolOutcome::Stopped,
                                });
                                return Err(ProviderError::Cancelled);
                            }
                            Err(e) => {
                                let msg = head(
                                    &e.to_string(),
                                    crate::tools::OUTPUT_LIMIT.min(args.text_limit),
                                );
                                args.out
                                    .send(ChatEvent::ToolResult {
                                        id,
                                        outcome: ToolOutcome::Error {
                                            message: msg.clone(),
                                        },
                                    })
                                    .map_err(|_| ProviderError::Cancelled)?;
                                results.push(ToolOutput {
                                    call_id: call.id,
                                    content: msg,
                                    is_error: true,
                                });
                            }
                        }
                    }
                    Answer::No => {
                        let tool_run = run::declined(true);
                        args.out
                            .send(ChatEvent::ToolResult {
                                id,
                                outcome: tool_run.outcome,
                            })
                            .map_err(|_| ProviderError::Cancelled)?;
                        results.push(ToolOutput {
                            call_id: call.id,
                            content: tool_run.for_model,
                            is_error: tool_run.is_error,
                        });
                    }
                    Answer::Stopped => {
                        let _ = args.out.send(ChatEvent::ToolResult {
                            id,
                            outcome: ToolOutcome::Stopped,
                        });
                        return Err(ProviderError::Cancelled);
                    }
                }
                continue;
            }

            let parsed = run::parse(&call.name, &call.input);

            let tool_input = match parsed {
                Ok(input) => input,
                Err(err) => {
                    args.out
                        .send(ChatEvent::ToolCall {
                            id,
                            action: ToolAction::Invalid {
                                name: call.name.clone(),
                            },
                            needs_answer: false,
                        })
                        .map_err(|_| ProviderError::Cancelled)?;
                    args.out
                        .send(ChatEvent::ToolResult {
                            id,
                            outcome: ToolOutcome::Error {
                                message: err.clone(),
                            },
                        })
                        .map_err(|_| ProviderError::Cancelled)?;
                    results.push(ToolOutput {
                        call_id: call.id,
                        content: err,
                        is_error: true,
                    });
                    continue;
                }
            };

            match tool_input {
                run::ToolInput::ListFiles { path } => {
                    args.out
                        .send(ChatEvent::ToolCall {
                            id,
                            action: ToolAction::ListFiles {
                                path: path.clone(),
                            },
                            needs_answer: false,
                        })
                        .map_err(|_| ProviderError::Cancelled)?;

                    let root = args.root.clone();
                    let p = path.clone();
                    let tool_run = tokio::task::spawn_blocking(move || run::list_files(&root, &p))
                        .await
                        .map_err(|_| ProviderError::Cancelled)?;

                    args.out
                        .send(ChatEvent::ToolResult {
                            id,
                            outcome: tool_run.outcome,
                        })
                        .map_err(|_| ProviderError::Cancelled)?;

                    results.push(ToolOutput {
                        call_id: call.id,
                        content: tool_run.for_model,
                        is_error: tool_run.is_error,
                    });
                }
                run::ToolInput::ReadFile {
                    path,
                    start_line,
                    end_line,
                } => {
                    args.out
                        .send(ChatEvent::ToolCall {
                            id,
                            action: ToolAction::ReadFile {
                                path: path.clone(),
                            },
                            needs_answer: false,
                        })
                        .map_err(|_| ProviderError::Cancelled)?;

                    let root = args.root.clone();
                    let p = path.clone();
                    let limit = args.text_limit;
                    let tool_run = tokio::task::spawn_blocking(move || {
                        run::read_file(&root, &p, start_line, end_line, limit)
                    })
                    .await
                    .map_err(|_| ProviderError::Cancelled)?;

                    args.out
                        .send(ChatEvent::ToolResult {
                            id,
                            outcome: tool_run.outcome,
                        })
                        .map_err(|_| ProviderError::Cancelled)?;

                    results.push(ToolOutput {
                        call_id: call.id,
                        content: tool_run.for_model,
                        is_error: tool_run.is_error,
                    });
                }
                run::ToolInput::Search { query, path } => {
                    args.out
                        .send(ChatEvent::ToolCall {
                            id,
                            action: ToolAction::Search {
                                query: query.clone(),
                                path: path.clone(),
                            },
                            needs_answer: false,
                        })
                        .map_err(|_| ProviderError::Cancelled)?;

                    let root = args.root.clone();
                    let q = query.clone();
                    let p = path.clone();
                    let tool_run =
                        tokio::task::spawn_blocking(move || run::search(&root, &q, &p))
                            .await
                            .map_err(|_| ProviderError::Cancelled)?;

                    args.out
                        .send(ChatEvent::ToolResult {
                            id,
                            outcome: tool_run.outcome,
                        })
                        .map_err(|_| ProviderError::Cancelled)?;

                    results.push(ToolOutput {
                        call_id: call.id,
                        content: tool_run.for_model,
                        is_error: tool_run.is_error,
                    });
                }
                run::ToolInput::EditFile {
                    path,
                    old_text,
                    new_text,
                } => {
                    let root = args.root.clone();
                    let p = path.clone();
                    let ot = old_text.clone();
                    let nt = new_text.clone();
                    let prep = tokio::task::spawn_blocking(move || {
                        run::prepare_edit(&root, &p, &ot, &nt)
                    })
                    .await
                    .map_err(|_| ProviderError::Cancelled)?;

                    match prep {
                        Err(err_run) => {
                            args.out
                                .send(ChatEvent::ToolCall {
                                    id,
                                    action: ToolAction::EditFile {
                                        path: path.clone(),
                                        before: String::new(),
                                        after: String::new(),
                                    },
                                    needs_answer: false,
                                })
                                .map_err(|_| ProviderError::Cancelled)?;

                            args.out
                                .send(ChatEvent::ToolResult {
                                    id,
                                    outcome: err_run.outcome,
                                })
                                .map_err(|_| ProviderError::Cancelled)?;

                            results.push(ToolOutput {
                                call_id: call.id,
                                content: err_run.for_model,
                                is_error: err_run.is_error,
                            });
                        }
                        Ok(edit) => {
                            let rx = (!args.review_at_end).then(|| args.approvals.register(id));
                            args.out
                                .send(ChatEvent::ToolCall {
                                    id,
                                    action: ToolAction::EditFile {
                                        path: edit.path.clone(),
                                        before: edit.before.clone(),
                                        after: edit.after.clone(),
                                    },
                                    needs_answer: rx.is_some(),
                                })
                                .map_err(|_| ProviderError::Cancelled)?;

                            let ans = edit_answer(args.approvals, id, rx, &args.cancel).await;
                            match ans {
                                Answer::Yes => {
                                    let root = args.root.clone();
                                    let e = edit.clone();
                                    let tool_run = tokio::task::spawn_blocking(move || {
                                        run::apply_edit(&root, &e)
                                    })
                                    .await
                                    .map_err(|_| ProviderError::Cancelled)?;

                                    args.out
                                        .send(ChatEvent::ToolResult {
                                            id,
                                            outcome: tool_run.outcome,
                                        })
                                        .map_err(|_| ProviderError::Cancelled)?;

                                    results.push(ToolOutput {
                                        call_id: call.id,
                                        content: tool_run.for_model,
                                        is_error: tool_run.is_error,
                                    });
                                }
                                Answer::No => {
                                    let tool_run = run::declined(false);
                                    args.out
                                        .send(ChatEvent::ToolResult {
                                            id,
                                            outcome: tool_run.outcome,
                                        })
                                        .map_err(|_| ProviderError::Cancelled)?;

                                    results.push(ToolOutput {
                                        call_id: call.id,
                                        content: tool_run.for_model,
                                        is_error: tool_run.is_error,
                                    });
                                }
                                Answer::Stopped => {
                                    let _ = args.out.send(ChatEvent::ToolResult {
                                        id,
                                        outcome: ToolOutcome::Stopped,
                                    });
                                    return Err(ProviderError::Cancelled);
                                }
                            }
                        }
                    }
                }
                run::ToolInput::CreateFile { path, text } => {
                    let root = args.root.clone();
                    let p = path.clone();
                    let t = text.clone();
                    let prep = tokio::task::spawn_blocking(move || {
                        run::prepare_create(&root, &p, &t)
                    })
                    .await
                    .map_err(|_| ProviderError::Cancelled)?;

                    match prep {
                        Err(err_run) => {
                            args.out
                                .send(ChatEvent::ToolCall {
                                    id,
                                    action: ToolAction::CreateFile {
                                        path: path.clone(),
                                        text: text.clone(),
                                    },
                                    needs_answer: false,
                                })
                                .map_err(|_| ProviderError::Cancelled)?;

                            args.out
                                .send(ChatEvent::ToolResult {
                                    id,
                                    outcome: err_run.outcome,
                                })
                                .map_err(|_| ProviderError::Cancelled)?;

                            results.push(ToolOutput {
                                call_id: call.id,
                                content: err_run.for_model,
                                is_error: err_run.is_error,
                            });
                        }
                        Ok(new_file) => {
                            let rx = (!args.review_at_end).then(|| args.approvals.register(id));
                            args.out
                                .send(ChatEvent::ToolCall {
                                    id,
                                    action: ToolAction::CreateFile {
                                        path: new_file.path.clone(),
                                        text: new_file.text.clone(),
                                    },
                                    needs_answer: rx.is_some(),
                                })
                                .map_err(|_| ProviderError::Cancelled)?;

                            let ans = edit_answer(args.approvals, id, rx, &args.cancel).await;
                            match ans {
                                Answer::Yes => {
                                    let root = args.root.clone();
                                    let nf = new_file.clone();
                                    let tool_run = tokio::task::spawn_blocking(move || {
                                        run::apply_create(&root, &nf)
                                    })
                                    .await
                                    .map_err(|_| ProviderError::Cancelled)?;

                                    args.out
                                        .send(ChatEvent::ToolResult {
                                            id,
                                            outcome: tool_run.outcome,
                                        })
                                        .map_err(|_| ProviderError::Cancelled)?;

                                    results.push(ToolOutput {
                                        call_id: call.id,
                                        content: tool_run.for_model,
                                        is_error: tool_run.is_error,
                                    });
                                }
                                Answer::No => {
                                    let tool_run = run::declined(false);
                                    args.out
                                        .send(ChatEvent::ToolResult {
                                            id,
                                            outcome: tool_run.outcome,
                                        })
                                        .map_err(|_| ProviderError::Cancelled)?;

                                    results.push(ToolOutput {
                                        call_id: call.id,
                                        content: tool_run.for_model,
                                        is_error: tool_run.is_error,
                                    });
                                }
                                Answer::Stopped => {
                                    let _ = args.out.send(ChatEvent::ToolResult {
                                        id,
                                        outcome: ToolOutcome::Stopped,
                                    });
                                    return Err(ProviderError::Cancelled);
                                }
                            }
                        }
                    }
                }
                run::ToolInput::RunCommand { command } => {
                    let rx = command_asks(args.run_commands, args.review_at_end, args.command_allowed, &command).then(|| args.approvals.register(id));
                    let folder = display_path(&args.root);
                    args.out
                        .send(ChatEvent::ToolCall {
                            id,
                            action: ToolAction::RunCommand {
                                command: command.clone(),
                                folder,
                            },
                            needs_answer: rx.is_some(),
                        })
                        .map_err(|_| ProviderError::Cancelled)?;

                    let ans = edit_answer(args.approvals, id, rx, &args.cancel).await;
                    match ans {
                        Answer::Yes => {
                            let cmd_res = command::run_command(
                                &args.root,
                                &command,
                                args.command_timeout,
                                &args.cancel,
                                crate::tools::OUTPUT_LIMIT.min(args.text_limit),
                            )
                            .await;

                            match cmd_res {
                                Ok(command::CommandEnd::Finished(res)) => {
                                    let for_model = if res.timed_out {
                                        format!(
                                            "Timed out after 120 seconds and was stopped.\n{}",
                                            res.output
                                        )
                                    } else {
                                        let code_str = res
                                            .exit_code
                                            .map(|c| c.to_string())
                                            .unwrap_or_else(|| "none".to_string());
                                        format!("Exit code {}\n{}", code_str, res.output)
                                    };

                                    let outcome = ToolOutcome::Command {
                                        exit_code: res.exit_code,
                                        output: res.output,
                                        timed_out: res.timed_out,
                                    };

                                    args.out
                                        .send(ChatEvent::ToolResult { id, outcome })
                                        .map_err(|_| ProviderError::Cancelled)?;

                                    results.push(ToolOutput {
                                        call_id: call.id,
                                        content: for_model,
                                        is_error: false,
                                    });
                                }
                                Ok(command::CommandEnd::Stopped) => {
                                    let _ = args.out.send(ChatEvent::ToolResult {
                                        id,
                                        outcome: ToolOutcome::Stopped,
                                    });
                                    return Err(ProviderError::Cancelled);
                                }
                                Err(err) => {
                                    let err_run = run::refused(&err, "");
                                    args.out
                                        .send(ChatEvent::ToolResult {
                                            id,
                                            outcome: err_run.outcome,
                                        })
                                        .map_err(|_| ProviderError::Cancelled)?;

                                    results.push(ToolOutput {
                                        call_id: call.id,
                                        content: err_run.for_model,
                                        is_error: true,
                                    });
                                }
                            }
                        }
                        Answer::No => {
                            let tool_run = run::declined(true);
                            args.out
                                .send(ChatEvent::ToolResult {
                                    id,
                                    outcome: tool_run.outcome,
                                })
                                .map_err(|_| ProviderError::Cancelled)?;

                            results.push(ToolOutput {
                                call_id: call.id,
                                content: tool_run.for_model,
                                is_error: tool_run.is_error,
                            });
                        }
                        Answer::Stopped => {
                            let _ = args.out.send(ChatEvent::ToolResult {
                                id,
                                outcome: ToolOutcome::Stopped,
                            });
                            return Err(ProviderError::Cancelled);
                        }
                    }
                }
            }
        }

        rounds.push(ToolRound {
            assistant: reply.assistant,
            results,
        });
    }

    Err(ProviderError::Provider {
        message: "The model used 25 tool steps without finishing. Send a message to let it continue.".to_string(),
    })
}
