# Decision Record 0019: Attachments (images, text files, PDFs)

**Date:** 2026-11-01
**Status:** Accepted (the human approved the attachments plan, A1 to A8, on 2026-11-01)

---

## Context

Chat and the workspace side chat took text only. The human asked to attach images and files, chose images, text files and PDFs, and chose to ship them in `0.1.0-rc.3`, before 0.1.0. The design doc had planned images for later; this decision brings attachments into v0.1. AGENTS.md keeps every file read in Rust, so the UI may not read a file or send a path.

## Options considered

How to read a PDF:

1. **Its text, extracted in Rust with `pdf-extract` (chosen).** Works with every provider, local models included. A scan without a text layer gives nothing and is refused.
2. **Each provider's own PDF input** (Anthropic `document` blocks, OpenAI `file` parts). These understand layout and pictures, but only some cloud providers accept them, and local models get nothing.
3. **pdfium** (`pdfium-render`). Best text and could render pages, but it needs a native library shipped for each OS.

Where to run the parser:

1. **In the app.** Simplest, but `pdf-extract` and `lopdf` have dozens of `unwrap`, `expect` and `panic!` paths, and the release build uses `panic = "abort"`, so one malformed PDF would close the app. A parser that loops forever would also hold a thread forever.
2. **In a child process (chosen):** the app starts its own executable as `aidp --pdf-text <pdf> <out>`. A panic or a hang ends only the child, which is killed after 20 seconds. The child writes the text to a file, because `pdf-extract` can print to standard output.

## Decision

- Rust checks each file by its first bytes, not its name: PNG, JPEG, GIF and WebP up to 3.75 MB, UTF-8 text without NUL bytes up to 512 KB, and PDFs up to 20 MB. A PDF's text is kept up to 2 MB. Images were 5 MB until rc.6: they travel as base64, a third larger, and Anthropic refuses more than 5 MB of base64.
- Files are stored once under their SHA-256 in `<app data>/attachments/`, named by the hash alone. A PDF's text is kept beside it in `<hash>.txt`. IDs are checked to be 64 lowercase hex characters before any path is built.
- Files come only from places Rust controls:
  - the file dialog, opened by Rust;
  - files dropped on the window, read in Rust's window-event handler;
  - pasted data, which the UI sends as base64 bytes, never as a path.
- Bytes cross IPC as base64 strings, because Tauri would send a `Vec<u8>` as a JSON array of numbers.
- A file whose name or contents look secret (AGENTS.md rule 6) is allowed, since the user added it by hand, but it carries the warning "Looks like a secret file".
- Sending: the UI sends each message's text with its attachments' IDs and names (`ChatInput`). Rust (`attachments::resolve`) handles them:
  - A text file's or a PDF's text joins the message as a fenced block headed `File: <name>`. The fence is longer than any run of backticks inside. The model's text budget (`tools::text_budget`) caps the attached text of the whole request, newest message first.
  - Images go in each provider's own shape:
    - OpenAI-compatible: `image_url` parts with a data URL.
    - Anthropic: `image` blocks before the text.
    - Ollama: the message's `images`.
  - A message without images is sent exactly as before.
  - An attachment no longer stored is named in the text, not sent.
- Vision: migration 6 adds `models.supports_vision`, filled from Ollama's `/api/show` capabilities ("vision"); an Ollama that reports no capabilities leaves it unknown. A model known not to see refuses an image in the new message with "This model can't read images" before any request; an image in an earlier message becomes the note `[<name> not sent: this model can't read images]`, so the chat can go on. For an unknown model the provider decides.
- Stored files no message mentions are removed: when a file is taken back out of a composer or dropped where no chat takes it, unless another composer holds it; after a chat is deleted, once more than an hour old (a file picked but not yet sent stays); and at start, every such file from before the start.
- New crates:
  - `pdf-extract` 0.12 (MIT). It brings `lopdf` 0.42, also used as a dev-dependency to build test PDFs.
  - `sha2` 0.10 and `base64` 0.22. Both were already in the dependency tree.

## Consequences

- Scanned PDFs are refused with "<name> has no text to read".
- Pictures inside PDFs aren't seen.
- Reading a PDF starts a short-lived process (about 0.7 s for a one-page PDF in a debug build).
- The app's executable has a second, hidden mode, `--pdf-text`, which only reads one file and writes one file.
- `pdf-extract` adds 26 crates to the build, among them `nom`, `ttf-parser`, `aes` and `md-5` (for encrypted PDFs) and `weezl` (LZW). They are compiled into the app but run only in the child.
