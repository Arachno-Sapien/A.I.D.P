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

### Secret File Shielding
Files containing sensitive credentials (`.env*`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`) are automatically protected:
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
- **Strict filter across all tools:** The secret file filter (decision 0010) governs `list_files`, `read_file`, `search`, and `edit_file`.
- **Shielded credential names:** `.env*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `*.tfvars`, `id_rsa*`, `id_ed25519*`, `id_ecdsa*`, `id_dsa*`, `.npmrc`, `.pypirc`, `.netrc`, `_netrc`, and `.git-credentials` are excluded from directory listings and searches, and refused on direct read.
- **Content inspection:** Files containing PEM private key blocks (`-----BEGIN ... PRIVATE KEY-----`) are blocked from model access on read and search.

### Command Runner Boundaries
- **Folder containment:** Model commands execute with the workspace root as their current working directory (`cwd`).
- **Standard shell invocation:** Commands run via `cmd.exe /D /S /C "<command>"` on Windows (decision 0011) and `sh -c` on Unix, with no standard input (`Stdio::null()`).
- **Hard execution timeout:** A mandatory 120-second timeout halts runaway commands.
- **Process tree termination:** Stopping or timing out a command kills the entire process tree (`taskkill /F /T /PID` on Windows, `kill -9 -<pgid>` on Unix), preventing orphan processes from lingering in the background.
- **Output tail truncation:** Process output is captured safely and capped at the last 20,000 characters to prevent memory exhaustion or token overflow.

### Integrated Terminal Isolation
- **User's native shell:** The terminal runs the user's interactive shell (`powershell.exe -NoLogo` on Windows, `$SHELL` on Unix; decision 0011) in the workspace folder.
- **Lifecycle tied to workspace:** The terminal session is terminated and cleaned up immediately when the user closes or switches the workspace folder.
- **Zero capability expansion:** The terminal requires no new Tauri capability permissions. The xterm CSS is bundled locally and complies with the release CSP.

---

## 9. Threat Model & Boundaries

**What this protects against:**
- **Disk theft & backup leakage:** Stolen project files, SQLite database backups, or source code repositories do not expose your API keys.
- **Accidental exposure:** Screen sharing, UI rendering, frontend crash dumps, and application logs never show full keys.
- **Malicious model output:** Prompt injection or rogue model output cannot execute scripts within the desktop app window or hijack navigation.

**Known honest limit:**
- **Same-user access:** On Windows, entries stored in Windows Credential Manager under the current user account are accessible to any executable running under that same user session without elevated privileges. The OS keychain protects against offline disk theft, unauthorized users, and repository leakage, but does **not** protect against active malware running with your user permissions on your own machine.

