# Security Architecture & Key Handling

This document explains how A.I.D.P protects API keys, controls network communications, and isolates model interactions.

---

## 1. Where API Keys Live

API keys are stored exclusively in the operating system's native secure credential store via the `keyring` crate (version 4):

- **Windows:** Windows Credential Manager (Generic Credentials, target `com.aidp.desktop/connection-{id}`)
- **macOS:** Apple Keychain Services
- **Linux:** Secret Service API (GNOME Keyring or KWallet)

Keys **never** reside in plain text files, environment files, or application configuration files. If the operating system keychain is unavailable (for example, on a headless or unconfigured Linux desktop without a Secret Service daemon), the app returns an explicit error and refuses to save the connection. There is no plain-text fallback.

---

## 2. The Path of an API Key

```
User Input (UI Dialog)
       │
       ▼ (Tauri IPC `add_connection`)
  Rust Core (`NewConnection` with `SecretString`)
       │
       ├─► Test connection with provider (HTTPS `list_models`)
       │
       ├─► Write credentials to OS Keychain (`keyring`)
       │
       └─► Save metadata to SQLite (`aidp.db` with 4-char `key_hint` only)
```

1. **One-way ingress:** The user enters their API key in the UI password field (`type="password"`, `spellCheck={false}`, `autoComplete="off"`).
2. **Immediate redaction:** Upon reaching the Rust backend via Tauri IPC, the key is converted into a `SecretString` from the `secrecy` crate. The plain-text key cannot be serialized or derived in standard `Debug` prints (it displays as `[REDACTED]`).
3. **Verified before saving:** The key is tested against the provider's models endpoint over HTTPS. Only if the provider validates the key does the app save it.
4. **No egress:** No Tauri command or IPC call ever returns an API key to the frontend. The UI only ever receives a `ConnectionView` containing `key_hint` (the last 4 characters, or empty if the key is under 12 characters).

---

## 3. What the Local Database Holds

The local SQLite database (`aidp.db`) stores configuration and metadata across two tables (`connections` and `models`):

- Connection label, provider kind (`openaiCompat` or `anthropic`), base URL, timestamps, and test status.
- `key_hint`: The last 4 characters of the key (used solely to help the user identify which key is connected in the UI).
- Model identifiers, display names, and context window limits.

The database file contains **no secret keys**. Even if the database file is extracted or inspected, the API keys cannot be recovered from it.

---

## 4. Logging & Diagnostics

- API keys and authorization headers are never logged.
- The `reqwest` HTTP client explicitly marks the authorization header (`Authorization: Bearer ...` or `x-api-key: ...`) as sensitive (`set_sensitive(true)`), preventing it from leaking into HTTP debug traces.
- Error messages returned from providers are sanitized and mapped into normalized error categories (`InvalidKey`, `RateLimited`, `ModelNotFound`, `ContextTooLong`, `Offline`, `Provider`, `Cancelled`).

---

## 5. Network & Transport Rules

- **HTTPS required for cloud endpoints:** All cloud providers must use `https://`.
- **Local HTTP exception:** Plain `http://` is allowed only for `localhost`, loopback addresses (`127.0.0.1`, `::1`), and private LAN IP ranges (e.g., `192.168.x.x`, `10.x.x.x`, `172.16-31.x.x`) to support local inference engines like Ollama or LM Studio. Any public unencrypted URL is rejected upfront with `AppError::InsecureUrl` before any network request is initiated.

---

## 6. App Lockdown: CSP, Capabilities, and Navigation Guard

- **Strict Content Security Policy (CSP):** The app shell strictly defines allowable sources. Inline scripts outside the bundled frontend are forbidden. Inline styles are allowed (decision 0009) because the code editor creates its styles at runtime.
- **Minimal Tauri Capabilities:** Tauri core capabilities are locked down. File system (`fs`) and OS process execution (`shell`) plugins are turned off in the frontend. The UI cannot initiate arbitrary network requests (`fetch`/XHR) or read local files directly.
- **Navigation Guard:** Tauri's `on_navigation` hook intercepts every navigation event. Any attempt to navigate the main WebView window away from the local app origin (`http://localhost` or `tauri://localhost`) is cancelled immediately.
- **Safe Markdown Rendering:** AI responses are rendered using `react-markdown` with `skipHtml={true}`. Raw HTML tags in model replies (such as `<script>` or `<img onerror=...>`) are stripped out, preventing cross-site scripting (XSS) attacks from untrusted model outputs.

---

## 7. Workspace & File Security

Milestone 3 introduces the coding workspace, allowing the desktop application to open local project directories, navigate files, and preview AI proposals. The security architecture enforces strict boundaries:

