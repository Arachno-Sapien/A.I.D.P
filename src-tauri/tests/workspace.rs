mod common;

use aidp_lib::workspace::files::{
    create_file, list_dir, list_tree, read_file, write_file, LineEnding, WriteFile,
};
use aidp_lib::workspace::paths::{resolve, resolve_new};
use aidp_lib::workspace::search::search;
use aidp_lib::workspace::{is_git, open, WorkspaceError};
use common::{link_dir, link_file, TempDir};
use std::fs::{self, canonicalize};
use std::path::Path;

#[test]
fn resolves_nested_paths() {
    let temp = TempDir::new();
    let root = temp.path();
    let src = root.join("src");
    fs::create_dir_all(&src).unwrap();
    let a_ts = src.join("a.ts");
    fs::write(&a_ts, "hello").unwrap();

    let resolved = resolve(root, "src/a.ts").unwrap();
    assert_eq!(resolved, canonicalize(&a_ts).unwrap());
}

#[test]
fn empty_path_is_the_root() {
    let temp = TempDir::new();
    let root = temp.path();

    let resolved = resolve(root, "").unwrap();
    assert_eq!(resolved, root);
}

#[test]
fn parent_dir_is_refused() {
    let temp = TempDir::new();
    let root = temp.path();
    let src = root.join("src");
    fs::create_dir_all(&src).unwrap();
    let a_ts = src.join("a.ts");
    fs::write(&a_ts, "hello").unwrap();

    let parent = root.parent().unwrap();
    let outside = parent.join("outside.txt");
    fs::write(&outside, "secret").unwrap();

    assert_eq!(
        resolve(root, "../outside.txt"),
        Err(WorkspaceError::OutsideFolder)
    );
    assert_eq!(
        resolve(root, "src/../../outside.txt"),
        Err(WorkspaceError::OutsideFolder)
    );
    assert_eq!(
        resolve(root, "src/../a.ts"),
        Err(WorkspaceError::OutsideFolder)
    );

    let _ = fs::remove_file(outside);
}

#[test]
fn absolute_paths_are_refused() {
    let temp = TempDir::new();
    let root = temp.path();

    #[cfg(windows)]
    let abs_paths = [
        "C:\\Windows\\win.ini",
        "C:foo",
        "\\\\server\\share\\x",
        "/etc/passwd",
    ];

    #[cfg(not(windows))]
    let abs_paths = ["/etc/passwd"];

    for p in abs_paths {
        assert_eq!(
            resolve(root, p),
            Err(WorkspaceError::OutsideFolder),
            "expected {p} to be refused as OutsideFolder"
        );
    }
}

#[test]
fn colon_is_refused() {
    let temp = TempDir::new();
    let root = temp.path();
    let a_txt = root.join("a.txt");
    fs::write(&a_txt, "test").unwrap();

    assert_eq!(
        resolve(root, "a.txt:stream"),
        Err(WorkspaceError::OutsideFolder)
    );
}

#[test]
fn link_out_of_the_folder_is_refused() {
    let temp_root = TempDir::new();
    let root = temp_root.path();

    let temp_outside = TempDir::new();
    let outside_path = temp_outside.path();
    let secret = outside_path.join("secret.txt");
    fs::write(&secret, "confidential").unwrap();

    let out_link = root.join("out");
    link_dir(&out_link, outside_path);

    assert_eq!(
        resolve(root, "out/secret.txt"),
        Err(WorkspaceError::OutsideFolder)
    );
    assert_eq!(resolve(root, "out"), Err(WorkspaceError::OutsideFolder));
}

#[test]
fn link_inside_the_folder_works() {
    let temp = TempDir::new();
    let root = temp.path();
    let src = root.join("src");
    fs::create_dir_all(&src).unwrap();
    let a_ts = src.join("a.ts");
    fs::write(&a_ts, "hello").unwrap();

    let inner_link = root.join("inner");
    link_dir(&inner_link, &src);

    let resolved = resolve(root, "inner/a.ts").unwrap();
    assert_eq!(resolved, canonicalize(&a_ts).unwrap());
}

#[test]
fn missing_file_is_not_found() {
    let temp = TempDir::new();
    let root = temp.path();

    assert_eq!(resolve(root, "nope.txt"), Err(WorkspaceError::NotFound));
}

#[test]
fn read_refuses_large_files() {
    let temp = TempDir::new();
    let root = temp.path();
    let large = root.join("large.txt");
    let size = 2 * 1024 * 1024 + 1;
    let data = vec![b'a'; size];
    fs::write(&large, data).unwrap();

    assert_eq!(
        read_file(root, "large.txt"),
        Err(WorkspaceError::TooLarge {
            bytes: 2097153
        })
    );
}

