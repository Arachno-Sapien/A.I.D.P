use super::approvals::{Answer, Approvals};
use super::command;
use super::run;
use super::{agent_system, specs, ToolAction, ToolOutcome, MAX_STEPS};
use crate::gateway::{
    ChatEvent, ChatMessage, ChatRequest, ModelProvider, ProviderError, Role, ToolOutput, ToolRound,
    Usage,
};
use crate::workspace::display_path;
use std::path::PathBuf;
use std::time::Duration;
use tauri::ipc::Channel;
use tokio_util::sync::CancellationToken;

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
}

pub async fn run(args: AgentRun<'_>) -> Result<Usage, ProviderError> {
    let mut full_messages = vec![ChatMessage {
        role: Role::System,
        content: agent_system(),
    }];
    full_messages.extend(args.messages);

    let mut total_usage = Usage::default();
    let mut rounds: Vec<ToolRound> = Vec::new();
    let specs_list = specs();

    for step in 1..=MAX_STEPS {
        let req = ChatRequest {
            model: args.model.clone(),
            messages: full_messages.clone(),
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
                            let rx = args.approvals.register(id);
                            args.out
                                .send(ChatEvent::ToolCall {
                                    id,
                                    action: ToolAction::EditFile {
                                        path: edit.path.clone(),
                                        before: edit.before.clone(),
                                        after: edit.after.clone(),
                                    },
                                    needs_answer: true,
                                })
                                .map_err(|_| ProviderError::Cancelled)?;

                            let ans = args.approvals.wait(id, rx, &args.cancel).await;
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
                            let rx = args.approvals.register(id);
                            args.out
                                .send(ChatEvent::ToolCall {
                                    id,
                                    action: ToolAction::CreateFile {
                                        path: new_file.path.clone(),
                                        text: new_file.text.clone(),
                                    },
                                    needs_answer: true,
                                })
                                .map_err(|_| ProviderError::Cancelled)?;

                            let ans = args.approvals.wait(id, rx, &args.cancel).await;
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
                    let rx = args.approvals.register(id);
                    let folder = display_path(&args.root);
                    args.out
                        .send(ChatEvent::ToolCall {
                            id,
                            action: ToolAction::RunCommand {
                                command: command.clone(),
                                folder,
                            },
                            needs_answer: true,
                        })
                        .map_err(|_| ProviderError::Cancelled)?;

                    let ans = args.approvals.wait(id, rx, &args.cancel).await;
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
