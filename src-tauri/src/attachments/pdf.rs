//! A PDF's text. The parser runs in a child process, `aidp --pdf-text <pdf> <out>`:
//! a malformed file can make it panic or run forever, and the app is built with
//! `panic = "abort"`, so only the child may die. The child writes the text to a
//! file because the parser can print to standard output.

use crate::connections::AppError;
use std::alloc::{GlobalAlloc, Layout, System};
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::{ExitStatus, Stdio};
use std::sync::atomic::{AtomicIsize, Ordering::Relaxed};
use std::time::Duration;

pub const PDF_TEXT_FLAG: &str = "--pdf-text";

/// The most heap the PDF child may use. A 20 MB PDF needs far less; a decompression
/// bomb (a small file that unpacks to gigabytes) stops here instead of filling the
/// machine's memory.
pub const CHILD_MEMORY: usize = 1024 * 1024 * 1024;

/// The `<pdf> <out>` and memory cap of `aidp --pdf-text <pdf> <out> [<bytes>]`, given
/// the arguments after the program's name; None when this isn't the PDF child. A
/// missing or unreadable cap means `CHILD_MEMORY`, never no cap. A path that isn't
/// Unicode is still a path, so nothing here can panic.
pub fn child_args(
    mut args: impl Iterator<Item = OsString>,
) -> Option<(PathBuf, PathBuf, usize)> {
    if args.next()?.as_os_str() != PDF_TEXT_FLAG {
        return None;
    }
    let pdf = PathBuf::from(args.next().unwrap_or_default());
    let out = PathBuf::from(args.next().unwrap_or_default());
    let cap = args
        .next()
        .and_then(|a| a.to_str()?.parse::<usize>().ok())
        .filter(|&c| c > 0)
        .unwrap_or(CHILD_MEMORY);
    Some((pdf, out, cap))
}

/// The app's allocator: the system one, plus a heap cap that only the PDF child
/// turns on. With no cap (the app itself) each call costs one relaxed load.
/// Past the cap an allocation fails, which aborts the child: the app then reports
/// the PDF as unreadable. Works the same on every OS, unlike rlimits (macOS
/// doesn't enforce RLIMIT_AS).
pub struct CappedAlloc {
    /// Bytes allowed; 0 = no cap.
    limit: AtomicIsize,
    /// Bytes counted since the cap was set. Signed: memory taken before the cap
    /// and freed after it brings this below zero, which is harmless.
    used: AtomicIsize,
}

impl CappedAlloc {
    pub const fn new() -> Self {
        CappedAlloc {
            limit: AtomicIsize::new(0),
            used: AtomicIsize::new(0),
        }
    }

    /// Caps the heap at `bytes` from now on. Called once, at the child's start.
    pub fn set_limit(&self, bytes: usize) {
        self.limit
            .store(isize::try_from(bytes).unwrap_or(isize::MAX), Relaxed);
    }

    /// Counts `size` more bytes; false (and nothing counted) past the cap.
    fn take(&self, size: usize) -> bool {
        let limit = self.limit.load(Relaxed);
        if limit == 0 {
            return true;
        }
        let size = isize::try_from(size).unwrap_or(isize::MAX);
        if self.used.fetch_add(size, Relaxed).saturating_add(size) > limit {
            self.used.fetch_sub(size, Relaxed);
            return false;
        }
        true
    }

    fn give_back(&self, size: usize) {
        if self.limit.load(Relaxed) != 0 {
            self.used
                .fetch_sub(isize::try_from(size).unwrap_or(isize::MAX), Relaxed);
        }
    }
}

impl Default for CappedAlloc {
    fn default() -> Self {
        Self::new()
    }
}

// SAFETY: every call is passed to `System` unchanged; this only refuses some
// allocations (returning null, which callers must handle) and keeps a count.
unsafe impl GlobalAlloc for CappedAlloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if !self.take(layout.size()) {
            return std::ptr::null_mut();
        }
        // SAFETY: the caller's contract for `alloc` is passed on as is.
        let ptr = unsafe { System.alloc(layout) };
        if ptr.is_null() {
            self.give_back(layout.size());
        }
        ptr
    }

    unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
        if !self.take(layout.size()) {
            return std::ptr::null_mut();
        }
        // SAFETY: the caller's contract for `alloc_zeroed` is passed on as is.
        let ptr = unsafe { System.alloc_zeroed(layout) };
        if ptr.is_null() {
            self.give_back(layout.size());
        }
        ptr
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        // SAFETY: the caller's contract for `dealloc` is passed on as is.
        unsafe { System.dealloc(ptr, layout) };
        self.give_back(layout.size());
    }

    unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
        let old = layout.size();
        if new_size > old && !self.take(new_size - old) {
            return std::ptr::null_mut();
        }
        // SAFETY: the caller's contract for `realloc` is passed on as is.
        let new = unsafe { System.realloc(ptr, layout, new_size) };
        if new.is_null() {
            if new_size > old {
                self.give_back(new_size - old);
            }
        } else if new_size < old {
            self.give_back(old - new_size);
        }
        new
    }
}
/// The most text kept from one PDF; the model's context budget cuts it further.
const MAX_TEXT_OUT: usize = 2 * 1024 * 1024;
const LIMIT: Duration = Duration::from_secs(20);

