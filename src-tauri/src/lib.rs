pub mod config;
pub mod gateway;

use tauri_specta::{collect_commands, Builder};

#[tauri::command]
#[specta::specta]
fn greet(name: &str) -> String {
    format!("Hello, {name}! You've been greeted from Rust!")
}

fn specta_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new().commands(collect_commands![greet])
}

pub fn run() -> tauri::Result<()> {
    let builder = specta_builder();
    tauri::Builder::default()
        .invoke_handler(builder.invoke_handler())
        .run(tauri::generate_context!())
}

#[cfg(test)]
mod tests {
    use super::*;
    use specta_typescript::Typescript;

    #[test]
    fn export_bindings() {
        specta_builder()
            .export(Typescript::default(), "../src/lib/bindings.ts")
            .expect("failed to export TypeScript bindings");
    }
}
