use aidp_lib::updates::versions_match;
use std::path::Path;

/// The release tag is `v` + this version, so the three files that hold it must agree.
#[test]
fn versions_match_across_files() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let package_json = std::fs::read_to_string(root.join("../package.json")).unwrap();
    let tauri_conf = std::fs::read_to_string(root.join("tauri.conf.json")).unwrap();
    assert!(
        versions_match(env!("CARGO_PKG_VERSION"), &package_json, &tauri_conf),
        "Cargo.toml, package.json and tauri.conf.json must have the same version"
    );
}
