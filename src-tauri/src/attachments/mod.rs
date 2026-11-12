//! Files attached to chat messages (decision 0019). Rust checks each one by its
//! first bytes, keeps one copy under its SHA-256 in the app's data folder, and
//! is the only side that reads it; the UI holds IDs and thumbnails.

pub mod pdf;

use crate::connections::{AppError, Services};
use crate::gateway::{ChatMessage, ImageInput, Role};
use crate::workspace::secret_files;
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use specta::Type;
use std::collections::HashSet;
use std::fmt::Write as _;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime};

const MB: usize = 1024 * 1024;
/// 3.75 MB: images travel as base64, a third larger, and Anthropic refuses more
/// than 5 MB of base64 (`image exceeds 5 MB maximum`).
pub const MAX_IMAGE: usize = 5 * MB / 4 * 3;
pub const MAX_TEXT: usize = 512 * 1024;
pub const MAX_PDF: usize = 20 * MB;
/// How long an attachment no message refers to is kept: it may still be waiting in a composer.
pub const UNUSED_GRACE: Duration = Duration::from_secs(60 * 60);
const SECRET_WARNING: &str = "Looks like a secret file";

#[derive(Serialize, Deserialize, Type, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AttachmentKind {
    Image,
    Text,
    Pdf,
}

#[derive(Serialize, Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub name: String,
    pub mime: String,
    pub size: u32,
    pub kind: AttachmentKind,
    pub warning: Option<String>,
}

/// What a pick or a drop gave: the files added, and a message for each one refused.
#[derive(Serialize, Deserialize, Type, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Attachments {
    pub added: Vec<Attachment>,
    pub refused: Vec<String>,
}

/// What a file is, from its first bytes. The name is never trusted.
pub fn detect(bytes: &[u8]) -> Option<(AttachmentKind, &'static str)> {
    use AttachmentKind::{Image, Pdf, Text};
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some((Image, "image/png"))
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some((Image, "image/jpeg"))
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some((Image, "image/gif"))
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP".as_slice()) {
        Some((Image, "image/webp"))
    } else if bytes.starts_with(b"%PDF-") {
        Some((Pdf, "application/pdf"))
    } else if !bytes.contains(&0) && std::str::from_utf8(bytes).is_ok() {
        Some((Text, "text/plain"))
    } else {
        None
    }
}

fn limit(kind: AttachmentKind) -> (usize, &'static str) {
    match kind {
        AttachmentKind::Image => (MAX_IMAGE, "3.75 MB, the limit for images"),
        AttachmentKind::Text => (MAX_TEXT, "512 KB, the limit for text files"),
        AttachmentKind::Pdf => (MAX_PDF, "20 MB, the limit for PDFs"),
    }
}

fn refused(message: String) -> AppError {
    AppError::InvalidInput { message }
}

fn storage(e: std::io::Error) -> AppError {
    AppError::Storage {
        message: e.to_string(),
    }
}

/// The file name alone, for showing; a picked path's folders stay in Rust.
fn display_name(name: &str) -> String {
    let base = Path::new(name)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(name)
        .trim();
    if base.is_empty() {
        "file".to_string()
    } else {
        base.chars().take(255).collect()
    }
}

fn is_id(id: &str) -> bool {
    id.len() == 64 && id.bytes().all(|b| matches!(b, b'0'..=b'9' | b'a'..=b'f'))
}

