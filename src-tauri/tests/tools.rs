mod common;

use aidp_lib::tools::command::{run_command, tail, CommandEnd};
use aidp_lib::tools::run::{
    apply_create, apply_edit, list_files, parse, prepare_create, prepare_edit, read_file, search,
    ToolInput,
};
use aidp_lib::tools::specs;
use aidp_lib::tools::{OUTPUT_LIMIT, READ_LIMIT};
use common::{link_dir, link_file, TempDir};
use serde_json::json;
use std::fs;
use std::time::{Duration, Instant};
use tokio_util::sync::CancellationToken;

#[test]
fn parse_table() {
    // 1. Minimal args parse for each of 6 tools
    let lf = parse("list_files", &json!({})).unwrap();
    assert_eq!(lf, ToolInput::ListFiles { path: "".into() });

    let lf_path = parse("list_files", &json!({"path": "src"})).unwrap();
    assert_eq!(lf_path, ToolInput::ListFiles { path: "src".into() });

    let rf = parse("read_file", &json!({"path": "a.txt"})).unwrap();
    assert_eq!(
        rf,
        ToolInput::ReadFile {
            path: "a.txt".into(),
            start_line: None,
            end_line: None,
        }
    );

    let rf_range = parse(
        "read_file",
        &json!({"path": "a.txt", "start_line": 2, "end_line": 5}),
    )
    .unwrap();
    assert_eq!(
        rf_range,
        ToolInput::ReadFile {
            path: "a.txt".into(),
            start_line: Some(2),
            end_line: Some(5),
        }
    );

    let s = parse("search", &json!({"query": "foo"})).unwrap();
    assert_eq!(
        s,
        ToolInput::Search {
            query: "foo".into(),
            path: "".into(),
        }
    );

    let ef = parse(
        "edit_file",
        &json!({"path": "a.txt", "old_text": "x", "new_text": "y"}),
    )
    .unwrap();
    assert_eq!(
        ef,
        ToolInput::EditFile {
            path: "a.txt".into(),
            old_text: "x".into(),
            new_text: "y".into(),
        }
    );

    let cf = parse("create_file", &json!({"path": "b.txt", "text": "hello"})).unwrap();
    assert_eq!(
        cf,
        ToolInput::CreateFile {
            path: "b.txt".into(),
            text: "hello".into(),
        }
    );

    let rc = parse("run_command", &json!({"command": "echo 1"})).unwrap();
    assert_eq!(
        rc,
        ToolInput::RunCommand {
            command: "echo 1".into(),
        }
    );

    // 2. read_file without path -> Invalid arguments for read_file: ...
    let err_missing = parse("read_file", &json!({})).unwrap_err();
    assert!(
        err_missing.starts_with("Invalid arguments for read_file: "),
        "Expected 'Invalid arguments for read_file: ...', got '{err_missing}'"
    );

    // 3. Non-object json -> were not valid JSON
    let err_bad_json = parse("read_file", &json!("{bad")).unwrap_err();
    assert!(
        err_bad_json.contains("were not valid JSON"),
        "Expected '...were not valid JSON.', got '{err_bad_json}'"
    );

    // 4. Unknown tool -> There is no tool named rm.
    let err_unknown = parse("rm", &json!({})).unwrap_err();
    assert_eq!(err_unknown, "There is no tool named rm.");
}

#[test]
fn command_with_hidden_characters_is_refused() {
    // A right-to-left override makes the approval card show text in a different
    // order from what the shell runs; zero-width and control characters hide text.
    for (command, code) in [
        ("echo safe \u{202E}txt.exe", "U+202E"),
        ("echo a\u{200B}b", "U+200B"),
        ("echo \u{2066}x\u{2069}", "U+2066"),
        ("echo a\u{1b}[2Kb", "U+001B"),
        // Other invisible characters: a Hangul filler, a variation selector, a
        // tag character, the combining grapheme joiner, private use.
        ("echo a\u{3164}b", "U+3164"),
        ("echo a\u{FE0F}b", "U+FE0F"),
        ("echo a\u{E0041}b", "U+E0041"),
        ("echo a\u{034F}b", "U+034F"),
        ("echo a\u{E000}b", "U+E000"),
        // A carriage return that is not part of a line break.
        ("echo safe\rdel x", "U+000D"),
    ] {
        let err = parse("run_command", &json!({ "command": command })).unwrap_err();
        assert!(
            err.starts_with("Invalid arguments for run_command: the command contains a hidden or control character")
                && err.contains(code),
            "{command:?}: {err}"
        );
    }
    // Tabs and line breaks are visible in the card and stay allowed, and so is
    // ordinary non-ASCII text.
    assert!(parse("run_command", &json!({ "command": "echo a\tb\r\necho c" })).is_ok());
    assert!(parse("run_command", &json!({ "command": "echo héllo 日本 > ñ.txt" })).is_ok());
}