/// The text of a PDF. Called only in the child process.
pub fn pdf_text(bytes: &[u8]) -> Result<String, String> {
    pdf_extract::extract_text_from_mem(bytes).map_err(|e| e.to_string())
}

/// The child's work: reads `pdf` and writes its text, at most 2 MB, to `out`.
/// Returns the process exit code.
pub fn run_child(pdf: &Path, out: &Path) -> i32 {
    let Ok(bytes) = std::fs::read(pdf) else {
        return 2;
    };
    let Ok(text) = pdf_text(&bytes) else {
        return 1;
    };
    let mut end = text.len().min(MAX_TEXT_OUT);
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    match std::fs::write(out, &text[..end]) {
        Ok(()) => 0,
        Err(_) => 3,
    }
}

/// Reads a stored PDF's text in a child process, stopped after 20 seconds.
pub async fn text_in_child(pdf: PathBuf) -> Result<String, AppError> {
    let exe = std::env::current_exe().map_err(|e| AppError::Storage {
        message: e.to_string(),
    })?;
    let out = super::temp_beside(&pdf, "out");

    let mut cmd = tokio::process::Command::new(exe);
    cmd.arg(PDF_TEXT_FLAG)
        .arg(&pdf)
        .arg(&out)
        .arg(CHILD_MEMORY.to_string());
    let text = match run_bounded(cmd, LIMIT).await {
        Ok(status) if status.success() => {
            std::fs::read_to_string(&out).map_err(|e| AppError::Storage {
                message: e.to_string(),
            })
        }
        Ok(_) => Err(AppError::InvalidInput {
            message: "couldn't be read".to_string(),
        }),
        Err(e) => Err(e),
    };
    let _ = std::fs::remove_file(&out);
    text
}

/// Runs `cmd` with no window and nothing inherited, killing it after `limit`.
pub(crate) async fn run_bounded(
    mut cmd: tokio::process::Command,
    limit: Duration,
) -> Result<ExitStatus, AppError> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().map_err(|e| AppError::Storage {
        message: e.to_string(),
    })?;
    match tokio::time::timeout(limit, child.wait()).await {
        Ok(status) => status.map_err(|e| AppError::Storage {
            message: e.to_string(),
        }),
        Err(_) => {
            let _ = child.kill().await;
            Err(AppError::InvalidInput {
                message: "took too long to read".to_string(),
            })
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used)]
mod tests {
    use super::*;
    use lopdf::content::{Content, Operation};
    use lopdf::{dictionary, Document, Object, Stream};

