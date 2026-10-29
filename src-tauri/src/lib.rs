pub mod commands;
pub mod config;
pub mod gateway;

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
        commands::chat::chat_config,
        commands::chat::send_message,
        commands::chat::stop_reply,
    ])
}

pub fn run() -> tauri::Result<()> {
    let builder = specta_builder();
    tauri::Builder::default()
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("nav-guard")
                .on_navigation(|_window, url| is_app_url(url))
                .build(),
        )
        .manage(commands::chat::ChatState::default())
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
