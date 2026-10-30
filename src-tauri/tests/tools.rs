mod common;

use aidp_lib::tools::run::{
    apply_create, apply_edit, list_files, parse, prepare_create, prepare_edit, read_file, search,
    ToolInput,
};
use aidp_lib::tools::specs;
use common::{link_dir, link_file, TempDir};
use serde_json::json;
use std::fs;

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
        let run = read_file(root, p, None, None);
        assert!(run.is_error);
        assert_eq!(
            run.for_model,
            "Refused: paths must be relative to the project folder (like src/main.rs) and stay inside it."
        );
    }

    if cfg!(windows) {
        let run = read_file(root, "C:\\Windows\\win.ini", None, None);
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

    let run = read_file(root, "link_out/foo.txt", None, None);
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
    let run = read_file(root, ".env", None, None);
    assert!(run.is_error);
    assert_eq!(
        run.for_model,
        "Refused: .env looks like a secret file (keys, .env). It is never shared with you; ask the user to paste what you need."
    );
    assert!(!run.for_model.contains("123456789"));

    // 2. Symlink notes.txt -> .env
    let notes = root.join("notes.txt");
    if link_file(&notes, &root.join(".env")) {
        let run_link = read_file(root, "notes.txt", None, None);
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
    let run_key = read_file(root, "config.txt", None, None);
    assert!(run_key.is_error);
    assert_eq!(
        run_key.for_model,
        "Refused: config.txt looks like a secret file (keys, .env). It is never shared with you; ask the user to paste what you need."
    );
    assert!(!run_key.for_model.contains("MIIE"));
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

    let run = read_file(root, "ten.txt", Some(3), Some(5));
    assert!(!run.is_error);
    assert_eq!(
        run.for_model,
        "ten.txt, lines 3-5 of 10:\nline 3\nline 4\nline 5"
    );

    // 150,000-char file
    let line_str = "a".repeat(99) + "\n"; // 100 chars per line
    let big_content = line_str.repeat(1500); // 150,000 chars, 1500 lines
    fs::write(root.join("big.txt"), big_content).unwrap();

    let run_big = read_file(root, "big.txt", None, None);
    assert!(!run_big.is_error);
    assert!(run_big.for_model.contains("[cut at line "));
    assert!(run_big.for_model.contains("; read on with start_line="));
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
