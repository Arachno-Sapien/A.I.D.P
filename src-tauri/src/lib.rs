pub mod commands;
pub mod connections;
pub mod db;
pub mod gateway;
pub mod secrets;
pub mod workspace;

use std::sync::Arc;
use std::time::Duration;
use tauri::Manager;
use tauri_specta::{collect_commands, Builder};

pub fn is_app_url(url: &tauri::Url) -> bool {
    if url.scheme() == "tauri" {
        return true;
    }
    if (url.scheme() == "http" || url.scheme() == "https")
        && url.host_str() == Some("tauri.localhost")
    {
        return true;
    }
    #[cfg(debug_assertions)]
    if url.scheme() == "http"
        && url.host_str() == Some("localhost")
        && url.port() == Some(1420)
    {
        return true;
    }
    false
}

fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![
        commands::connections::list_connections,
        commands::connections::add_connection,
        commands::connections::test_connection,
        commands::connections::available_models,
        commands::connections::replace_key,
        commands::connections::delete_connection,
        commands::connections::set_models,
        commands::connections::chat_models,
        commands::connections::set_default_model,
        commands::chat::send_message,
        commands::chat::stop_reply,
        commands::workspace::open_folder,
        commands::workspace::recent_folders,
        commands::workspace::open_recent,
        commands::workspace::close_folder,
        commands::workspace::list_dir,
        commands::workspace::read_file,
        commands::workspace::write_file,
    ])
}

pub fn run() -> tauri::Result<()> {
    let builder = specta_builder();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("nav-guard")
                .on_navigation(|_window, url| is_app_url(url))
                .build(),
        )
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let db_path = app_data_dir.join("aidp.db");
            let db = db::open(&db_path)?;
            let http = reqwest::Client::builder()
                .connect_timeout(Duration::from_secs(10))
                .build()?;
            app.manage(connections::Services::new(
                db,
                Arc::new(secrets::Keychain),
                http,
            ));
            Ok(())
        })
        .manage(commands::chat::ChatState::default())
        .manage(workspace::WorkspaceState::default())
        .invoke_handler(builder.invoke_handler())
        .run(tauri::generate_context!())
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use specta_typescript::Typescript;

    #[test]
    fn nav_guard_allows_only_app_urls() {
        let ok = |u: &str| is_app_url(&tauri::Url::parse(u).unwrap());
        assert!(ok("tauri://localhost/"));
        assert!(ok("http://tauri.localhost/index.html"));
        assert!(!ok("https://example.com/"));
        assert!(!ok("http://localhost:8080/"));
        #[cfg(debug_assertions)]
        assert!(ok("http://localhost:1420/"));
    }

    #[test]
    fn export_bindings() {
        specta_builder()
            .export(Typescript::default(), "../src/lib/bindings.ts")
            .expect("failed to export TypeScript bindings");
    }
}
