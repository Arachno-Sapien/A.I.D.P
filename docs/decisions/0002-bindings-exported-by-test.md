# Decision Record 0002: Export Tauri Specta TypeScript Bindings via Unit Test

**Date:** 2026-10-29
**Status:** Accepted

---

## Context

We use `tauri-specta` to generate type-safe TypeScript bindings (`src/lib/bindings.ts`) directly from Rust command definitions, preventing client-server drift.

Two primary mechanisms exist for generating these bindings:
1. Export during debug application startup (`tauri dev`).
2. Export during automated Rust testing (`cargo test`).

---

## Options Considered

1. **Export at Debug App Startup:**
   - *How it works:* In `lib.rs`, wrap the export call with `#[cfg(debug_assertions)]` so whenever `npm run tauri dev` starts, the file is overwritten.
   - *Downsides:* CI typically builds in headless environments where launching GUI applications can be brittle. Furthermore, if an engineer modifies a command signature, TypeScript typecheck (`tsc --noEmit`) in CI would run against whatever stale file was committed, unless `tauri dev` was executed.
2. **Export inside a dedicated unit test in `src/lib.rs`:**
   - *How it works:* A dedicated test (`tests::export_bindings`) runs `builder.export(Typescript::default(), "../src/lib/bindings.ts")`.
   - *Benefits:* Running `cargo test` regenerates `src/lib/bindings.ts`. In CI, we can run `cargo test` and then assert `git diff --exit-code -- src/lib/bindings.ts`, immediately failing the PR if an engineer changed a Rust command without committing the updated bindings.

---

## Decision

We chose to **export bindings via `cargo test` (`tests::export_bindings`)**.

This provides a single, reliable generation path, allows CI to detect stale bindings without running a GUI app, and keeps production and debug startup paths identical.
