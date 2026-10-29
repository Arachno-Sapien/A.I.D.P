mod common;

use aidp_lib::workspace::paths::resolve;
use aidp_lib::workspace::WorkspaceError;
use common::{link_dir, TempDir};
use std::fs::{self, canonicalize};

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

