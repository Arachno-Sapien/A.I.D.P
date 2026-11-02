# Decision Record 0021: What A.I.D.P Stands For

**Date:** 2026-11-02
**Status:** Accepted (the human's answer to the open question in AGENTS.md section 14)

---

## Context

Decision 0003 settled the display name A.I.D.P but left the expansion open: "AI Independent Development Platform" for now, to be revisited as features landed. By 0.1.0-rc.4 the app holds cloud and local models, a code editor with an AI panel, agent tools that ask before acting, a terminal, attachments and chat history, all in one window.

## Options considered

1. Keep "AI Independent Development Platform".
2. "AI Integrated Development Platform".

## Decision

A.I.D.P stands for **AI Integrated Development Platform**, chosen by the human on 2026-11-02. "Integrated" says what the app is for: models and the tools for working on code, together in one place, the way an integrated development environment brings an editor and its tools together.

## Consequences

- The README and the design doc say what the name stands for; the question is gone from AGENTS.md section 14 and ticked in the design doc.
- Nothing else changes: the display name stays A.I.D.P, and the identifier `com.aidp.desktop` and the internal names `aidp` stay as decision 0003 set them. The app itself shows only A.I.D.P.