#[test]
fn read_marks_secret_files() {
    let temp = TempDir::new();
    let root = temp.path();
    fs::write(root.join(".env"), "SECRET=true").unwrap();
    fs::write(root.join("a.ts"), "export const a = 1;").unwrap();

    let env = read_file(root, ".env").unwrap();
    assert!(env.is_secret);

    let ts = read_file(root, "a.ts").unwrap();
    assert!(!ts.is_secret);
}

#[test]
fn read_marks_a_link_to_a_secret_file() {
    let temp = TempDir::new();
    let root = temp.path();
    fs::write(root.join(".env"), "SECRET=true").unwrap();
    if !link_file(&root.join("notes.txt"), &root.join(".env")) {
        eprintln!("skipped: this machine does not allow file symlinks");
        return;
    }

    assert!(read_file(root, "notes.txt").unwrap().is_secret);
}

#[test]
fn write_checks_the_version() {
    let temp = TempDir::new();
    let root = temp.path();
    let a_txt = root.join("a.txt");
    fs::write(&a_txt, "initial").unwrap();

    let content = read_file(root, "a.txt").unwrap();
    fs::write(&a_txt, "different content length!").unwrap();

    let res = write_file(
        root,
        WriteFile {
            path: "a.txt".into(),
            text: "my write".into(),
            line_ending: LineEnding::Lf,
            has_bom: false,
            expected_version: Some(content.version),
        },
    );
    assert_eq!(res, Err(WorkspaceError::ChangedOnDisk));
    assert_eq!(fs::read_to_string(&a_txt).unwrap(), "different content length!");

    let ok_res = write_file(
        root,
        WriteFile {
            path: "a.txt".into(),
            text: "force write".into(),
            line_ending: LineEnding::Lf,
            has_bom: false,
            expected_version: None,
        },
    );
    assert!(ok_res.is_ok());
    assert_eq!(fs::read_to_string(&a_txt).unwrap(), "force write");
}

#[test]
fn write_keeps_crlf_and_bom() {
    let temp = TempDir::new();
    let root = temp.path();
    let path = root.join("crlf_bom.txt");
    fs::write(&path, b"\xEF\xBB\xBFhello\r\nworld\r\n").unwrap();

    let content = read_file(root, "crlf_bom.txt").unwrap();
    assert_eq!(content.line_ending, LineEnding::Crlf);
    assert!(content.has_bom);

    write_file(
        root,
        WriteFile {
            path: "crlf_bom.txt".into(),
            text: "x\ny\n".into(),
            line_ending: content.line_ending,
            has_bom: content.has_bom,
            expected_version: Some(content.version),
        },
    )
    .unwrap();

    assert_eq!(
        fs::read(&path).unwrap(),
        vec![0xEF, 0xBB, 0xBF, b'x', b'\r', b'\n', b'y', b'\r', b'\n']
    );
}

#[test]
fn write_refuses_missing_files() {
    let temp = TempDir::new();
    let root = temp.path();

    let res = write_file(
        root,
        WriteFile {
            path: "missing.txt".into(),
            text: "content".into(),
            line_ending: LineEnding::Lf,
            has_bom: false,
            expected_version: None,
        },
    );
    assert_eq!(res, Err(WorkspaceError::NotFound));
    assert!(!root.join("missing.txt").exists());
}

#[test]
fn list_dir_respects_gitignore() {
    let temp = TempDir::new();
    let root = temp.path();
    fs::create_dir(root.join(".git")).unwrap();
    fs::write(root.join(".gitignore"), "target/\n*.log\n").unwrap();
    fs::create_dir(root.join("src")).unwrap();
    fs::create_dir(root.join("target")).unwrap();
    fs::create_dir(root.join(".github")).unwrap();
    fs::write(root.join("a.log"), "log").unwrap();
    fs::write(root.join("B.txt"), "text").unwrap();

    let entries = list_dir(root, "").unwrap();
    let names: Vec<_> = entries.iter().map(|e| e.name.as_str()).collect();
    assert_eq!(names, vec![".github", "src", ".gitignore", "B.txt"]);
}

#[test]
fn list_dir_applies_root_rules_below() {
    let temp = TempDir::new();
    let root = temp.path();
    fs::create_dir(root.join(".git")).unwrap();
    fs::write(root.join(".gitignore"), "target/\n*.log\n").unwrap();
    let src = root.join("src");
    fs::create_dir(&src).unwrap();
    fs::write(src.join("x.log"), "log").unwrap();
    fs::write(src.join("y.ts"), "code").unwrap();

    let entries = list_dir(root, "src").unwrap();
    let names: Vec<_> = entries.iter().map(|e| e.name.as_str()).collect();
    let paths: Vec<_> = entries.iter().map(|e| e.path.as_str()).collect();
    assert_eq!(names, vec!["y.ts"]);
    assert_eq!(paths, vec!["src/y.ts"]);
}

