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

- **Strict Content Security Policy (CSP):** The app shell strictly defines allowable sources. Inline scripts outside the bundled frontend are forbidden.
- **Minimal Tauri Capabilities:** Tauri core capabilities are locked down. File system (`fs`) and OS process execution (`shell`) plugins are turned off in the frontend. The UI cannot initiate arbitrary network requests (`fetch`/XHR) or read local files directly.
- **Navigation Guard:** Tauri's `on_navigation` hook intercepts every navigation event. Any attempt to navigate the main WebView window away from the local app origin (`http://localhost` or `tauri://localhost`) is cancelled immediately.
- **Safe Markdown Rendering:** AI responses are rendered using `react-markdown` with `skipHtml={true}`. Raw HTML tags in model replies (such as `<script>` or `<img onerror=...>`) are stripped out, preventing cross-site scripting (XSS) attacks from untrusted model outputs.

---

## 7. Threat Model & Boundaries

**What this protects against:**
- **Disk theft & backup leakage:** Stolen project files, SQLite database backups, or source code repositories do not expose your API keys.
- **Accidental exposure:** Screen sharing, UI rendering, frontend crash dumps, and application logs never show full keys.
- **Malicious model output:** Prompt injection or rogue model output cannot execute scripts within the desktop app window or hijack navigation.

**Known honest limit:**
- **Same-user access:** On Windows, entries stored in Windows Credential Manager under the current user account are accessible to any executable running under that same user session without elevated privileges. The OS keychain protects against offline disk theft, unauthorized users, and repository leakage, but does **not** protect against active malware running with your user permissions on your own machine.