/// A file name beside `path` for something written, then renamed or removed: new on
/// every call, so two reads of the same attachment never share one, and never an ID.
pub(crate) fn temp_beside(path: &Path, ext: &str) -> PathBuf {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let mut name = path.as_os_str().to_owned();
    name.push(format!(
        ".{}-{}.{ext}",
        std::process::id(),
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    PathBuf::from(name)
}

/// Writes through a `.part` file, so a crash never leaves half a file under the real name.
fn write_new(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(storage)?;
    }
    let part = temp_beside(path, "part");
    std::fs::write(&part, bytes).map_err(storage)?;
    std::fs::rename(&part, path).map_err(storage)
}

pub struct AttachmentStore {
    dir: PathBuf,
}

impl AttachmentStore {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    /// The stored file for `id`, refusing anything that is not a SHA-256 in lowercase hex.
    pub fn path(&self, id: &str) -> Result<PathBuf, AppError> {
        if !is_id(id) {
            return Err(refused("Not an attachment".to_string()));
        }
        Ok(self.dir.join(id))
    }

    fn text_path(&self, id: &str) -> Result<PathBuf, AppError> {
        Ok(self.path(id)?.with_extension("txt"))
    }

    /// Checks a file by its first bytes and size, then keeps one copy under its SHA-256.
    pub fn store(&self, name: &str, bytes: &[u8]) -> Result<Attachment, AppError> {
        let name = display_name(name);
        if bytes.is_empty() {
            return Err(refused(format!("{name} is empty")));
        }
        let Some((kind, mime)) = detect(bytes) else {
            return Err(refused(format!(
                "{name} isn't an image, a PDF or a text file"
            )));
        };
        let (max, what) = limit(kind);
        if bytes.len() > max {
            return Err(refused(format!("{name} is larger than {what}")));
        }

        let mut id = String::with_capacity(64);
        for b in Sha256::digest(bytes) {
            let _ = write!(id, "{b:02x}");
        }
        let path = self.path(&id)?;
        if path.exists() {
            // Picked again: it counts as new, so clean-up leaves it while it waits to be sent.
            let _ = std::fs::File::options()
                .write(true)
                .open(&path)
                .and_then(|f| f.set_modified(SystemTime::now()));
        } else {
            write_new(&path, bytes)?;
        }

        let secret = secret_files::is_secret(&name)
            || (kind == AttachmentKind::Text
                && std::str::from_utf8(bytes).is_ok_and(secret_files::has_private_key));
        Ok(Attachment {
            id,
            name,
            mime: mime.to_string(),
            size: u32::try_from(bytes.len()).unwrap_or(u32::MAX),
            kind,
            warning: secret.then(|| SECRET_WARNING.to_string()),
        })
    }

    pub fn save_text(&self, id: &str, text: &str) -> Result<(), AppError> {
        write_new(&self.text_path(id)?, text.as_bytes())
    }

    pub fn read(&self, id: &str) -> Result<Vec<u8>, AppError> {
        std::fs::read(self.path(id)?).map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                AppError::NotFound
            } else {
                storage(e)
            }
        })
    }

    /// The text a model gets: a text file's own, or a PDF's extracted text. None for images.
    pub fn text(&self, id: &str) -> Result<Option<String>, AppError> {
        let extracted = self.text_path(id)?;
        if extracted.exists() {
            return std::fs::read_to_string(&extracted)
                .map(Some)
                .map_err(storage);
        }
        let bytes = self.read(id)?;
        Ok(match detect(&bytes) {
            Some((AttachmentKind::Text, _)) => String::from_utf8(bytes).ok(),
            _ => None,
        })
    }

    /// Every stored attachment's ID.
    pub fn ids(&self) -> Result<Vec<String>, AppError> {
        let entries = match std::fs::read_dir(&self.dir) {
            Ok(entries) => entries,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(storage(e)),
        };
        let mut ids: Vec<String> = entries
            .filter_map(Result::ok)
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|n| is_id(n))
            .collect();
        ids.sort();
        Ok(ids)
    }

    /// Removes attachments not in `referenced` that are older than `grace`; returns how many went.
    pub fn remove_unreferenced(
        &self,
        referenced: &HashSet<String>,
        grace: Duration,
    ) -> Result<u32, AppError> {
        let now = SystemTime::now();
        let mut removed = 0;
        for id in self.ids()? {
            if referenced.contains(&id) {
                continue;
            }
            let path = self.path(&id)?;
            let age = std::fs::metadata(&path)
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| now.duration_since(t).ok())
                .unwrap_or_default();
            if age < grace {
                continue;
            }
            std::fs::remove_file(&path).map_err(storage)?;
            let _ = std::fs::remove_file(self.text_path(&id)?);
            removed += 1;
        }
        Ok(removed)
    }

    fn forget(&self, id: &str) {
        if let Ok(path) = self.path(id) {
            let _ = std::fs::remove_file(path);
        }
        if let Ok(path) = self.text_path(id) {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// Stores one file; a PDF also gets its text from `extract`, given the stored file's path.
/// A PDF whose text can't be read, or that has none, is refused and not kept.
pub async fn add_with<F, Fut>(
    store: &AttachmentStore,
    name: &str,
    bytes: &[u8],
    extract: F,
) -> Result<Attachment, AppError>
where
    F: FnOnce(PathBuf) -> Fut,
    Fut: Future<Output = Result<String, AppError>>,
{
    let attachment = store.store(name, bytes)?;
    if attachment.kind != AttachmentKind::Pdf || store.text_path(&attachment.id)?.exists() {
        return Ok(attachment);
    }
    let Ok(text) = extract(store.path(&attachment.id)?).await else {
        store.forget(&attachment.id);
        return Err(refused(format!(
            "{} couldn't be read as a PDF",
            attachment.name
        )));
    };
    if text.trim().is_empty() {
        store.forget(&attachment.id);
        return Err(refused(format!("{} has no text to read", attachment.name)));
    }
    store.save_text(&attachment.id, &text)?;
    Ok(attachment)
}

/// Stores one file, reading a PDF's text in a child process.
pub async fn add(store: &AttachmentStore, name: &str, bytes: &[u8]) -> Result<Attachment, AppError> {
    add_with(store, name, bytes, pdf::text_in_child).await
}

/// Reads a picked or dropped file, refusing folders and anything over the largest limit unread.
fn read_picked(path: &Path, name: &str) -> Result<Vec<u8>, String> {
    let meta = std::fs::metadata(path).map_err(|_| format!("{name} couldn't be opened"))?;
    if meta.is_dir() {
        return Err(format!("{name} is a folder"));
    }
    if meta.len() > MAX_PDF as u64 {
        return Err(format!("{name} is larger than 20 MB"));
    }
    std::fs::read(path).map_err(|_| format!("{name} couldn't be opened"))
}

/// Adds files the user picked or dropped. Each is checked on its own, so one refused
/// file never stops the rest.
pub async fn add_paths(store: &AttachmentStore, paths: Vec<PathBuf>) -> Attachments {
    let mut out = Attachments::default();
    for path in paths {
        let name = display_name(&path.to_string_lossy());
        let bytes = match read_picked(&path, &name) {
            Ok(bytes) => bytes,
            Err(message) => {
                out.refused.push(message);
                continue;
            }
        };
        match add(store, &name, &bytes).await {
            Ok(attachment) => out.added.push(attachment),
            Err(AppError::InvalidInput { message }) => out.refused.push(message),
            Err(_) => out.refused.push(format!("{name} couldn't be saved")),
        }
    }
    out
}

/// Removes attachments no message refers to that are older than `grace`. After a chat
/// is deleted that is `UNUSED_GRACE`, since a file may still wait in a composer; at
/// start it is everything from before the start, since no composer holds one yet.
pub fn remove_unused(
    services: &Services,
    store: &AttachmentStore,
    grace: Duration,
) -> Result<u32, AppError> {
    let ids = store.ids()?;
    if ids.is_empty() {
        return Ok(0);
    }
    let used = services.attachments_in_use(&ids)?;
    store.remove_unreferenced(&used, grace)
}

/// Removes a file taken back out of a composer, unless a saved message refers to it.
pub fn discard(services: &Services, store: &AttachmentStore, id: &str) -> Result<(), AppError> {
    store.path(id)?;
    if services.attachments_in_use(&[id.to_string()])?.is_empty() {
        store.forget(id);
    }
    Ok(())
}

pub const NO_VISION: &str = "This model can't read images";

/// An attachment as a message carries it: its ID and the name the model sees.
#[derive(Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentRef {
    pub id: String,
    pub name: String,
}

/// A message as the UI sends it: its text and its attachments.
#[derive(Deserialize, Type, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatInput {
    pub role: Role,
    pub content: String,
    #[serde(default)]
    pub attachments: Vec<AttachmentRef>,
}

