use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Answer {
    Yes,
    No,
    Stopped,
}

pub struct Approvals {
    next: AtomicU32,
    pending: Mutex<HashMap<u32, oneshot::Sender<bool>>>,
}

impl Default for Approvals {
    fn default() -> Self {
        Self {
            next: AtomicU32::new(1),
            pending: Mutex::new(HashMap::new()),
        }
    }
}

impl Approvals {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn next_id(&self) -> u32 {
        self.next.fetch_add(1, Ordering::SeqCst)
    }

    pub fn register(&self, id: u32) -> oneshot::Receiver<bool> {
        let (tx, rx) = oneshot::channel();
        let mut guard = self.pending.lock().unwrap_or_else(|e| e.into_inner());
        guard.insert(id, tx);
        rx
    }

    pub fn answer(&self, id: u32, approve: bool) -> bool {
        let mut guard = self.pending.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(tx) = guard.remove(&id) {
            tx.send(approve).is_ok()
        } else {
            false
        }
    }

    pub async fn wait(
        &self,
        id: u32,
        rx: oneshot::Receiver<bool>,
        cancel: &CancellationToken,
    ) -> Answer {
        tokio::select! {
            _ = cancel.cancelled() => {
                let mut guard = self.pending.lock().unwrap_or_else(|e| e.into_inner());
                guard.remove(&id);
                Answer::Stopped
            }
            res = rx => {
                let mut guard = self.pending.lock().unwrap_or_else(|e| e.into_inner());
                guard.remove(&id);
                match res {
                    Ok(true) => Answer::Yes,
                    Ok(false) => Answer::No,
                    Err(_) => Answer::Stopped,
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn approvals_unit() {
        let approvals = Approvals::new();

        // 1. answer on an unknown id -> false
        assert!(!approvals.answer(999, true));

        // 2. answer before wait is not lost (register, answer, then wait -> Yes)
        let id = approvals.next_id();
        assert_eq!(id, 1);
        let rx = approvals.register(id);
        assert!(approvals.answer(id, true));
        let cancel = CancellationToken::new();
        let ans = approvals.wait(id, rx, &cancel).await;
        assert_eq!(ans, Answer::Yes);

        // 3. cancel -> Stopped and the entry is gone
        let id2 = approvals.next_id();
        assert_eq!(id2, 2);
        let rx2 = approvals.register(id2);
        let cancel2 = CancellationToken::new();
        cancel2.cancel();
        let ans2 = approvals.wait(id2, rx2, &cancel2).await;
        assert_eq!(ans2, Answer::Stopped);
        assert!(!approvals.answer(id2, true));
    }
}