#[test]
fn specs_are_valid_schemas() {
    let list = specs();
    let names: Vec<&str> = list.iter().map(|s| s.name).collect();
    assert_eq!(
        names,
        vec![
            "list_files",
            "read_file",
            "search",
            "edit_file",
            "create_file",
            "run_command",
        ]
    );

    for spec in list {
        let schema = &spec.schema;
        assert_eq!(
            schema.get("type").and_then(|v| v.as_str()),
            Some("object"),
            "tool {} schema type must be object",
            spec.name
        );
        assert_eq!(
            schema.get("additionalProperties").and_then(|v| v.as_bool()),
            Some(false),
            "tool {} schema additionalProperties must be false",
            spec.name
        );
        let props = schema.get("properties").and_then(|v| v.as_object()).unwrap();
        let required = schema.get("required").and_then(|v| v.as_array()).unwrap();
        for req in required {
            let req_str = req.as_str().unwrap();
            assert!(
                props.contains_key(req_str),
                "tool {} required field {} not in properties",
                spec.name,
                req_str
            );
        }
    }
}

#[test]
fn tool_paths_outside_are_refused() {
    let dir = TempDir::new();
    let root = dir.path();

    let outside_paths = vec!["../x", "/etc/passwd"];
    for p in outside_paths {
        let run = read_file(root, p, None, None, READ_LIMIT);
        assert!(run.is_error);
        assert_eq!(
            run.for_model,
            "Refused: paths must be relative to the project folder (like src/main.rs) and stay inside it."
        );
    }

    if cfg!(windows) {
        let run = read_file(root, "C:\\Windows\\win.ini", None, None, READ_LIMIT);
        assert!(run.is_error);
        assert_eq!(
            run.for_model,
            "Refused: paths must be relative to the project folder (like src/main.rs) and stay inside it."
        );
    }

    // Link pointing outside
    let target = TempDir::new();
    fs::write(target.path().join("foo.txt"), "outside content").unwrap();
    let link_path = root.join("link_out");
    link_dir(&link_path, target.path());

    let run = read_file(root, "link_out/foo.txt", None, None, READ_LIMIT);
    assert!(run.is_error);
    assert_eq!(
        run.for_model,
        "Refused: paths must be relative to the project folder (like src/main.rs) and stay inside it."
    );
}

#[test]
fn read_file_refuses_secrets() {
    let dir = TempDir::new();
    let root = dir.path();

    // 1. .env
    fs::write(root.join(".env"), "SECRET_KEY=123456789\n").unwrap();
    let run = read_file(root, ".env", None, None, READ_LIMIT);
    assert!(run.is_error);
    assert_eq!(
        run.for_model,
        "Refused: .env looks like a secret file (keys, .env). It is never shared with you; ask the user to paste what you need."
    );
    assert!(!run.for_model.contains("123456789"));

    // 2. Symlink notes.txt -> .env
    let notes = root.join("notes.txt");
    if link_file(&notes, &root.join(".env")) {
        let run_link = read_file(root, "notes.txt", None, None, READ_LIMIT);
        assert!(run_link.is_error);
        assert_eq!(
            run_link.for_model,
            "Refused: notes.txt looks like a secret file (keys, .env). It is never shared with you; ask the user to paste what you need."
        );
    }

    // 3. D1: Private key block in config.txt
    fs::write(
        root.join("config.txt"),
        "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n",
    )
    .unwrap();
    let run_key = read_file(root, "config.txt", None, None, READ_LIMIT);
    assert!(run_key.is_error);
    assert_eq!(
        run_key.for_model,
        "Refused: config.txt looks like a secret file (keys, .env). It is never shared with you; ask the user to paste what you need."
    );
    assert!(!run_key.for_model.contains("MIIE"));
}