#[test]
fn list_dir_without_git_shows_everything() {
    let temp = TempDir::new();
    let root = temp.path();
    fs::write(root.join(".gitignore"), "*.log\n").unwrap();
    fs::write(root.join("a.log"), "log").unwrap();

    let entries = list_dir(root, "").unwrap();
    let names: Vec<_> = entries.iter().map(|e| e.name.as_str()).collect();
    assert!(names.contains(&"a.log"));
}

#[test]
fn list_dir_refuses_a_link_out() {
    let temp_root = TempDir::new();
    let root = temp_root.path();

    let temp_outside = TempDir::new();
    let outside_path = temp_outside.path();

    let out_link = root.join("out");
    link_dir(&out_link, outside_path);

    assert_eq!(list_dir(root, "out"), Err(WorkspaceError::OutsideFolder));
}

#[test]
fn is_git_detection() {
    let temp = TempDir::new();
    let root = temp.path();
    fs::create_dir(root.join(".git")).unwrap();
    let sub = root.join("sub");
    fs::create_dir(&sub).unwrap();

    assert!(is_git(root));
    assert!(is_git(&sub));

    let fresh = TempDir::new();
    assert!(!is_git(fresh.path()));
}

#[test]
fn open_reports_git_and_display_path() {
    let temp = TempDir::new();
    let root = temp.path();
    fs::create_dir(root.join(".git")).unwrap();

    let (canonical, info) = open(root).unwrap();
    assert!(info.is_git);
    assert!(!info.path.starts_with(r"\\?\"));
    let expected_name = canonical.file_name().unwrap().to_str().unwrap();
    assert_eq!(info.name, expected_name);
}

#[test]
fn open_refuses_a_file() {
    let temp = TempDir::new();
    let root = temp.path();
    let a_txt = root.join("a.txt");
    fs::write(&a_txt, "hello").unwrap();

    assert_eq!(open(&a_txt), Err(WorkspaceError::NotFound));
}

#[test]
fn resolve_new_table() {
    let temp = TempDir::new();
    let root = temp.path();

    let a_txt = root.join("a.txt");
    fs::write(&a_txt, "existing").unwrap();

    let res = resolve_new(root, "a/b/new.txt").unwrap();
    let canon_root = canonicalize(root).unwrap();
    assert!(res.starts_with(&canon_root));
    assert!(res.ends_with(Path::new("a").join("b").join("new.txt")));

    assert_eq!(resolve_new(root, "a.txt"), Err(WorkspaceError::AlreadyExists));

    assert_eq!(resolve_new(root, "new/../../x"), Err(WorkspaceError::OutsideFolder));
    assert_eq!(resolve_new(root, "/x"), Err(WorkspaceError::OutsideFolder));
    #[cfg(windows)]
    assert_eq!(resolve_new(root, "C:\\x"), Err(WorkspaceError::OutsideFolder));
    assert_eq!(resolve_new(root, "a.txt:s"), Err(WorkspaceError::OutsideFolder));

    let outside = TempDir::new();
    link_dir(&root.join("out"), outside.path());
    assert_eq!(resolve_new(root, "out/new.txt"), Err(WorkspaceError::OutsideFolder));

    // A file that exists outside must not answer "already exists": that would tell the model it is there.
    fs::write(outside.path().join("there.txt"), "x").unwrap();
    assert_eq!(resolve_new(root, "out/there.txt"), Err(WorkspaceError::OutsideFolder));
}

#[test]
fn git_folder_is_refused() {
    let temp = TempDir::new();
    let root = temp.path();
    fs::create_dir_all(root.join(".git/hooks")).unwrap();
    fs::write(root.join(".git/config"), "[core]\n").unwrap();
    fs::create_dir_all(root.join(".github")).unwrap();
    fs::write(root.join(".gitignore"), "target/\n").unwrap();

    for p in [".git", ".git/config", ".GIT/config", "sub/.git"] {
        assert_eq!(resolve(root, p), Err(WorkspaceError::OutsideFolder), "{p}");
    }
    assert_eq!(
        resolve_new(root, ".git/hooks/pre-commit"),
        Err(WorkspaceError::OutsideFolder)
    );

    // Names that only start with .git stay allowed.
    assert!(resolve(root, ".gitignore").is_ok());
    assert!(resolve(root, ".github").is_ok());

    // A link into .git is refused where it lands.
    link_dir(&root.join("g"), &root.join(".git"));
    assert_eq!(resolve(root, "g/config"), Err(WorkspaceError::OutsideFolder));
    assert_eq!(
        resolve_new(root, "g/hooks/pre-commit"),
        Err(WorkspaceError::OutsideFolder)
    );

    // Windows drops trailing dots and spaces, so ".git." names .git. In a
    // folder with no .git yet, creating ".git./hooks/x" would make a real hook.
    let plain = TempDir::new();
    for p in [".git./hooks/pre-commit", ".git /config", ".GIT. ./x"] {
        assert_eq!(
            resolve_new(plain.path(), p),
            Err(WorkspaceError::OutsideFolder),
            "{p}"
        );
    }
    assert!(resolve_new(plain.path(), "repo.git/x").is_ok());
}

#[test]
fn search_skips_links() {
    let temp = TempDir::new();
    let root = temp.path();
    let outside = TempDir::new();
    fs::write(outside.path().join("creds.txt"), "needle-outside").unwrap();
    fs::write(root.join(".env"), "needle-env").unwrap();

    // Windows needs Developer Mode or admin for file links; skip the check without them.
    if !link_file(&root.join("notes.txt"), &root.join(".env"))
        || !link_file(&root.join("out.txt"), &outside.path().join("creds.txt"))
    {
        return;
    }

    let (matches, _) = search(root, "", "needle", 100).unwrap();
    assert!(matches.is_empty(), "search read through a link: {matches:?}");
}

#[test]
fn list_tree_skips_ignored_and_secret() {
    let temp = TempDir::new();
    let root = temp.path();

    fs::create_dir_all(root.join(".git")).unwrap();
    fs::create_dir_all(root.join("target")).unwrap();
    fs::create_dir_all(root.join("src")).unwrap();

    fs::write(root.join(".gitignore"), "target/\n").unwrap();
    fs::write(root.join("target/x"), "ignored").unwrap();
    fs::write(root.join(".env"), "SECRET=1").unwrap();
    fs::write(root.join("src/a.ts"), "export const a = 1;").unwrap();
    fs::write(root.join("id_rsa"), "key").unwrap();

    let (entries, has_more) = list_tree(root, "", 100).unwrap();
    assert!(!has_more);
    assert_eq!(entries, vec![".gitignore", "src/", "src/a.ts"]);
}

#[test]
fn list_tree_caps_entries() {
    let temp = TempDir::new();
    let root = temp.path();

    for i in 0..12 {
        fs::write(root.join(format!("file_{i:02}.txt")), "content").unwrap();
    }

    let (entries, has_more) = list_tree(root, "", 5).unwrap();
    assert!(has_more);
    assert_eq!(entries.len(), 5);
}

#[test]
fn create_file_writes_lf_and_refuses_existing() {
    let temp = TempDir::new();
    let root = temp.path();

    let ver = create_file(root, "n/new.txt", "a\r\nb").unwrap();
    assert!(!ver.is_empty());

    let bytes = fs::read(root.join("n/new.txt")).unwrap();
    assert_eq!(bytes, b"a\nb");

    assert_eq!(create_file(root, "n/new.txt", "more"), Err(WorkspaceError::AlreadyExists));
}

#[test]
fn search_finds_and_skips() {
    let temp = TempDir::new();
    let root = temp.path();

    fs::create_dir_all(root.join(".git")).unwrap();
    fs::create_dir_all(root.join("src")).unwrap();
    fs::create_dir_all(root.join("target")).unwrap();

    fs::write(root.join(".gitignore"), "target/\n").unwrap();
    fs::write(root.join("target/ignored.txt"), "Foo in target").unwrap();
    fs::write(root.join(".env"), "Foo in env").unwrap();
    fs::write(root.join("src/binary.bin"), b"\0Foo binary").unwrap();
    fs::write(root.join("src/a.ts"), "line 1\nline 2\nconst Foo = 42;\nline 4\n").unwrap();
    fs::write(root.join("config.txt"), "-----BEGIN RSA PRIVATE KEY-----\nFoo in private key\n-----END RSA PRIVATE KEY-----\n").unwrap();

    let (matches, has_more) = search(root, "", "Foo", 100).unwrap();
    assert!(!has_more);
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].path, "src/a.ts");
    assert_eq!(matches[0].line, 3);
    assert_eq!(matches[0].text, "const Foo = 42;");
}

#[test]
fn search_caps_matches() {
    let temp = TempDir::new();
    let root = temp.path();

    let lines = (0..150).map(|i| format!("needle {i}")).collect::<Vec<_>>().join("\n");
    fs::write(root.join("many.txt"), lines).unwrap();

    let (matches, has_more) = search(root, "", "needle", 100).unwrap();
    assert!(has_more);
    assert_eq!(matches.len(), 100);
}

#[test]
fn read_marks_a_private_key_file() {
    let temp = TempDir::new();
    let root = temp.path();

    fs::write(
        root.join("config.txt"),
        "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----\n",
    )
    .unwrap();

    let content = read_file(root, "config.txt").unwrap();
    assert!(content.is_secret);
}



