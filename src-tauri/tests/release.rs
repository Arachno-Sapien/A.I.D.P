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

/// Tauri's NSIS installer never tells Explorer that icons changed, so after an
/// update the taskbar kept the old icon (known-issues, 2026-11-01). Our hook does.
#[test]
fn windows_installer_refreshes_icons() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    let tauri_conf = std::fs::read_to_string(root.join("tauri.conf.json")).unwrap();
    assert!(
        tauri_conf.contains(r#""installerHooks": "installer-hooks.nsh""#),
        "tauri.conf.json must name the NSIS hooks file"
    );
    let hooks = std::fs::read_to_string(root.join("installer-hooks.nsh")).unwrap();
    assert!(hooks.contains("!macro NSIS_HOOK_POSTINSTALL"));
    assert!(hooks.contains("SHChangeNotify"));
}