#[test]
fn git_folder_is_off_limits() {
    // .git/config can hold a token in a remote URL, and hooks run code.
    let dir = TempDir::new();
    let root = dir.path();
    fs::create_dir_all(root.join(".git/hooks")).unwrap();
    fs::write(
        root.join(".git/config"),
        "[remote \"origin\"]\n\turl = https://x-access-token:placeholder-789@example.com/r.git\n",
    )
    .unwrap();
    let refusal = "Refused: tools cannot use the .git folder. To see history or status, ask to run a git command.";

    assert_eq!(read_file(root, ".git/config", None, None, READ_LIMIT).for_model, refusal);
    assert_eq!(list_files(root, ".git").for_model, refusal);
    assert_eq!(search(root, "placeholder", ".git").for_model, refusal);
    assert_eq!(
        prepare_edit(root, ".git/config", "url", "x").unwrap_err().for_model,
        refusal
    );
    assert_eq!(
        prepare_create(root, ".git/hooks/pre-commit", "echo hi")
            .unwrap_err()
            .for_model,
        refusal
    );
    assert!(!search(root, "placeholder", "").for_model.contains("placeholder-789"));
}

#[test]
fn read_file_ranges_and_cut() {
    let dir = TempDir::new();
    let root = dir.path();

    // 10-line file
    let content = (1..=10)
        .map(|i| format!("line {i}"))
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(root.join("ten.txt"), content).unwrap();

    let run = read_file(root, "ten.txt", Some(3), Some(5), READ_LIMIT);
    assert!(!run.is_error);
    assert_eq!(
        run.for_model,
        "ten.txt, lines 3-5 of 10:\nline 3\nline 4\nline 5"
    );

    // 150,000-char file
    let line_str = "a".repeat(99) + "\n"; // 100 chars per line
    let big_content = line_str.repeat(1500); // 150,000 chars, 1500 lines
    fs::write(root.join("big.txt"), big_content).unwrap();

    let run_big = read_file(root, "big.txt", None, None, READ_LIMIT);
    assert!(!run_big.is_error);
    // 99 characters plus a line break each: 1,000 lines fit in 100,000.
    assert!(run_big
        .for_model
        .ends_with("\n[cut at line 1000; read on with start_line=1001]"));
}

#[test]
fn read_file_cuts_one_huge_line() {
    let dir = TempDir::new();
    let root = dir.path();
    // A minified file: one line far over the limit, multi-byte characters at the cut.
    fs::write(root.join("min.js"), "é".repeat(150_000) + "\nnext").unwrap();

    let run = read_file(root, "min.js", None, None, READ_LIMIT);
    assert!(!run.is_error);
    assert!(run.for_model.len() < 100_200, "sent {} bytes", run.for_model.len());
    assert!(run
        .for_model
        .ends_with("\n[line 1 is too long and was cut; read on with start_line=2]"));
}

#[test]
fn read_file_respects_a_smaller_limit() {
    let dir = TempDir::new();
    let root = dir.path();
    let line_str = "a".repeat(99) + "\n";
    let big_content = line_str.repeat(1500);
    fs::write(root.join("test.txt"), big_content).unwrap();

    let run = read_file(root, "test.txt", None, None, 1000);
    assert!(!run.is_error);
    assert!(run.for_model.contains("[cut at line"));
    assert!(run.for_model.len() < 1200);
}

#[test]
fn list_and_search_format() {
    let dir = TempDir::new();
    let root = dir.path();

    fs::create_dir_all(root.join("src")).unwrap();
    fs::write(root.join("src/a.ts"), "line 1\nline 2\nconst TARGET = 42;\n").unwrap();
    fs::write(root.join("README.md"), "# Hello\n").unwrap();

    // list_files
    let list_run = list_files(root, "");
    assert!(!list_run.is_error);
    assert!(list_run.for_model.contains("README.md"));
    assert!(list_run.for_model.contains("src/"));

    // search empty query -> error
    let search_empty = search(root, "", "");
    assert!(search_empty.is_error);
    assert_eq!(search_empty.for_model, "The search query is empty.");

    // search match
    let search_run = search(root, "target", "");
    assert!(!search_run.is_error);
    assert!(search_run.for_model.contains("src/a.ts:3: const TARGET = 42;"));
}