/// A fenced block for one file, the fence longer than any run of backticks inside.
fn fenced(name: &str, text: &str, cut: bool) -> String {
    let mut longest = 0;
    let mut run = 0;
    for c in text.chars() {
        run = if c == '`' { run + 1 } else { 0 };
        longest = longest.max(run);
    }
    let fence = "`".repeat(longest.max(2) + 1);
    let text = text.strip_suffix('\n').unwrap_or(text);
    let note = if cut {
        "\n[cut: the rest didn't fit the model's context]"
    } else {
        ""
    };
    format!("File: {name}\n{fence}\n{text}\n{fence}{note}")
}

/// `text` cut to at most `limit` bytes on a character boundary, and whether it was cut.
fn cut_to(text: &str, limit: usize) -> (&str, bool) {
    if text.len() <= limit {
        return (text, false);
    }
    let mut end = limit;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    (&text[..end], true)
}

/// Turns the UI's messages into what a provider gets. A text file's or a PDF's text
/// joins its message's text as a fenced block, `text_limit` bytes in all for the
/// request, newest message first; each image becomes an `ImageInput` of that message.
/// `vision` is what the model is known to support: with `Some(false)` an image in the
/// newest message is refused before a request is made, and an earlier one becomes a note.
pub fn resolve(
    store: &AttachmentStore,
    inputs: Vec<ChatInput>,
    text_limit: usize,
    vision: Option<bool>,
) -> Result<(Vec<ChatMessage>, Vec<Vec<ImageInput>>), AppError> {
    let newest = inputs.len().saturating_sub(1);
    let mut budget = text_limit;
    let mut messages = Vec::with_capacity(inputs.len());
    let mut images = Vec::with_capacity(inputs.len());
    // Newest first, so the message being asked about gets the budget before older ones.
    for (i, input) in inputs.into_iter().enumerate().rev() {
        let mut blocks = Vec::new();
        let mut own_images = Vec::new();
        for att in &input.attachments {
            let bytes = match store.read(&att.id) {
                Ok(bytes) => bytes,
                Err(AppError::NotFound | AppError::InvalidInput { .. }) => {
                    blocks.push(format!("[{} is no longer stored]", att.name));
                    continue;
                }
                Err(e) => return Err(e),
            };
            let text = match detect(&bytes) {
                Some((AttachmentKind::Image, mime)) => {
                    if vision == Some(false) {
                        if i == newest {
                            return Err(refused(NO_VISION.to_string()));
                        }
                        // Sent to another model earlier: the chat goes on without it.
                        blocks.push(format!("[{} not sent: this model can't read images]", att.name));
                        continue;
                    }
                    own_images.push(ImageInput {
                        mime: mime.to_string(),
                        data_base64: BASE64.encode(&bytes),
                    });
                    continue;
                }
                Some((AttachmentKind::Text, _)) => String::from_utf8_lossy(&bytes).into_owned(),
                Some((AttachmentKind::Pdf, _)) => store.text(&att.id)?.unwrap_or_default(),
                None => continue,
            };
            let (text, cut) = cut_to(&text, budget);
            budget = budget.saturating_sub(text.len());
            blocks.push(fenced(&att.name, text, cut));
        }
        let content = std::iter::once(input.content)
            .filter(|c| !c.is_empty())
            .chain(blocks)
            .collect::<Vec<_>>()
            .join("\n\n");
        messages.push(ChatMessage {
            role: input.role,
            content,
        });
        images.push(own_images);
    }
    messages.reverse();
    images.reverse();
    Ok((messages, images))
}

