# A.I.D.P User Guide

A complete guide to using **A.I.D.P** on your computer: connecting cloud models, running local Ollama models, chatting, and working on code in the AI coding workspace.

---

## 1. Quick Start

### Install

Download the installer for your system from the [latest release](https://github.com/Arachno-Sapien/A.I.D.P/releases/latest). The installers aren't code-signed yet (decision 0017), so Windows and macOS warn the first time you open the app; the steps below get past that once.

**Windows 10 or 11**
1. Download `A.I.D.P_<version>_x64-setup.exe` and open it.
2. If **Windows protected your PC** appears, click **More info**, then **Run anyway**.
3. The installer puts A.I.D.P in your own user account, with no admin prompt, and adds it to the Start menu. If WebView2 is missing (rare, and only on Windows 10), the installer downloads it.

**macOS (Apple silicon or Intel)**
1. Download `A.I.D.P_<version>_universal.dmg`, open it, and drag **A.I.D.P** into **Applications**.
2. Open A.I.D.P. macOS says it can't check the app for malicious software; close that message.
3. Open **System Settings → Privacy & Security**, scroll down to the message about A.I.D.P, click **Open Anyway**, and confirm with your password. You only do this once.
4. If macOS says instead that the app "is damaged", run `xattr -dr com.apple.quarantine /Applications/A.I.D.P.app` in Terminal and open it again.

The macOS build hasn't been tested on a real Mac yet. If something doesn't work, please open an issue on GitHub.

**Linux (x86-64)**
- **Debian or Ubuntu:** download the `.deb` and run `sudo apt install ./A.I.D.P_<version>_amd64.deb`.
- **Any distribution:** download the `.AppImage`, make it runnable with `chmod +x A.I.D.P_<version>_amd64.AppImage`, and open it. AppImages need FUSE 2: on Ubuntu 22.04 run `sudo apt install libfuse2`, on Ubuntu 24.04 or newer `sudo apt install libfuse2t64`.
- **Keys:** saving an API key needs a Secret Service, either GNOME Keyring (Ubuntu and most GNOME desktops have it) or KWallet (KDE), unlocked. Without one the app shows an error and doesn't store the key anywhere else.

The first time the app opens, it shows the **Chat** screen with one button: **Add a model**.

### Updates

The app checks for a new version 10 seconds after it starts (turn that off under **Settings → Updates**). When one exists, a bar under the header offers **Install and restart** and **Later**. Nothing installs until you click Install, and the app asks you to save open files first.
- **Windows:** a small installer window shows progress, then the app restarts.
- **macOS:** the app is replaced and restarts.
- **Linux:** an AppImage replaces itself and restarts. With the `.deb`, your system asks for your password to install the new package.

### Build from source

To run the app from source instead, follow the [setup guide](setup.md).

---

## 2. Connecting Models

A.I.D.P supports both cloud providers (OpenAI, Anthropic, OpenRouter, Groq, DeepSeek, Gemini, or any OpenAI-compatible endpoint) and local models running on your machine via Ollama.

### Cloud Models
1. Navigate to the **Models** tab in the top navigation.
2. Click **"Add a model"**.
3. Choose a provider preset or **Custom endpoint**.
4. Enter your API key and click **"Test and add"**.
   - Your key is tested immediately over HTTPS.
   - Keys are stored securely in your operating system's native keychain (Windows Credential Manager, macOS Keychain, or Linux Secret Service).
   - The app never saves keys in plain-text files and never displays full keys in the UI.
5. In the **"Choose models"** step, select which models to show in your picker and click **Save**.

### Local Models (Ollama)
1. Go to the **Models** tab. The top section manages **Ollama (local models)**.
2. **If Ollama is not installed:** Click **"Get Ollama"** to open [ollama.com/download](https://ollama.com/download) in your browser.
3. **If Ollama is stopped:** Click **"Start"** to launch `ollama serve` in the background.
4. **Download a model:**
   - Click **"Download"** next to any recommended model (e.g. `qwen2.5-coder:1.5b`, `0.5b`, `3b`, `7b`), or enter any tag from the Ollama library.
   - Progress is displayed live with a **Cancel** button.
5. **Manage memory:**
   - Models loaded in RAM show their active memory footprint. Click **"Free memory"** to unload them immediately.
   - Adjust the context length dropdown per model (`2048`, `4096`, `8192`, `16384`, `32768`).
   - Click **"Delete"** to delete a model from disk with inline confirmation.

---

## 3. Chatting & History

### Chat Screen
- **Model picker:** Select any cloud or local model from the top dropdown. Local models are grouped under `Local · Ollama`. If Ollama is stopped, local models appear greyed out with `(Ollama stopped)`.
- **Sidebar history:** Click **"+ New chat"** to start a fresh thread. Use the filter box to search chats by title. Delete chats with the inline confirmation trash icon.
- **Model tag:** Assistant replies display the specific model name used above the reply block.
- **Markdown & Code:** Replies render formatted tables, lists, blockquotes, and syntax-highlighted code blocks with one-click **Copy**.

---

## 4. Coding Workspace

Open any folder on your computer to edit files alongside an AI assistant that can inspect your code and propose changes safely.

### The Workspace Interface
- **File tree (Left):** Explore files and folders. Automatically respects `.gitignore`. Secret files (such as `.env`, private keys, and credential stores) are highlighted with a shield icon and excluded from model context.
- **Editor tabs (Centre):** CodeMirror 6 editor with syntax highlighting, dirty tab indicators, conflict detection for files modified on disk, and preservation of line endings (LF/CRLF) and UTF-8 BOM.
- **AI Panel (Right):** Context-aware conversation with access to open file tabs and active selections.
- **Terminal (Bottom):** Built-in native terminal (`powershell.exe` on Windows, `$SHELL` on Unix). Toggle open/closed using the terminal icon or `Ctrl+\`.
- **Layout:** Show or hide the file tree with **Files** or `Ctrl+B`, and the AI panel with **AI** or `Ctrl+Alt+B`. Drag the thin line beside either panel to resize it (or focus the line with Tab and use the arrow keys); double-click the line to reset its width. When the window gets narrow, the panels shrink before the editor does. The AI panel opens by itself when a command waits for your approval. Panel sizes go back to their defaults when the app restarts.

### Context Chips & Token Budgeting
- When a file or selection is active, context chips appear above the composer.
- File attachment size is automatically budgeted according to the model's context window. If a file exceeds the budget, it is safely cut to fit and labelled `(cut to fit the model's context)`.

### Safety & Approval Gates
- **Edits are proposals:** The model cannot write directly to your files. Changes appear as an interactive unified diff over the editor. Review the exact before-and-after diff and click **Accept** to write to disk or **Reject** to discard.
- **Non-git warning:** If you open a directory that is not a git repository, A.I.D.P warns you before applying AI edits, since changes cannot be undone with `git checkout`.

---

## 5. Autonomous Agent Tools

When you select a model that supports tool calling, an **Agent** switch appears in the workspace AI panel.

### Capabilities
With Agent turned on, the model can iteratively explore your project:
1. `list_files`: Discover files in subfolders.
2. `read_file`: Read specific line ranges of source code.
3. `search`: Search for text patterns across repository files.
4. `edit_file`: Propose edits to existing files.
5. `create_file`: Propose creating new files.
6. `run_command`: Request running commands in the project folder (e.g. tests or builds).

### Strict Security Rules
- **No auto-approve:** File edits and command execution **always** pause for user review.
- **Command inspection:** Command cards display the exact command string and working directory. Commands with hidden characters, control characters, or unprintable unicode are refused before presentation.
- **The `.git` folder is off limits:** Tools cannot read, modify, or create files inside `.git`.
- **Hard timeouts & process cleanup:** Model commands run with a 120-second timeout. Clicking **Stop** kills the entire spawned process tree cleanly.

---

## 6. Settings

Open the **Settings** tab in the top navigation:
- **Default model:** Select the model that automatically loads when starting new chats or opening workspaces.
- **Theme:** Switch between **Dark**, **Light**, and **System** (follows your OS light/dark mode preference). The code editor and terminal automatically match the selected theme.
- **Keep local models loaded:** Configure how long Ollama models stay in memory after a reply (Ollama default 5 min, 5 min, 30 min, 1 hour, until Free memory, or unload after each reply).
- **Updates:** Shows the version you run. The app checks GitHub for a new version once, 10 seconds after it starts; turn **Check for updates at start** off to stop that, and use **Check for updates** to check by hand. A new version shows a bar at the top with **Install and restart** and **Later**. Nothing installs until you click Install, and the app asks you to save your files first. Updates are signed, and the app refuses one whose signature doesn't match.

---

## 7. Troubleshooting

| Symptom | Cause | Solution |
| --- | --- | --- |
| **"Can't reach the provider. Check your internet connection, or start Ollama on the Models page."** | Network disconnected or Ollama server is stopped. | Check your internet connection for cloud models. For local models, go to **Models** and click **Start** under Ollama. |
| **"The provider rejected the API key."** | Invalid or expired API key. | Go to **Models**, click **Replace key** on the connection, and enter a valid key. |
| **"The provider doesn't know this model."** | The model was renamed, removed, or requires special access. | Go to **Models**, click **Choose models** on the connection, and choose an available model. |
| **"This conversation is too long for the model."** | Conversation exceeded model's context window. | Click **+ New chat** in Chat, or click **Clear** in the workspace AI panel to start fresh. |
| **Agent switch is disabled.** | The selected model does not support tool calling. | Switch to a model that supports tools (e.g. `qwen2.5-coder:1.5b` or newer cloud models), or use standard workspace chat. |
| **"Windows protected your PC" when installing.** | The installer isn't code-signed yet. | Click **More info**, then **Run anyway**. |
| **macOS won't open the app, or says it "is damaged".** | The app isn't notarized yet. | Use **Open Anyway** in **System Settings → Privacy & Security**, or run `xattr -dr com.apple.quarantine /Applications/A.I.D.P.app` (see Install). |
| **The AppImage doesn't start (`libfuse.so.2` missing).** | FUSE 2 isn't installed. | Ubuntu 22.04: `sudo apt install libfuse2`; 24.04 or newer: `sudo apt install libfuse2t64`. Or install the `.deb`. |
| **"Couldn't use the system keychain … GNOME Keyring or KWallet."** | On Linux, no Secret Service is running or it's locked. | Install GNOME Keyring or KWallet, log in to a desktop session that starts it, and unlock it. The app never falls back to storing keys in a file. |
| **"Couldn't check for updates: …"** | No internet, GitHub unreachable, or no release published yet. | The app works without it; try **Check for updates** again later. |
| **"Save or close your unsaved files first."** when installing an update | A workspace file has unsaved changes. | Save or close the file, then click **Install and restart** again. |