#[test]
fn edit_file_table() {
    let dir = TempDir::new();
    let root = dir.path();

    fs::write(root.join("doc.txt"), "hello world\nrepeat\nrepeat\n").unwrap();

    // 0 matches
    let res_0 = prepare_edit(root, "doc.txt", "missing", "replacement");
    assert!(res_0.is_err());
    let err_0 = res_0.unwrap_err();
    assert_eq!(
        err_0.for_model,
        "old_text was not found in doc.txt. Read the file again and copy the text exactly."
    );

    // 2 matches
    let res_2 = prepare_edit(root, "doc.txt", "repeat", "replacement");
    assert!(res_2.is_err());
    let err_2 = res_2.unwrap_err();
    assert_eq!(
        err_2.for_model,
        "old_text appears 2 times in doc.txt. Include more surrounding lines so it appears once."
    );

    // 1 match
    let edit = prepare_edit(root, "doc.txt", "hello world", "hi universe").unwrap();
    assert_eq!(edit.path, "doc.txt");
    assert_eq!(edit.before, "hello world\nrepeat\nrepeat\n");
    assert_eq!(edit.after, "hi universe\nrepeat\nrepeat\n");

    // edit on .env with guessed old_text -> secret error
    fs::write(root.join(".env"), "DB_PASS=guessme\n").unwrap();
    let res_secret = prepare_edit(root, ".env", "DB_PASS=guessme", "DB_PASS=hacked");
    assert!(res_secret.is_err());
    let err_secret = res_secret.unwrap_err();
    assert_eq!(
        err_secret.for_model,
        "Refused: .env looks like a secret file (keys, .env). It is never shared with you; ask the user to paste what you need."
    );
}

#[test]
fn edit_keeps_crlf_and_bom() {
    let dir = TempDir::new();
    let root = dir.path();

    // CRLF with BOM
    let bom = b"\xEF\xBB\xBF";
    let body = b"first line\r\nsecond line\r\n";
    let mut file_bytes = bom.to_vec();
    file_bytes.extend_from_slice(body);
    fs::write(root.join("crlf_bom.txt"), file_bytes).unwrap();

    let edit = prepare_edit(
        root,
        "crlf_bom.txt",
        "first line\r\n",
        "new first line\r\n",
    )
    .unwrap();
    let run = apply_edit(root, &edit);
    assert!(!run.is_error);
    assert_eq!(
        run.for_model,
        "The user accepted the change; crlf_bom.txt was written."
    );

    let written = fs::read(root.join("crlf_bom.txt")).unwrap();
    assert!(written.starts_with(b"\xEF\xBB\xBF"));
    let as_str = String::from_utf8(written[3..].to_vec()).unwrap();
    assert_eq!(as_str, "new first line\r\nsecond line\r\n");
}

#[test]
fn edit_after_change_on_disk() {
    let dir = TempDir::new();
    let root = dir.path();

    fs::write(root.join("race.txt"), "original\n").unwrap();
    let edit = prepare_edit(root, "race.txt", "original", "modified").unwrap();

    // Another writer rewrites the file
    fs::write(root.join("race.txt"), "other writer content\n").unwrap();

    let run = apply_edit(root, &edit);
    assert!(run.is_error);
    assert_eq!(
        run.for_model,
        "race.txt changed on disk after you read it; read it again before editing."
    );

    let current = fs::read_to_string(root.join("race.txt")).unwrap();
    assert_eq!(current, "other writer content\n");
}

#[test]
fn create_file_flow() {
    let dir = TempDir::new();
    let root = dir.path();

    // prepare_create creates nothing
    let new_file = prepare_create(root, "n/new.txt", "line 1\nline 2").unwrap();
    assert_eq!(new_file.path, "n/new.txt");
    assert_eq!(new_file.text, "line 1\nline 2");
    assert!(!root.join("n/new.txt").exists());

    // apply_create creates the file
    let run = apply_create(root, &new_file);
    assert!(!run.is_error);
    assert_eq!(run.for_model, "The user accepted; n/new.txt was created.");
    assert_eq!(
        fs::read_to_string(root.join("n/new.txt")).unwrap(),
        "line 1\nline 2"
    );

    // existing path -> AlreadyExists at prepare
    let err = prepare_create(root, "n/new.txt", "again").unwrap_err();
    assert!(err.is_error);
    assert_eq!(
        err.for_model,
        "n/new.txt already exists. Use edit_file to change it."
    );

    // Secret-looking names may be created: the user sees the content, and nothing is read.
    assert!(prepare_create(root, ".env.example", "API_KEY=\n").is_ok());
    assert!(prepare_create(root, ".npmrc", "registry=https://registry.npmjs.org/\n").is_ok());
}

