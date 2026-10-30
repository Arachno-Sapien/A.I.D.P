# Decision Record 0009: Allow inline styles in the release CSP

**Date:** 2026-10-30
**Status:** Accepted (chosen by the human during the M3 live check)

---

## Context

The release build's Content Security Policy was `default-src 'self' ipc: http://ipc.localhost`, which forbids inline styles. In the M3 live check the editor rendered without its layout in the release build: line numbers stacked down the left and the code was pushed out of view. Dev was fine because `devCsp` already allows `style-src 'unsafe-inline'`.

Cause: CodeMirror 6 (through `style-mod`) adds its styles by creating a `<style>` element at runtime. It uses constructable stylesheets only inside shadow roots. A runtime `<style>` element is an inline style, so the release policy blocked it. Tauri adds `'nonce-…'` sources to `style-src` only for `<style>` tags present in the built HTML, and ours had none.

## Options Considered

1. **Keep the strict policy with a nonce.** Add one `<style>` tag to `index.html` so Tauri gives it a fresh nonce on each page load, and pass that nonce to CodeMirror through `EditorView.cspNonce`.
   - *Pros:* the policy stays strict.
   - *Cons:* depends on how Tauri injects nonces into the built HTML; about 8 lines in `index.html` and `cm.ts`.
2. **Allow inline styles:** add `style-src 'self' 'unsafe-inline'` to the release policy.
   - *Pros:* one line; matches what dev already allows; no reliance on Tauri internals.
   - *Cons:* any injected `<style>` element or style attribute is allowed. Scripts are unaffected: `script-src` still falls back to `default-src 'self'`.

## Decision

Option 2. The release policy is now `default-src 'self' ipc: http://ipc.localhost; style-src 'self' 'unsafe-inline'`.

Why the remaining risk is low: model replies render as Markdown with raw HTML off (`skipHtml`), links are not clickable, and no script can be injected. The worst an injected style could do is change how the app looks.

**Keep in mind:** if a `<style>` tag is ever added to `index.html`, Tauri adds a nonce to `style-src`, and browsers then ignore `'unsafe-inline'`, so the editor would lose its styles again. Either keep `index.html` free of `<style>` tags or switch to option 1.