### Path Confinement & `resolve`
Every file read, file write, and directory listing operation is governed by `workspace::paths::resolve`:
- **Relative paths only:** Absolute paths (e.g. `/etc/passwd`, `C:\Windows`), drive-prefixed paths and `..` are rejected upfront with `WorkspaceError::OutsideFolder`.
- **Colon rejection:** Colons (`:`) in any path component are strictly forbidden to prevent Windows alternate data stream exploits or drive specifiers.
- **Component-by-component construction:** Paths are broken into normalized components (`Normal`) and pushed onto the canonical root directory.
- **Canonicalization & Boundary Check:** The resolved path is canonicalized following symlinks and junctions, then verified with `resolved.starts_with(&canonical_root)`. If a symlink or junction leads outside the opened workspace folder, the request is rejected with `WorkspaceError::OutsideFolder`.
- **Tested boundary conditions:** 21 automated integration tests in `tests/workspace.rs` prove that `..`, absolute paths, Windows drive letters, directory junctions pointing outside the workspace, and symlinks escaping the folder are rejected.
- **The `.git` folder is off limits** (decision 0012): a path with a `.git` component is refused, compared as Windows names it (any case, trailing dots and spaces dropped, so `.git.` counts), and so is a path whose canonical form lands in `.git` through a link. `.git/config` can hold a token in a remote URL, and a file written to `.git/hooks` runs on the user's next git command. The agent gets "tools cannot use the .git folder" and can ask to run a git command instead.

### Secret File Shielding
Files that look like secrets are protected; the full list is security rule 6 in `AGENTS.md` (decisions 0010 and 0012). Files whose content holds a PEM, PGP or PuTTY private key are treated the same way.
- **Detection:** `workspace::secret_files::is_secret` identifies sensitive file names and extensions. `read_file` checks both the requested name and the name of the file a link points to. Names are only a convention: a hard link can give a secret file any name, so this keeps accidental sends out rather than stopping a deliberate one.
- **Marked on read:** `read_file` returns `is_secret: true`.
- **AI Context Exclusion:** Secret files are automatically excluded from AI context chips (`chipsFor` initializes with `enabled: false, reason: "secret"`). They cannot be sent to cloud models unless the user explicitly and intentionally clicks `+ Add {filename}` in the UI.

### Native Dialog Security
Folder selection uses `tauri-plugin-dialog` v2:
- **Rust-only invocation:** The dialog plugin is registered in Rust with zero permissions granted in `src-tauri/capabilities/default.json`. The web frontend cannot invoke dialog APIs directly.
- **Recent folder validation:** `open_recent` verifies that any requested path matches an entry in the SQLite `settings` table before opening, preventing arbitrary path opening via forged IPC calls.

### Release CSP and the editor
- The release CSP is `default-src 'self' ipc: http://ipc.localhost; style-src 'self' 'unsafe-inline'` (decision 0009). Scripts are still limited to the app's own files: `script-src` falls back to `default-src 'self'`.
- Why inline styles are allowed: CodeMirror creates a `<style>` element at runtime. Under the earlier policy (no inline styles) the M3 live check showed the release editor without its layout (2026-10-30). Dev already allowed inline styles, which is why only the release build was affected.
- Keep `index.html` free of `<style>` tags: if one appears, Tauri adds a nonce to `style-src`, browsers then ignore `'unsafe-inline'`, and the editor breaks again.

---

## 8. Agent Tools & Terminal Security

Milestone 4 introduces autonomous agent tool execution (`list_files`, `read_file`, `search`, `edit_file`, `create_file`, `run_command`) and an integrated terminal panel. The design enforces defense-in-depth across the boundary:

### Approval Decided in Rust
- **Name-based authorization:** Approval requirements are decided strictly by the tool's name in the Rust core (`tools::approvals`), never by the model, the UI, or a tool's output.
- **No auto-approve path:** There is no auto-approve bypass in v1. Edits, file creations, and system commands must wait for explicit user approval via `answer_tool`.
- **Atomic approval registration:** Every pending approval is registered in the core `Approvals` table before its `ChatEvent::ToolCall` event is emitted. Every call gets exactly one result.
- **Untrusted model content:** Tool outputs and file contents returned to the model are treated as data, not instructions. Prompt injections inside repository files (e.g. `del notes.txt`) cannot skip an approval gate.

### Expanded Secret File Shielding
- **Strict filter across all tools:** The secret file filter (decisions 0010 and 0012) governs `list_files`, `read_file`, `search`, and `edit_file`. `create_file` may create secret-looking names (the user sees the content; nothing is read).
- **Shielded credential names:** the names in security rule 6 (`AGENTS.md`) are excluded from directory listings and searches, and refused on direct read.
- **Content inspection:** Files containing a PEM (`-----BEGIN ... PRIVATE KEY-----`), PGP (`... PRIVATE KEY BLOCK-----`) or PuTTY private key are blocked from model access on read and search.
- **No `.git`:** every tool refuses paths inside `.git`, including through links (see "The `.git` folder is off limits" above).