#[test]
fn declined_outcomes() {
    let edit_declined = aidp_lib::tools::run::declined(false);
    assert!(!edit_declined.is_error);
    assert_eq!(
        edit_declined.outcome,
        aidp_lib::tools::ToolOutcome::Declined
    );
    assert_eq!(
        edit_declined.for_model,
        "The user rejected this change. Ask them what to do instead of retrying it."
    );

    let cmd_declined = aidp_lib::tools::run::declined(true);
    assert!(!cmd_declined.is_error);
    assert_eq!(cmd_declined.outcome, aidp_lib::tools::ToolOutcome::Declined);
    assert_eq!(
        cmd_declined.for_model,
        "The user denied this command. Do not run it again unless they ask."
    );
}

#[tokio::test]
async fn command_output_and_exit_code() {
    let dir = TempDir::new();
    let root = dir.path();
    let cancel = CancellationToken::new();

    let end = run_command(root, "echo hello", Duration::from_secs(5), &cancel, OUTPUT_LIMIT)
        .await
        .unwrap();
    match end {
        CommandEnd::Finished(res) => {
            assert!(res.output.contains("hello"));
            assert_eq!(res.exit_code, Some(0));
            assert!(!res.timed_out);
        }
        CommandEnd::Stopped => panic!("Command should not be stopped"),
    }

    let pwd_cmd = if cfg!(windows) { "cd" } else { "pwd" };
    let end_pwd = run_command(root, pwd_cmd, Duration::from_secs(5), &cancel, OUTPUT_LIMIT)
        .await
        .unwrap();
    match end_pwd {
        CommandEnd::Finished(res) => {
            let canon_root = root.canonicalize().unwrap();
            let root_str = canon_root.to_string_lossy();
            let cleaned_output = res.output.trim().replace("\\\\?\\", "");
            let cleaned_root = root_str.replace("\\\\?\\", "");
            assert!(
                cleaned_output.to_lowercase().contains(&cleaned_root.to_lowercase())
                    || cleaned_root.to_lowercase().contains(&cleaned_output.to_lowercase()),
                "Expected output '{}' to contain root '{}'",
                res.output,
                root_str
            );
        }
        CommandEnd::Stopped => panic!("Command should not be stopped"),
    }
}

#[tokio::test]
async fn command_nonzero_exit() {
    let dir = TempDir::new();
    let root = dir.path();
    let cancel = CancellationToken::new();

    let end = run_command(root, "exit 3", Duration::from_secs(5), &cancel, OUTPUT_LIMIT)
        .await
        .unwrap();
    match end {
        CommandEnd::Finished(res) => {
            assert_eq!(res.exit_code, Some(3));
        }
        CommandEnd::Stopped => panic!("Command should not be stopped"),
    }
}

#[tokio::test]
async fn command_gets_no_input() {
    let dir = TempDir::new();
    let root = dir.path();
    let cancel = CancellationToken::new();

    let cmd = if cfg!(windows) { "set /p X=" } else { "read X" };
    let start = Instant::now();
    let end = run_command(root, cmd, Duration::from_secs(5), &cancel, OUTPUT_LIMIT)
        .await
        .unwrap();
    assert!(start.elapsed() < Duration::from_secs(5));
    match end {
        CommandEnd::Finished(res) => {
            assert!(!res.timed_out);
        }
        CommandEnd::Stopped => panic!("Command should not be stopped"),
    }
}

