# Measuring the app's memory (RAM)

How A.I.D.P's memory is measured on Windows. M3 set the workspace budget with it; M6 checks the release against the same numbers.

---

## 1. What counts

A Tauri app is several processes: `aidp.exe` (the Rust core, about 6 MB) and the WebView2 processes it starts (the page, GPU and utility processes), which hold most of the memory. The script adds up the whole process tree.

**The metric for targets and budgets is Task Manager's "Memory" column: private working set.** Private bytes and working set are recorded beside it but not budgeted. Private bytes include memory that is reserved but unused, and working set counts the pages the WebView2 processes share more than once.

A local model runs in Ollama's processes, not ours, so these numbers never include it.

## 2. Script

Run it in PowerShell while the app is open. It measures a **release** build, either `src-tauri\target\release\aidp.exe` or the installed app (`%LOCALAPPDATA%\A.I.D.P\aidp.exe`), so a dev build that is still running cannot be picked up by mistake. It skips `ollama.exe` and everything under it: when the app starts Ollama, Ollama becomes its child process, but its memory is not the app's.

```powershell
$app = Get-Process aidp -ErrorAction Stop | Where-Object { $_.Path -like '*\target\release\aidp.exe' -or $_.Path -like '*\AppData\Local\A.I.D.P\aidp.exe' } | Select-Object -First 1
$all = Get-CimInstance Win32_Process
$ids = @($app.Id); $i = 0
while ($i -lt $ids.Count) { $ids += @($all | Where-Object { $_.ParentProcessId -eq $ids[$i] -and $_.Name -ne 'ollama.exe' } | ForEach-Object ProcessId); $i++ }
$p = Get-Process -Id $ids -ErrorAction SilentlyContinue
$perf = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process | Where-Object { $ids -contains [int]$_.IDProcess }
"{0:N0} MB Task Manager memory, {1:N0} MB private, {2:N0} MB working set, {3} processes" -f (($perf | Measure-Object WorkingSetPrivate -Sum).Sum / 1MB), (($p | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB), (($p | Measure-Object WorkingSet64 -Sum).Sum / 1MB), $p.Count
```

## 3. What to measure

1. **Idle:** start the release build, stay on the Chat screen, open no folder, wait about 15 seconds. Target: under 150 MB.
2. **Workspace:** open a git project, open three files in tabs, let one AI reply finish (with the file and selection chips attached), then measure. Record the project's file count (`git ls-files | Measure-Object`).
3. Record all three columns in the milestone's phase doc. A new budget is the measured Task Manager memory plus about 25%, set with the human's OK.

## 4. Results so far

| Date | Build | Idle | Workspace | Budget |
| --- | --- | --- | --- | --- |
| 2026-10-30 (M3) | release, Windows 11 | 127 MB | 155 MB (this repo, 510 files) | 200 MB |
| 2026-10-31 (M6) | installed 0.1.0-rc.1, Windows 11 | 127 MB (126–143 over 96 s) | 189 MB (a 126-file project); 192 MB with the terminal open, its PowerShell (25 MB) included; 223–225 MB after a local-model reply with the terminal open, 197–199 MB without the shell | 200 MB |

The 223–225 MB reading came from streaming: every chunk rendered every earlier message again, so the page's memory jumped during a long reply. Fixed after rc.1 (memoized message rows); measure again on the next release candidate.

With a local model loaded (2026-10-31): Ollama's server 89 MB and its model runner 3,177 MB for `llama3.1-tuned` (5.6 GB in all, 3.1 GB of it on the GPU, context 8,192). These are Ollama's, listed apart, never the app's.
