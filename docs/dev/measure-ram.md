# Measuring Application Memory (RAM)

This guide documents the standardized process for measuring A.I.D.P's memory footprint on Windows. It is used in Milestone 3 to record the workspace baseline and revisited in Milestone 6 for release qualification.

---

## 1. PowerShell Memory Measurement Script

Because Tauri 2 spawns multiple helper processes (the Rust binary, the WebView2 manager, GPU rendering, and utility processes), measuring memory requires summing the private memory and working set across the entire process tree:

```powershell
$app = Get-Process aidp -ErrorAction Stop | Select-Object -First 1
$all = Get-CimInstance Win32_Process
$ids = @($app.Id); $i = 0
while ($i -lt $ids.Count) { $ids += @($all | Where-Object ParentProcessId -eq $ids[$i] | ForEach-Object ProcessId); $i++ }
$p = Get-Process -Id $ids -ErrorAction SilentlyContinue
"{0:N0} MB private, {1:N0} MB working set, {2} processes" -f (($p | Measure-Object PrivateMemorySize64 -Sum).Sum / 1MB), (($p | Measure-Object WorkingSet64 -Sum).Sum / 1MB), $p.Count
```

---

## 2. What to Measure & Record

For phase documentation (e.g. `docs/phases/M3.md`):

1. **Idle Baseline (Chat Screen):**
   - No folder open.
   - No model loaded or streaming.
   - v1 goal: **Under 150 MB RAM** at idle.

2. **Workspace Active:**
   - Open a mid-sized repository (e.g. this repository).
   - Record the repo file count:
     ```powershell
     git ls-files | Measure-Object
     ```
   - Open three representative source files in CodeMirror tabs.
   - Complete one AI reply with context chips attached.
   - Run the measurement script and record private memory and working set.

3. **Workspace Budget:**
   - Set the M3 workspace budget as the measured active value plus approximately 25% headroom.
   - Record both numbers in `docs/phases/M3.md`.