#[tokio::test]
async fn timeout_kills_the_whole_tree() {
    let dir = TempDir::new();
    let root = dir.path();
    let cancel = CancellationToken::new();

    let cmd = if cfg!(windows) {
        "cmd /C \"ping -n 4 127.0.0.1 > nul & echo late > marker.txt\""
    } else {
        "sh -c 'sleep 3; echo late > marker.txt'"
    };

    let end = run_command(root, cmd, Duration::from_secs(1), &cancel, OUTPUT_LIMIT)
        .await
        .unwrap();
    match end {
        CommandEnd::Finished(res) => {
            assert!(res.timed_out);
        }
        CommandEnd::Stopped => panic!("Expected timed_out, got stopped"),
    }

    tokio::time::sleep(Duration::from_millis(5000)).await;
    assert!(!root.join("marker.txt").exists());
}

#[tokio::test]
async fn stop_kills_the_command() {
    let dir = TempDir::new();
    let root = dir.path();
    let cancel = CancellationToken::new();

    let cmd = if cfg!(windows) {
        "cmd /C \"ping -n 4 127.0.0.1 > nul & echo late > marker.txt\""
    } else {
        "sh -c 'sleep 3; echo late > marker.txt'"
    };

    let cancel_clone = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(500)).await;
        cancel_clone.cancel();
    });

    let start = Instant::now();
    let end = run_command(root, cmd, Duration::from_secs(10), &cancel, OUTPUT_LIMIT)
        .await
        .unwrap();
    assert!(start.elapsed() < Duration::from_secs(3));
    match end {
        CommandEnd::Stopped => {}
        CommandEnd::Finished(_) => panic!("Expected Stopped"),
    }

    tokio::time::sleep(Duration::from_millis(5000)).await;
    assert!(!root.join("marker.txt").exists());
}

/// The shell exits at once, but the process it started keeps the output open.
fn background_command() -> &'static str {
    if cfg!(windows) {
        "start /b ping -n 8 127.0.0.1 > nul"
    } else {
        "sleep 8 &"
    }
}

#[tokio::test]
async fn stop_works_with_a_background_process() {
    let dir = TempDir::new();
    let cancel = CancellationToken::new();
    let cancel_clone = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(500)).await;
        cancel_clone.cancel();
    });

    let start = Instant::now();
    let end = run_command(dir.path(), background_command(), Duration::from_secs(60), &cancel, OUTPUT_LIMIT)
        .await
        .unwrap();
    assert!(start.elapsed() < Duration::from_secs(3), "took {:?}", start.elapsed());
    assert_eq!(end, CommandEnd::Stopped);
}

#[tokio::test]
async fn timeout_works_with_a_background_process() {
    let dir = TempDir::new();
    let cancel = CancellationToken::new();

    let start = Instant::now();
    let end = run_command(dir.path(), background_command(), Duration::from_secs(1), &cancel, OUTPUT_LIMIT)
        .await
        .unwrap();
    assert!(start.elapsed() < Duration::from_secs(5), "took {:?}", start.elapsed());
    match end {
        CommandEnd::Finished(res) => assert!(res.timed_out),
        CommandEnd::Stopped => panic!("Expected timed_out, got stopped"),
    }
}

#[tokio::test]
async fn output_keeps_the_tail() {
    let dir = TempDir::new();
    let root = dir.path();
    let cancel = CancellationToken::new();

    let script = if cfg!(windows) {
        let line = "0123456789".repeat(10);
        format!("cmd /C \"for /L %i in (1,1,400) do @echo {line}\" & echo END")
    } else {
        "sh -c 'for i in $(seq 1 400); do printf \"%0100d\\n\" 0; done; echo END'".to_string()
    };

    let end = run_command(root, &script, Duration::from_secs(10), &cancel, OUTPUT_LIMIT)
        .await
        .unwrap();
    match end {
        CommandEnd::Finished(res) => {
            assert!(res.output.starts_with("[earlier output cut]\n"));
            assert!(res.output.trim_end().ends_with("END"));
            let after_note = &res.output["[earlier output cut]\n".len()..];
            assert!(after_note.chars().count() <= aidp_lib::tools::OUTPUT_LIMIT);
        }
        CommandEnd::Stopped => panic!("Command should not be stopped"),
    }
}

#[test]
fn tail_cuts_on_char_boundaries() {
    let text = "hello 😊 world 🚀";
    let cut = tail(text, 5);
    assert_eq!(cut, "[earlier output cut]\nrld 🚀");
}