### Command Runner Boundaries
- **Folder containment:** Model commands execute with the workspace root as their current working directory (`cwd`).
- **Standard shell invocation:** Commands run via `cmd.exe /D /S /C "<command>"` on Windows (decision 0011) and `sh -c` on Unix, with no standard input (`Stdio::null()`).
- **What you see is what runs:** a command is refused before any approval card appears if it contains a control character (tab, line feed and CRLF are allowed; a lone carriage return is not), any default-ignorable code point (bidi controls, zero-width characters, variation selectors, tag characters, Hangul fillers and the rest of Unicode's list), a line or paragraph separator, or a private-use character. Such characters could make the card read differently from what the shell runs. Unassigned code points are allowed, because they render as visible boxes. A character some programs would receive as a different ASCII character is refused too: the full-width forms (U+FF01 to U+FF5E, such as `＂`) on every OS, and on Windows every character the system's ANSI code page does not hold exactly. A program that reads its command line through the ANSI API gets such a character by "best fit" (`∕` as `/`, an en space as a space: the "WorstFit" attacks) or as the wildcard `?`. On a two-byte code page (Japanese, Chinese, Korean), a character whose second byte is an ASCII value is refused as well: `表` is `0x95 0x5C` in code page 932, and a program unaware of two-byte characters reads the `0x5C` as `\`. What the code page holds stays allowed (on code page 1252: accented Western letters, curly quotes, dashes, `€`); a command needing other characters can be typed in the terminal. On a system whose ANSI code page is UTF-8 there is no such conversion and nothing extra is refused.
- **Hard execution timeout:** A mandatory 120-second timeout halts runaway commands.
- **Process tree termination:** Stopping or timing out a command kills the entire process tree (`taskkill /F /T /PID` on Windows, `kill -9 -<pgid>` on Unix). On Windows the command also runs in a job object that ends every process it started, including one whose parent already exited, when the command stops, times out or finishes. A process started in the moment before the shell joins the job can escape it. On Unix, a background process whose output is redirected can outlive a command that finishes normally.
- **Output tail truncation:** Process output is captured safely and capped at the last 20,000 characters to prevent memory exhaustion or token overflow.

### Integrated Terminal Isolation
- **User's native shell:** The terminal runs the user's interactive shell (`powershell.exe -NoLogo` on Windows, `$SHELL` on Unix, as a login shell on macOS; decision 0011) in the workspace folder.
- **PATH from the login shell:** on macOS and Linux, when the app is opened from Finder or a desktop menu (not from a terminal), it asks `$SHELL -ilc` for its environment once at start (5-second limit) and takes `PATH` from it, so model commands, the terminal and the Ollama lookup find the same programs as the user's own terminal. This runs the user's own shell startup files, as opening their terminal does; on any failure the app keeps the PATH it was given.
- **Lifecycle tied to workspace:** The terminal session is terminated and cleaned up immediately when the user closes or switches the workspace folder.
- **Zero capability expansion:** The terminal requires no new Tauri capability permissions. The xterm CSS is bundled locally and complies with the release CSP.

---

## 10. Local Runtime (Ollama) & Chat History Security

Milestone 5 introduces local model support via Ollama and persistent chat history:

### Ollama Localhost Boundary
- **Fixed endpoint:** Ollama communications use fixed loopback addresses (`http://127.0.0.1:11434`), allowed by network transport rules without external network exposure.
- **No credentials stored or transmitted:** Ollama requires no API keys; keychain storage is bypassed.
- **Binary discovery & execution:** When launching `ollama serve`, the app checks explicit system directories (`%LOCALAPPDATA%\Programs\Ollama\`, `/usr/local/bin/`, etc.) and `PATH`. Relative entries on `PATH` (`.` or relative paths) are ignored to prevent local binary hijacking. Processes spawn with `CREATE_NO_WINDOW` on Windows.
- **Model name validation:** All model names passed to pull, delete, or unload commands are verified with `valid_model_name`: alphanumeric, `:`, `.`, `-`, `_`, `/` only, 1 to 128 characters.
- **Fixed download URL:** The "Get Ollama" button opens only `https://ollama.com/download` in the system default browser.

### Chat History Storage
- **Unencrypted SQLite database:** Conversations and messages are stored in `aidp.db` inside the user's OS application data directory (`%APPDATA%\com.aidp.desktop\aidp.db` on Windows).
- **Sensitive data awareness:** Chat history stores user questions, attached files, and assistant replies unencrypted. While secret files are blocked from automated attachments, any file content or code explicitly sent by the user is persisted locally in `aidp.db`.


**What this protects against:**
- **Disk theft & backup leakage:** Stolen project files, SQLite database backups, or source code repositories do not expose your API keys.
- **Accidental exposure:** Screen sharing, UI rendering, frontend crash dumps, and application logs never show full keys.
- **Malicious model output:** Prompt injection or rogue model output cannot execute scripts within the desktop app window or hijack navigation.

**Known honest limit:**
- **Same-user access:** On Windows, entries stored in Windows Credential Manager under the current user account are accessible to any executable running under that same user session without elevated privileges. The OS keychain protects against offline disk theft, unauthorized users, and repository leakage, but does **not** protect against active malware running with your user permissions on your own machine.

