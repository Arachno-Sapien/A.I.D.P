use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::ipc::Channel;

#[derive(Default)]
pub struct CloseGuard {
    unsaved: AtomicBool,
    channel: Mutex<Option<Channel<bool>>>,
}

impl CloseGuard {
    pub fn set_unsaved(&self, unsaved: bool) {
        self.unsaved.store(unsaved, Ordering::SeqCst);
    }

    pub fn has_unsaved(&self) -> bool {
        self.unsaved.load(Ordering::SeqCst)
    }

    pub fn watch(&self, channel: Channel<bool>) {
        let mut guard = self.channel.lock().unwrap_or_else(|e| e.into_inner());
        *guard = Some(channel);
    }

    // Without a listening window nobody can answer the prompt, so never trap the user.
    pub fn should_block(&self) -> bool {
        self.unsaved.load(Ordering::SeqCst)
            && self
                .channel
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .is_some()
    }

    pub fn notify_close_requested(&self) {
        let guard = self.channel.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(ch) = guard.as_ref() {
            let _ = ch.send(true);
        }
    }
}

#[tauri::command]
#[specta::specta]
pub fn set_unsaved(state: tauri::State<'_, CloseGuard>, unsaved: bool) {
    state.set_unsaved(unsaved);
}

#[tauri::command]
#[specta::specta]
pub fn watch_close(state: tauri::State<'_, CloseGuard>, on_close: Channel<bool>) {
    state.watch(on_close);
}

#[tauri::command]
#[specta::specta]
pub fn quit_app(app: tauri::AppHandle, state: tauri::State<'_, CloseGuard>) {
    state.set_unsaved(false);
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_guard_blocks_only_when_unsaved() {
        let guard = CloseGuard::default();
        guard.watch(Channel::new(|_| Ok(())));
        assert!(!guard.should_block());
        guard.set_unsaved(true);
        assert!(guard.should_block());
        guard.set_unsaved(false);
        assert!(!guard.should_block());
    }

    #[test]
    fn close_guard_never_blocks_without_a_listening_window() {
        let guard = CloseGuard::default();
        guard.set_unsaved(true);
        assert!(!guard.should_block());
    }
}

