# 2026-11-12 · M6 · the 10 review findings, version 0.1.0-rc.6
Agent: Claude Code (Opus 5.5)
Task: the human's "Fix all 10, commit, push & release new version" (findings of the M6 review of ab47c7c..c930119, still present on 2026-11-12)
Fixed, each test seen failing first:
1. `attachments::resolve`: an image in an earlier message to a model that can't see becomes `[<name> not sent: this model can't read images]`; only the newest message refuses
2. `commands/updates.rs`: `download`, then `install` through `updates::install_when_saved`, which checks for unsaved files before and after the download
3. `discard_attachment` (new command, `attachments::discard`) on the composer's X and on a drop no chat takes, unless another store holds it (`discardUnlessPending`, a registry of chat stores); a sweep at start (`remove_unused` with a grace of time-since-start)
4. `Ollama::show`: no `capabilities` field gives `supports_vision: None`, not false (`ModelDetails.supports_vision: Option<bool>`)
5. `resolve`: one text budget per request, newest message first
6. `pasteFiles`: over 20 MB refused unread; an unreadable file (a folder) refused, the rest still added
7. `main.rs`: `pdf::child_args(args_os)`, `run_child(&Path, &Path)`
8. `MAX_IMAGE` 3.75 MB (Anthropic measures 5 MB on the base64; confirmed from its error text in user reports)
9. `attachments::temp_beside`: per-call names for `.part` and the PDF child's `.out`
10. `read_attachment` async; `AttachmentChip` keeps a 64 px thumbnail per ID (canvas), so a remount reads nothing
Docs: CHANGELOG rc.6, decisions 0019 and 0031, security.md §12, user guide (3.75 MB)
Tests: rust 333, vitest 385, clippy and typecheck clean. Not seen in the app; the thumbnail path relies on `img.decode` and canvas, stubbed in jsdom
Next: push (26 earlier commits from other sessions were unpushed too), CI, release rc.6