/// The messages and images for one request to a model: its context window sets the
/// text budget, and its known image support is checked.
pub fn prepare(
    services: &Services,
    store: &AttachmentStore,
    connection_id: u32,
    model_id: &str,
    inputs: Vec<ChatInput>,
) -> Result<(Vec<ChatMessage>, Vec<Vec<ImageInput>>), AppError> {
    let limit = crate::tools::text_budget(services.context_tokens(connection_id, model_id));
    let vision = services.supports_vision(connection_id, model_id);
    resolve(store, inputs, limit, vision)
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn temp_store() -> AttachmentStore {
        static SEQ: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "aidp-attach-{}-{}",
            std::process::id(),
            SEQ.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = std::fs::remove_dir_all(&dir);
        AttachmentStore::new(dir)
    }

    fn message(e: AppError) -> String {
        match e {
            AppError::InvalidInput { message } => message,
            other => panic!("expected InvalidInput, got {other:?}"),
        }
    }

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n and the rest";

    #[test]
    fn kind_comes_from_first_bytes() {
        assert_eq!(detect(PNG), Some((AttachmentKind::Image, "image/png")));
        assert_eq!(
            detect(&[0xFF, 0xD8, 0xFF, 0xE0]),
            Some((AttachmentKind::Image, "image/jpeg"))
        );
        assert_eq!(detect(b"GIF89a..."), Some((AttachmentKind::Image, "image/gif")));
        assert_eq!(
            detect(b"RIFF\0\0\0\0WEBPVP8 "),
            Some((AttachmentKind::Image, "image/webp"))
        );
        assert_eq!(
            detect(b"%PDF-1.7\n"),
            Some((AttachmentKind::Pdf, "application/pdf"))
        );
        assert_eq!(
            detect("fn main() {}\n".as_bytes()),
            Some((AttachmentKind::Text, "text/plain"))
        );
        assert_eq!(detect(b"\x00\x01\x02binary"), None);
        assert_eq!(detect(&[0xC3, 0x28]), None);

        // The name is never trusted: a text file called .png is text.
        let store = temp_store();
        let a = store.store("photo.png", b"not really an image").unwrap();
        assert_eq!(a.kind, AttachmentKind::Text);
        assert_eq!(a.mime, "text/plain");
    }

    #[test]
    fn limits_are_enforced() {
        let store = temp_store();
        let mut big_png = PNG.to_vec();
        big_png.resize(MAX_IMAGE + 1, 0);
        assert!(message(store.store("big.png", &big_png).unwrap_err()).contains("big.png"));
        let big_text = vec![b'a'; MAX_TEXT + 1];
        assert!(message(store.store("big.txt", &big_text).unwrap_err()).contains("big.txt"));
        let mut big_pdf = b"%PDF-1.7\n".to_vec();
        big_pdf.resize(MAX_PDF + 1, b' ');
        assert!(message(store.store("big.pdf", &big_pdf).unwrap_err()).contains("big.pdf"));
        assert!(message(store.store("empty.txt", b"").unwrap_err()).contains("empty.txt"));
        assert!(message(store.store("blob.bin", b"\x00\x01").unwrap_err()).contains("blob.bin"));
        assert!(store.ids().unwrap().is_empty());
    }

    #[test]
    fn the_largest_image_fits_anthropics_limit_once_in_base64() {
        // Anthropic counts its 5 MB on the base64 text, a third larger than the bytes.
        assert!(BASE64.encode(vec![0u8; MAX_IMAGE]).len() <= 5 * MB);
    }

    #[test]
    fn temporary_names_never_repeat_and_are_never_ids() {
        let store = temp_store();
        let path = store.path(&"a".repeat(64)).unwrap();
        let (one, two) = (temp_beside(&path, "out"), temp_beside(&path, "out"));
        assert_ne!(one, two);
        assert_eq!(one.parent(), path.parent());
        for name in [&one, &two] {
            assert!(!is_id(&name.file_name().unwrap().to_string_lossy()));
        }
    }

    #[test]
    fn same_bytes_same_id() {
        let store = temp_store();
        let a = store.store("a.txt", b"hello").unwrap();
        let b = store.store("b.txt", b"hello").unwrap();
        assert_eq!(a.id, b.id);
        assert_eq!(a.id.len(), 64);
        assert_eq!((a.name.as_str(), a.size), ("a.txt", 5));
        assert_eq!(store.read(&a.id).unwrap(), b"hello");
        assert_eq!(store.ids().unwrap(), vec![a.id]);
    }

    #[test]
    fn an_id_that_is_not_hex_is_refused() {
        let store = temp_store();
        store.store("a.txt", b"hello").unwrap();
        for id in [
            "../x".to_string(),
            "abc".to_string(),
            "A".repeat(64),
            format!("{}/", "a".repeat(63)),
        ] {
            assert!(store.read(&id).is_err(), "{id}");
            assert!(store.text(&id).is_err(), "{id}");
        }
    }

    #[test]
    fn text_comes_from_text_files_and_pdfs_only() {
        let store = temp_store();
        let text = store.store("notes.md", "# Notes\n".as_bytes()).unwrap();
        let image = store.store("p.png", PNG).unwrap();
        assert_eq!(store.text(&text.id).unwrap().as_deref(), Some("# Notes\n"));
        assert_eq!(store.text(&image.id).unwrap(), None);
    }

    #[test]
    fn secret_looking_files_get_a_warning() {
        let store = temp_store();
        for name in [".env", "id_rsa", "server.pem"] {
            let a = store.store(name, name.as_bytes()).unwrap();
            assert!(a.warning.is_some(), "{name}");
        }
        assert!(store.store("notes.md", b"plain").unwrap().warning.is_none());
        let key = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----\n";
        assert!(store.store("key.txt", key.as_bytes()).unwrap().warning.is_some());
    }

    #[test]
    fn clean_up_keeps_referenced_and_recent_files() {
        let store = temp_store();
        let kept = store.store("a.txt", b"kept").unwrap();
        let gone = store.store("b.txt", b"gone").unwrap();
        let referenced = HashSet::from([kept.id.clone()]);

        // A file picked a moment ago may still be waiting in the composer.
        let hour = Duration::from_secs(3600);
        assert_eq!(store.remove_unreferenced(&referenced, hour).unwrap(), 0);

        assert_eq!(store.remove_unreferenced(&referenced, Duration::ZERO).unwrap(), 1);
        assert!(store.read(&kept.id).is_ok());
        assert!(matches!(store.read(&gone.id), Err(AppError::NotFound)));
    }

    #[tokio::test]
    async fn a_pdf_keeps_its_text() {
        let store = temp_store();
        let a = add_with(&store, "doc.pdf", b"%PDF-1.7 body", |_path| async {
            Ok::<_, AppError>("Hello PDF".to_string())
        })
        .await
        .unwrap();
        assert_eq!(a.kind, AttachmentKind::Pdf);
        assert_eq!(store.text(&a.id).unwrap().as_deref(), Some("Hello PDF"));
    }

    #[tokio::test]
    async fn a_pdf_without_text_is_refused_and_not_kept() {
        let store = temp_store();
        let err = add_with(&store, "scan.pdf", b"%PDF-1.7 body", |_path| async {
            Ok::<_, AppError>(" \n ".to_string())
        })
        .await
        .unwrap_err();
        assert!(message(err).contains("scan.pdf has no text to read"));
        assert!(store.ids().unwrap().is_empty());
    }

    #[tokio::test]
    async fn a_pdf_that_cannot_be_read_is_not_kept() {
        let store = temp_store();
        let err = add_with(&store, "bad.pdf", b"%PDF-1.7 body", |_path| async {
            Err::<String, _>(AppError::InvalidInput {
                message: "x".into(),
            })
        })
        .await
        .unwrap_err();
        assert!(message(err).contains("bad.pdf"));
        assert!(store.ids().unwrap().is_empty());
    }

    fn input(content: &str, attachments: Vec<AttachmentRef>) -> ChatInput {
        ChatInput {
            role: Role::User,
            content: content.to_string(),
            attachments,
        }
    }

    fn reference(a: &Attachment) -> AttachmentRef {
        AttachmentRef {
            id: a.id.clone(),
            name: a.name.clone(),
        }
    }

    #[test]
    fn text_files_join_their_message_and_images_go_with_it() {
        let store = temp_store();
        let notes = store.store("notes.md", b"# Notes\nline").unwrap();
        let png = store.store("p.png", PNG).unwrap();
        let (messages, images) = resolve(
            &store,
            vec![
                input("first", vec![]),
                input("look", vec![reference(&notes), reference(&png)]),
            ],
            10_000,
            None,
        )
        .unwrap();
        assert_eq!(messages[0].content, "first");
        assert_eq!(
            messages[1].content,
            "look\n\nFile: notes.md\n```\n# Notes\nline\n```"
        );
        assert!(images[0].is_empty());
        assert_eq!(
            images[1],
            vec![ImageInput {
                mime: "image/png".to_string(),
                data_base64: BASE64.encode(PNG),
            }]
        );
    }

    #[test]
    fn a_fence_is_longer_than_any_backticks_inside() {
        let store = temp_store();
        let md = store.store("x.md", b"```rust\nfn a() {}\n```").unwrap();
        let (messages, _) =
            resolve(&store, vec![input("", vec![reference(&md)])], 10_000, None).unwrap();
        assert_eq!(
            messages[0].content,
            "File: x.md\n````\n```rust\nfn a() {}\n```\n````"
        );
    }

    #[test]
    fn attached_text_is_cut_to_the_budget() {
        let store = temp_store();
        let long = store.store("long.txt", "a".repeat(5000).as_bytes()).unwrap();
        let (messages, _) =
            resolve(&store, vec![input("q", vec![reference(&long)])], 1000, None).unwrap();
        assert!(messages[0].content.len() < 1200, "{}", messages[0].content.len());
        assert!(messages[0].content.contains("[cut:"));
    }

    #[test]
    fn an_image_for_a_model_that_cannot_see_is_refused() {
        let store = temp_store();
        let png = store.store("p.png", PNG).unwrap();
        let err = resolve(
            &store,
            vec![input("look", vec![reference(&png)])],
            10_000,
            Some(false),
        )
        .unwrap_err();
        assert_eq!(message(err), "This model can't read images");
        // Unknown means the provider decides.
        assert!(resolve(&store, vec![input("look", vec![reference(&png)])], 10_000, None).is_ok());
    }

    #[test]
    fn an_earlier_image_for_a_model_that_cannot_see_becomes_a_note() {
        let store = temp_store();
        let png = store.store("p.png", PNG).unwrap();
        // Switching a chat that already holds an image to such a model must not block it.
        let (messages, images) = resolve(
            &store,
            vec![
                input("look", vec![reference(&png)]),
                input("and now?", vec![]),
            ],
            10_000,
            Some(false),
        )
        .unwrap();
        assert!(images.iter().all(Vec::is_empty));
        assert!(messages[0].content.contains("[p.png not sent: this model can't read images]"));
        assert_eq!(messages[1].content, "and now?");
    }

    #[test]
    fn one_text_budget_for_the_whole_request_newest_first() {
        let store = temp_store();
        let old = store.store("old.txt", "o".repeat(800).as_bytes()).unwrap();
        let new = store.store("new.txt", "n".repeat(800).as_bytes()).unwrap();
        let (messages, _) = resolve(
            &store,
            vec![
                input("first", vec![reference(&old)]),
                input("second", vec![reference(&new)]),
            ],
            1000,
            None,
        )
        .unwrap();
        // The newest message keeps its file whole; the older one gets what is left.
        assert!(messages[1].content.contains(&"n".repeat(800)));
        assert!(!messages[1].content.contains("[cut:"));
        assert!(messages[0].content.contains("[cut:"));
        assert!(!messages[0].content.contains(&"o".repeat(201)));
    }

    #[test]
    fn a_missing_attachment_is_noted_not_fatal() {
        let store = temp_store();
        let gone = AttachmentRef {
            id: "c".repeat(64),
            name: "old.txt".to_string(),
        };
        let (messages, images) =
            resolve(&store, vec![input("q", vec![gone])], 10_000, None).unwrap();
        assert!(messages[0].content.contains("old.txt is no longer stored"));
        assert!(images[0].is_empty());
    }

    #[tokio::test]
    async fn dropped_paths_report_what_was_refused() {
        let store = temp_store();
        let dir = std::env::temp_dir().join(format!("aidp-attach-src-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let ok = dir.join("ok.txt");
        std::fs::write(&ok, b"fine").unwrap();
        let bin = dir.join("tool.bin");
        std::fs::write(&bin, b"\x00\x01").unwrap();

        let got = add_paths(&store, vec![ok, bin, dir.clone(), dir.join("missing.txt")]).await;
        assert_eq!(got.added.len(), 1);
        assert_eq!(got.added[0].name, "ok.txt");
        assert_eq!(got.refused.len(), 3, "{:?}", got.refused);
        assert!(got.refused.iter().any(|r| r.contains("tool.bin")));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
