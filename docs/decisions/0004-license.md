# Decision Record 0004: License

**Date:** 2026-10-29
**Status:** Accepted

---

## Context

The design doc asked whether to open source from day one and, if so, under MIT or Apache-2.0. The human chose a public GitHub repository, so the code needs a license before the first push.

## Options Considered

1. **MIT:** short and permissive.
2. **Apache-2.0:** permissive, with an explicit patent grant and patent-retaliation clause.
3. **MIT OR Apache-2.0 (dual):** users pick either. This is the Rust ecosystem convention (Rust itself, serde, tokio, Tauri).

## Decision

**MIT OR Apache-2.0**, chosen by the human.

- `LICENSE-MIT` and `LICENSE-APACHE` at the repo root.
- `license = "MIT OR Apache-2.0"` in `src-tauri/Cargo.toml` and `package.json`.

Contributions follow the usual dual-license rule. Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in the work by you, as defined in the Apache-2.0 license, shall be dual licensed as above, without any additional terms or conditions. Put this sentence in the README's License section when a README is added.

## Consequences

- New dependencies must have licenses compatible with both (MIT, Apache-2.0, BSD, ISC, Zlib and similar). Copyleft licenses (GPL, AGPL) need a decision record first.
- The MIT copyright line names Syed Junaid K. Change it in `LICENSE-MIT` if a different name or "A.I.D.P contributors" is preferred.