    /// A one-page PDF showing `text` in a standard font.
    fn pdf_with_text(text: &str) -> Vec<u8> {
        let mut doc = Document::with_version("1.5");
        let pages_id = doc.new_object_id();
        let font_id = doc.add_object(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Courier",
        });
        let resources_id = doc.add_object(dictionary! {
            "Font" => dictionary! { "F1" => font_id },
        });
        let content = Content {
            operations: vec![
                Operation::new("BT", vec![]),
                Operation::new("Tf", vec!["F1".into(), 24.into()]),
                Operation::new("Td", vec![72.into(), 720.into()]),
                Operation::new("Tj", vec![Object::string_literal(text)]),
                Operation::new("ET", vec![]),
            ],
        };
        let content_id = doc.add_object(Stream::new(dictionary! {}, content.encode().unwrap()));
        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "Contents" => content_id,
        });
        doc.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages",
                "Kids" => vec![page_id.into()],
                "Count" => 1,
                "Resources" => resources_id,
                "MediaBox" => vec![0.into(), 0.into(), 612.into(), 792.into()],
            }),
        );
        let catalog_id = doc.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => pages_id,
        });
        doc.trailer.set("Root", catalog_id);
        let mut bytes = Vec::new();
        doc.save_to(&mut bytes).unwrap();
        bytes
    }

    #[test]
    fn child_args_take_any_path() {
        use std::ffi::OsString;
        let args = |v: &[&str]| v.iter().map(OsString::from).collect::<Vec<_>>().into_iter();
        assert_eq!(child_args(args(&[])), None);
        assert_eq!(child_args(args(&["--other", "a"])), None);
        assert_eq!(
            child_args(args(&["--pdf-text", "a.pdf", "a.out"])),
            Some((PathBuf::from("a.pdf"), PathBuf::from("a.out"), CHILD_MEMORY))
        );
        assert_eq!(
            child_args(args(&["--pdf-text", "a.pdf", "a.out", "4096"])),
            Some((PathBuf::from("a.pdf"), PathBuf::from("a.out"), 4096))
        );
        // A cap that isn't a positive number is the default cap, never none.
        for bad in ["0", "-1", "lots"] {
            assert_eq!(
                child_args(args(&["--pdf-text", "a", "b", bad])).map(|a| a.2),
                Some(CHILD_MEMORY)
            );
        }
        // A path that isn't Unicode is still a path, not a crash.
        #[cfg(windows)]
        let odd = {
            use std::os::windows::ffi::OsStringExt;
            OsString::from_wide(&[0x61, 0xD800])
        };
        #[cfg(unix)]
        let odd = {
            use std::os::unix::ffi::OsStringExt;
            OsString::from_vec(vec![0x61, 0xFF])
        };
        let got = child_args(vec![OsString::from("--pdf-text"), odd.clone(), "o".into()].into_iter());
        assert_eq!(got, Some((PathBuf::from(odd), PathBuf::from("o"), CHILD_MEMORY)));
    }

    #[test]
    fn the_allocator_refuses_past_its_cap_and_counts_frees() {
        let a = CappedAlloc::new();
        let kb = Layout::from_size_align(1024, 8).unwrap();
        // SAFETY (test): each pointer is freed once, with the layout it was made with.
        unsafe {
            // No cap: anything goes and nothing is counted.
            let p = a.alloc(kb);
            assert!(!p.is_null());
            a.dealloc(p, kb);

            a.set_limit(2048);
            let p1 = a.alloc(kb);
            let p2 = a.alloc_zeroed(kb);
            assert!(!p1.is_null() && !p2.is_null());
            assert!(a.alloc(kb).is_null(), "a third KB fits under a 2 KB cap");
            a.dealloc(p2, kb);
            // Growing past the cap fails and leaves the block as it was.
            assert!(a.realloc(p1, kb, 4096).is_null());
            let p3 = a.realloc(p1, kb, 2048);
            assert!(!p3.is_null(), "growing to exactly the cap is refused");
            let two_kb = Layout::from_size_align(2048, 8).unwrap();
            let p4 = a.realloc(p3, two_kb, 512);
            assert!(!p4.is_null());
            let p5 = a.alloc(Layout::from_size_align(1536, 8).unwrap());
            assert!(!p5.is_null(), "shrinking didn't give the space back");
            a.dealloc(p5, Layout::from_size_align(1536, 8).unwrap());
            a.dealloc(p4, Layout::from_size_align(512, 8).unwrap());
        }
    }

    #[test]
    fn pdf_text_is_extracted() {
        let text = pdf_text(&pdf_with_text("Hello attachments")).unwrap();
        assert!(text.contains("Hello attachments"), "{text:?}");
    }

    #[test]
    fn the_child_writes_the_text_to_a_file() {
        let dir = std::env::temp_dir().join(format!("aidp-pdf-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let pdf = dir.join("a.pdf");
        let out = dir.join("a.out");
        std::fs::write(&pdf, pdf_with_text("Child text")).unwrap();

        assert_eq!(run_child(&pdf, &out), 0);
        assert!(std::fs::read_to_string(&out).unwrap().contains("Child text"));

        let missing_out = dir.join("m.out");
        let missing = dir.join("missing.pdf");
        assert_ne!(run_child(&missing, &missing_out), 0);
        assert!(!missing_out.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn a_child_that_runs_too_long_is_stopped() {
        #[cfg(windows)]
        let cmd = {
            let mut c = tokio::process::Command::new("ping");
            c.args(["-n", "30", "127.0.0.1"]);
            c
        };
        #[cfg(not(windows))]
        let cmd = {
            let mut c = tokio::process::Command::new("sleep");
            c.arg("30");
            c
        };
        let started = std::time::Instant::now();
        let result = run_bounded(cmd, Duration::from_millis(300)).await;
        assert!(matches!(result, Err(AppError::InvalidInput { .. })), "{result:?}");
        assert!(started.elapsed() < Duration::from_secs(5));
    }
}
