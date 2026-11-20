# Effort Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick an effort (thinking) level, Default · Low · Medium · High, per model, and send it to every provider in that provider's own form.

**Architecture:** The level is a per-model setting stored in SQLite like `num_ctx` and "Reads images" (decision 0031). It rides to every request inside `gateway::LocalOptions`, so `send_message`, `run_agent` and `AgentRun` keep their shapes. Each adapter maps it: `reasoning_effort` (OpenAI-compatible), `output_config.effort` (Anthropic), `think` (Ollama). It is sent only where the model isn't known to refuse it. A refusal by name strips it once, and the model is then marked as not taking effort.

**Tech Stack:** Rust (Tauri 2, reqwest, serde, rusqlite, tauri-specta), wiremock tests; React + TypeScript + Zustand, Vitest.

**Spec:** this plan's **Decisions** section. Task 1 copies it into `docs/decisions/0033-effort-levels.md`, the spec executors read. Base behaviour: `docs/design.md` ("Capabilities per model", "Data model", "Models screen"). Provider facts: the Provider facts section below, researched 2026-11-19 from official docs.

## Before anything: the human's go-ahead

AGENTS.md section 13 says M6 is the v0.1 release and the feature isn't on its checklist. Precedent (decisions 0028–0031) is that a feature added during M6 is the human's recorded choice. **Do not start any task until the human has approved this plan and the Decisions below**; Task 1 records that approval in decision 0033. (Task 1's DeepSeek fix is worth doing even if the rest is postponed. If the human approves only that, do Task 1 Steps 2–6 alone and skip the decision record.) Then claim the task in `.ai/memory/progress.md` (AGENTS.md section 1).

## Decisions

These are the plan's defaults. The human can change any of them before Task 1.

- **D1. Where it's set:** per model, stored in `models.effort`. It's shown and changed in three places:
  - the Models screen card for cloud models, next to Reads images;
  - LocalPanel for local models, next to Context length;
  - a compact select beside the model picker in Chat and the Workspace AI panel, which edits the same per-model value. There is no separate per-chat value (YAGNI: one source of truth, no session state).
- **D2. Levels:** `Default` (send nothing; the provider's own default) and `Low`, `Medium`, `High`. Never `none`, `minimal`, `xhigh` or `max`: those are where providers differ and return 400.
- **D3. Thinking text is not shown.** It is kept only where a provider needs it sent back. Showing it (a `ChatEvent::Thinking`) is a separate later decision.
- **D4. Support is a stored capability, `models.effort_support`:**
  - `levels`: accepts low / medium / high;
  - `toggle`: thinking on/off only (some Ollama models);
  - `none`: refuses it;
  - NULL: unknown.

  Filled from the provider where it reports it (Anthropic Models API, OpenRouter `supported_parameters`, Ollama `/api/show`), and set to `none` when a provider refuses the field. The user doesn't edit it.
- **D5. When to send:** send unless support is `none`. When it is unknown, send it; a 400/422 whose body names the field strips it, the request is retried once, and the reply's `Usage.effort_ignored` is true. The app then stores `effort_support = 'none'` for that model and shows one line under the reply.
- **D6. Fixed for a whole agent run:** read once when the run starts. Anthropic silently drops thinking if the mode changes mid-turn, and a change invalidates the prompt cache.
- **D7. Anthropic:** Default sends no `output_config`, which keeps today's behaviour. Effort set to High also raises `max_tokens` from 8,192 to 32,000 without tools, because thinking counts toward `max_tokens`. No `thinking` object is sent: newer models think adaptively by default, and the deprecated `budget_tokens` is refused (400) on 4.7+.
- **D8. Ollama `toggle` models:** Low, Medium and High all send `"think": true`. Default sends nothing; Ollama turns thinking on by default for thinking models, and the user guide says so.
- **D9. DeepSeek:** the app sends `low`/`medium`/`high` as they are. DeepSeek folds `medium` into `high` itself, so Medium and High behave the same there; the user guide says so.
- **D10. A reply that spent its whole output budget on thinking** (stopped for length with no text and no tool call) is an error: "The model used its whole reply on thinking. Choose a lower effort and try again." It is not an empty reply.

## Provider facts (researched 2026-11-19; sources in the session log)

| Provider | Request | Refusal | Send back |
| --- | --- | --- | --- |
| OpenAI (Chat Completions) | `reasoning_effort: "low"\|"medium"\|"high"` | 400 on non-reasoning models | nothing |
| OpenRouter | `reasoning_effort` is a listed parameter (`reasoning: {effort}` also works); `supported_parameters` lists `reasoning`/`reasoning_effort` | unsupported parameters are ignored | `reasoning_details` array, unmodified and in order, on the assistant message |
| Groq | `reasoning_effort`, a subset per model | 400 for values a model doesn't accept | not documented |
| DeepSeek | `reasoning_effort` (`medium` folds into `high`); thinks by default | — | **`reasoning_content` must go back on every later request when tools are sent, or 400** |
| Gemini (OpenAI-compatible) | `reasoning_effort` maps to its levels | — | thought signatures in `tool_calls[].extra_content` (already kept) |
| LM Studio | `reasoning_effort` since 0.4.8; older builds may refuse it | maybe 400 | streams `delta.reasoning` or `delta.reasoning_content` |
| Anthropic | `output_config: {effort}`; `GET /v1/models` gives `capabilities.effort.supported` | 400 on models without effort (Sonnet 4.5, Haiku 4.5) | every `thinking`/`redacted_thinking` block unmodified with its `tool_use` (already done) |
| Ollama `/api/chat` | top-level `think`: `true` or a level string; `/api/show` gives `capabilities` (contains `"thinking"`) and, since 0.34.3, `thinking: {values, default}` | **400 `"<model>" does not support thinking` for true or any string** | `message.thinking` (already done) |

## Global Constraints

- AGENTS.md is binding:
  - the gate (clippy, cargo test, typecheck, vitest) passes before every commit;
  - no `unwrap()`/`expect()` outside tests;
  - no new dependency;
  - `src/lib/bindings.ts` is regenerated by `cargo test`, never edited;
  - docs change in the same commit as their code;
  - schema changes go through a numbered migration.
- Commit message style: `M6: <what>`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Stored values: `models.effort` is `'low'`/`'medium'`/`'high'` or NULL (Default). `models.effort_support` is `'levels'`/`'toggle'`/`'none'` or NULL (unknown). Any other stored text reads as NULL.
- Wire values are lowercase `low`/`medium`/`high` only. Nothing is sent for Default.
- The setting goes only to the model's own provider; no new network call, header or key handling. `docs/security.md` gets no change beyond the one-retry note in Task 5.
- UI labels, exact: select label `Effort`; options `Default`, `Low`, `Medium`, `High`.
  - Disabled hint: `This model doesn't take an effort level.`
  - Line under a reply: `This model ignored the effort level, so it's now off for this model.`
  - Thinking-budget error: `The model used its whole reply on thinking. Choose a lower effort and try again.`
- Every new wire field is sent only when set, so every existing exact-body test (`body_json`) still passes untouched.

## Review Focus

1. **A model refuses the field.** OpenAI non-reasoning models, Groq Qwen and old LM Studio return 400. Expected: one retry without it, the reply works, `effort_ignored` is set and stored, and no loop. Task 5 test `effort_refused_by_name_is_dropped_once`; Task 6 the same for Anthropic.
2. **Effort on an Ollama model that can't think.** Expected: `think` is never sent, so there's no 400. Task 7 test `think_is_never_sent_without_thinking_support`.
3. **High effort uses up the reply budget on thinking.** Expected: the clear D10 error, not an empty reply. Tasks 5, 6 and 7 each have a `*_thinking_used_the_whole_reply` test.
4. **A refusal in step 1 of an agent run.** Expected: later steps send no effort, so there's no retry per step. Task 5 agent test `a_refused_effort_is_not_resent_in_later_steps`.
5. **A model-list refresh after the user set an effort.** Expected: the user's `effort` survives, and `effort_support` is refreshed from the provider. Task 2 test `set_models_preserves_effort_and_refreshes_support`.

---

### Task 1: Record decision 0033 and send reasoning back where providers need it

This fixes a bug that exists today, independent of effort. DeepSeek thinks by default and requires `reasoning_content` on later requests when tools are sent, but the adapter drops it (`ChunkChoiceDelta` has only `content`/`tool_calls`, `openai_compat.rs:50`; the assistant builder at `:443-462` omits it). So DeepSeek agent runs fail from round 2. OpenRouter asks for `reasoning_details` back with tool calls.

**Files:**
- Create: `docs/decisions/0033-effort-levels.md`. Context, options, choice and why: the Decisions section above, plus the human's approval quote and date.
- Modify: `src-tauri/src/gateway/url.rs` (new host classifier)
- Modify: `src-tauri/src/gateway/openai_compat.rs:37-59` (`ChunkChoiceDelta`), `:355-462` (accumulators, assistant builder)
- Test: `src-tauri/tests/openai_compat.rs`; the unit tests in `gateway/url.rs`

**Interfaces:**
- Produces: `pub enum ReasoningEcho { DeepSeek, OpenRouter, None }` and `pub fn reasoning_echo(base_url: &str) -> ReasoningEcho` in `gateway/url.rs`. It compares the parsed host exactly, or as a `.`-prefixed suffix, never as a substring:
  - `api.deepseek.com` → `DeepSeek`;
  - `openrouter.ai` → `OpenRouter`;
  - anything else → `None`.
- Produces: `OpenAiCompat` gains a field `echo: ReasoningEcho`, set in its constructor from the base URL.

- [ ] **Step 1: Write decision 0033** from the Decisions section, with the human's approval quote. Commit it with this task.
- [ ] **Step 2: Write the failing tests**
  - `url.rs` unit test `reasoning_echo_matches_hosts_exactly`:
    - `https://api.deepseek.com/v1` → DeepSeek;
    - `https://openrouter.ai/api/v1` → OpenRouter;
    - `https://api.openai.com/v1` → None;
    - `https://evil-openrouter.ai.example.com/v1` → None;
    - `https://notdeepseek.com` → None.
  - `tests/openai_compat.rs` `deepseek_reasoning_is_kept_for_replay_not_shown`:
    - the provider is built with the base URL `https://api.deepseek.com/v1`;
    - wiremock can't serve that host, so construct with the mock URI and set the echo through a test-visible constructor `OpenAiCompat::with_echo(client, base, key, echo)`;
    - SSE chunks: `{"choices":[{"delta":{"reasoning_content":"think 1"}}]}`, `{"choices":[{"delta":{"reasoning_content":" think 2"}}]}`, then a tool call chunk;
    - assert `deltas(&events)` is empty (reasoning is never a `Delta`);
    - assert `reply.assistant["reasoning_content"] == "think 1 think 2"`.
  - `openrouter_reasoning_details_are_kept_in_order`:
    - two chunks with `delta.reasoning_details: [{"type":"reasoning.text","text":"a","index":0}]` and `[{"type":"reasoning.text","text":"b","index":0}]`, then a tool call;
    - assert `reply.assistant["reasoning_details"] == json!([{"type":"reasoning.text","text":"ab","index":0}])`. Fragments that share an `index` are merged by concatenating their `text`; all other fields come from the first fragment.
  - `other_hosts_send_no_reasoning_back`: echo `None` with `reasoning_content` chunks; assert `reply.assistant.get("reasoning_content").is_none()`.
  - `reasoning_never_reaches_content`: `delta.reasoning: "x"` plus `delta.content: "answer"`; assert deltas == `["answer"]`.
- [ ] **Step 3: Run and see them fail**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml --test openai_compat reasoning`, then `cargo test --manifest-path src-tauri/Cargo.toml --lib reasoning_echo`.
  Expected: FAIL. `with_echo` and `reasoning_echo` are not defined (compile error).
- [ ] **Step 4: Implement**
  - `ChunkChoiceDelta` gains `reasoning_content: Option<String>`, `reasoning: Option<String>` and `reasoning_details: Option<Vec<serde_json::Value>>`.
  - Accumulate `reasoning_text` (from `reasoning_content` or `reasoning`) and `reasoning_details` (merged by `index`) separately from the content text.
  - In the assistant builder:
    - `DeepSeek` → insert `"reasoning_content": reasoning_text` when non-empty;
    - `OpenRouter` → insert `"reasoning_details"` when non-empty;
    - `None` → nothing.
  - `OpenAiCompat::new` computes the echo from the base URL. `with_echo` is `pub` with doc comment `/// For tests: a fake server can't have a real provider's host.`
- [ ] **Step 5: Run the whole openai_compat suite**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml --test openai_compat`
  Expected: PASS, including the existing `keeps_extra_tool_call_fields`, `streams_deltas_and_returns_usage`, `invalid_key_on_401`, `rate_limited_with_retry_after` and `dropped_stream_keeps_deltas_and_errors`.
- [ ] **Step 6: Gate, CHANGELOG, commit**
  CHANGELOG `### Fixed`: "DeepSeek agent runs no longer fail after the first tool call: its thinking is sent back as DeepSeek requires. OpenRouter's reasoning is kept with tool calls too."
  Add to `known-issues.md`: DeepSeek needs `reasoning_content` back with tools; host matching is exact (`gateway/url.rs`).
  Commit: `M6: send DeepSeek and OpenRouter reasoning back on tool rounds (decision 0033)`.

---

### Task 2: Store the setting and the capability

**Files:**
- Modify: `src-tauri/src/db/mod.rs:10-85` (append migration 10), the test `migrations_apply_once` (`:123`; version 9 → 10 at `:128` and `:134`)
- Modify: `src-tauri/src/db/connections.rs:16-27` (`ChatModelRow`), `:130-200` (`set_models`), `:210` (next to `set_supports_vision`), `:223` (`list_chat_models`)
- Test: `src-tauri/src/db/mod.rs` `mod tests`

**Interfaces:**
- Produces, in `db/connections.rs`:
  - `ChatModelRow.effort: Option<String>` and `ChatModelRow.effort_support: Option<String>`, the raw stored text;
  - `pub fn set_effort(conn: &Connection, connection_id: u32, model_id: &str, effort: Option<&str>) -> rusqlite::Result<bool>` (true if a row changed);
  - `pub fn set_effort_support(conn: &Connection, connection_id: u32, model_id: &str, support: Option<&str>) -> rusqlite::Result<bool>`.
- Produces: `ModelInfo.effort_support: Option<String>` (wire text), in `gateway/mod.rs:72`, so a provider's list can carry it. It stays text everywhere on the DB side (`'levels'`/`'toggle'`/`'none'`). The `EffortSupport` enum (Task 3) is used only in `ChatModel` and `LocalOptions`, converted with `EffortSupport::from_str_opt`. Add the field with `#[serde(default)]` and update every `ModelInfo { .. }` literal (grep `ModelInfo {` in `src-tauri/src` and `src-tauri/tests`).

- [ ] **Step 1: Write the failing tests** in `db/mod.rs`:
  - `set_models_preserves_effort_and_refreshes_support`:
    1. insert models `a` and `b` through `set_models` with `effort_support: Some("levels")` on `a`;
    2. call `set_effort(conn, id, "a", Some("high"))`;
    3. call `set_models` again with `a` now carrying `effort_support: Some("none")`;
    4. assert from `list_chat_models` that `a.effort == Some("high")` (the user's choice survives) and `a.effort_support == Some("none")` (the provider's report wins).
  - `effort_support_kept_when_the_provider_says_nothing`: `set_effort_support(.., Some("none"))`, then `set_models` with `effort_support: None`; assert it is still `Some("none")`. A refusal the app learned is kept until the provider reports otherwise.
  - `set_effort_on_a_missing_model_changes_nothing`: returns `Ok(false)`.
  - `migrations_apply_once`: version is 10.
- [ ] **Step 2: Run and see them fail**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml --lib db::`
  Expected: FAIL. `set_effort` is not defined.
- [ ] **Step 3: Implement**
  - Migration 10: `ALTER TABLE models ADD COLUMN effort TEXT; ALTER TABLE models ADD COLUMN effort_support TEXT;`.
  - In `set_models`, widen the saved-settings map to `(num_ctx, supports_vision, effort, effort_support)` and the SELECT and INSERT to match (`?9`, `?10`). Write `effort_support` as `model.effort_support.or(previous)`.
  - In `list_chat_models`, add `m.effort, m.effort_support` as columns 10 and 11.
  - `set_effort` and `set_effort_support` copy `set_supports_vision`.
- [ ] **Step 4: Run** `cargo test --manifest-path src-tauri/Cargo.toml --lib db::`. Expected: PASS.
- [ ] **Step 5: Gate, docs, commit**
  `docs/design.md`: the Data model `models` row (`:211`) gains `effort`, `effort_support`; the migration narrative (`:206`) gains migration 10.
  Commit: `M6: store each model's effort and whether it takes one (migration 10)`.

---

### Task 3: Types, services, and the command

**Files:**
- Modify: `src-tauri/src/gateway/mod.rs:72` (`ModelInfo`), `:158` (`LocalOptions`), `:186` (`Usage`), plus the new enums next to `LocalOptions`
- Modify: `src-tauri/src/connections.rs:74-88` (`ChatModel`), `:518` (`chat_models`), `:559` (after `set_model_vision`), `:667-695` (`model_options`)
- Modify: `src-tauri/src/commands/connections.rs` (after `set_model_vision`, `:80-89`); `src-tauri/src/lib.rs:51` (register it)
- Regenerate: `src/lib/bindings.ts`
- Test: `src-tauri/tests/connections.rs`; the unit tests in `gateway/mod.rs`

**Interfaces:**
- Produces, in `gateway/mod.rs`. Both enums derive `Serialize, Deserialize, Type, Clone, Copy, Debug, PartialEq, Eq` with `#[serde(rename_all = "lowercase")]`:
  - `pub enum Effort { Low, Medium, High }` with `pub fn as_str(self) -> &'static str` and `pub fn from_str_opt(s: Option<&str>) -> Option<Effort>`;
  - `pub enum EffortSupport { Levels, Toggle, None }` with the same two methods. Unknown text gives `None` (the Option), as `KeepAlive::from_str_opt` does.
- Produces: `LocalOptions` gains `pub effort: Option<Effort>` and `pub effort_support: Option<EffortSupport>`. Doc comment: `/// Per-model options for this request. num_ctx and keep_alive apply to Ollama only; effort to every provider.`
- Produces: `Usage` gains `#[serde(default)] pub effort_ignored: bool`. Update every `Usage { .. }` literal with `..Default::default()` (grep `Usage {` in `src-tauri/src` and `src-tauri/tests`).
- Produces: `ChatModel` gains `#[serde(default, skip_serializing_if = "Option::is_none")] pub effort: Option<Effort>` and `pub effort_support: Option<EffortSupport>` (same attribute).
- Produces:
  - `Services::set_model_effort(&self, connection_id: u32, model_id: String, effort: Option<Effort>) -> Result<(), AppError>`. It works for every connection kind, Ollama included. Unknown model → `AppError::NotFound`. If the model's support is `none` and `effort` is `Some` → `AppError::InvalidInput { message: "This model doesn't take an effort level." }`.
  - `Services::mark_effort_ignored(&self, connection_id: u32, model_id: &str)`. It sets support `none` and clears `effort`, and ignores storage errors: it runs after a reply.
- Produces: `#[tauri::command] #[specta::specta] pub fn set_model_effort(services: State<'_, Services>, connection_id: u32, model_id: String, effort: Option<Effort>) -> Result<(), AppError>`. The TS binding is `commands.setModelEffort(connectionId: number, modelId: string, effort: Effort | null)`.

- [ ] **Step 1: Write the failing tests** in `tests/connections.rs`. Templates: `user_sets_vision_on_a_cloud_model_and_a_refresh_keeps_it` (`:1175`), `model_options_defaults` (`:875`).
  - `effort_reaches_model_options_for_cloud_and_local`:
    - set `High` on the cloud model `gpt4o()`;
    - assert `model_options(..).effort == Some(Effort::High)` and `.num_ctx == None`; the second assertion keeps the existing rule that only Ollama gets num_ctx;
    - for an Ollama model set `Low` and assert `.effort == Some(Effort::Low)` and `.num_ctx.is_some()`.
  - `effort_on_a_model_that_refuses_it_is_rejected`:
    - store support `none`;
    - assert `set_model_effort(.., Some(High))` is `Err(InvalidInput { message: "This model doesn't take an effort level." })`;
    - `set_model_effort(.., None)` is Ok.
  - `mark_effort_ignored_turns_it_off`: after it, `chat_models()` shows `effort: None, effort_support: Some(EffortSupport::None)`.
  - `chat_models_carry_effort`: a stored `'medium'` appears as `Some(Effort::Medium)`, and a stored `'bogus'` as `None`.
  - Unit test in `gateway/mod.rs`, `effort_wire_names`: `serde_json::to_value(Effort::High) == json!("high")`; `Effort::from_str_opt(Some("max")) == None`.
- [ ] **Step 2: Run and see them fail**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml --test connections effort`
  Expected: FAIL, compile errors (`Effort` not found).
- [ ] **Step 3: Implement** the enums, fields and services. In `model_options`:
  1. Read `effort` and `effort_support` for every kind first.
  2. Return early for a non-Ollama kind with `LocalOptions { effort, effort_support, ..Default::default() }`.
  3. Keep the Ollama path as it is, plus the two fields.
- [ ] **Step 4: Register the command, then regenerate bindings and run the suites**
  Add `commands::connections::set_model_effort` to `collect_commands!` in `lib.rs`.
  Run: `cargo test --manifest-path src-tauri/Cargo.toml`.
  Expected: PASS. `bindings.ts` now has `Effort`, `EffortSupport`, `setModelEffort`, `ChatModel.effort` and `Usage.effortIgnored`.
- [ ] **Step 5: Gate, commit**
  `npm run typecheck` must still pass: `effortIgnored` is a new field, and existing TS doesn't construct `Usage`.
  Commit: `M6: effort setting in the model list, model options and set_model_effort`.

---

### Task 4: Fill the capability from each provider

**Files:**
- Modify: `src-tauri/src/gateway/anthropic.rs` (`list_models`, around `:145`)
- Modify: `src-tauri/src/gateway/openai_compat.rs` (`list_models`, `supported_parameters`, around `:158-160`)
- Modify: `src-tauri/src/ollama/mod.rs:83` (`ModelDetails`), `:214` (`show`); `src-tauri/src/connections.rs:637-662` (`sync_local_models`)
- Test: `src-tauri/tests/anthropic.rs`, `tests/openai_compat.rs`, `tests/ollama.rs`, `tests/connections.rs`

**Interfaces:**
- Consumes: `ModelInfo.effort_support` (Task 2), `EffortSupport` (Task 3).
- Produces: `ModelDetails.effort_support: Option<EffortSupport>`, plus `pub fn ollama_effort_support(show: &serde_json::Value, model: &str) -> Option<EffortSupport>` in `ollama/mod.rs`.

Ollama mapping, the algorithm (the tests pin it):

1. `show["thinking"]["values"]` is an array:
   - any of `"low"`/`"medium"`/`"high"` → `Levels`;
   - else it contains `true` → `Toggle`;
   - else → `None`.
2. Otherwise, a `capabilities` array is present:
   - it contains `"thinking"` → `Levels` if the model name starts with `gpt-oss` (strings have worked there since Ollama 0.11.0), else `Toggle` (Ollama before 0.17.7 refuses level strings for other models);
   - it doesn't contain `"thinking"` → `None`.
3. No `capabilities` array → unknown (the Option is `None`).

- [ ] **Step 1: Write the failing tests**
  - `anthropic.rs` `list_models_reads_effort_support`. Mock `/v1/models` with three models:
    - `"capabilities": {"effort": {"supported": true}}`
    - `"capabilities": {"effort": {"supported": false}}`
    - no `capabilities`

    Assert `Some("levels")`, `Some("none")` and `None`.
  - `openai_compat.rs` `openrouter_supported_parameters_give_effort_support`: `supported_parameters: ["tools","reasoning"]` → `Some("levels")`; `["tools"]` → `Some("none")`; field absent → `None`.
  - `tests/ollama.rs` `effort_support_from_show`, a table over `ollama_effort_support`:
    - `{"thinking":{"values":["low","medium","high"]}}` → Levels;
    - `{"thinking":{"values":[false,true]}}` → Toggle;
    - `{"thinking":{"values":[false]}}` → None;
    - `{"capabilities":["completion","thinking"]}` with name `qwen3:8b` → Toggle;
    - the same with `gpt-oss:20b` → Levels;
    - `{"capabilities":["completion","tools"]}` → None;
    - `{}` → unknown.
  - `connections.rs` `sync_writes_local_effort_support`: after `sync_local_models` against a wiremock Ollama whose `/api/show` returns `"capabilities":["completion","thinking"]`, `chat_models()` shows `effort_support: Some(EffortSupport::Toggle)`. Template: `vision_of_a_local_model_comes_from_ollama_not_the_user` (`:1213`).
- [ ] **Step 2: Run and see them fail**, per suite: `--test anthropic list_models_reads_effort_support`, `--test openai_compat openrouter_supported`, `--test ollama effort_support_from_show`, `--test connections sync_writes_local_effort_support`.
  Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The Anthropic list reads `capabilities.effort.supported`.
  - The OpenAI-compatible list maps `supported_parameters`: contains `reasoning` or `reasoning_effort` → levels; a list without them → none; no list → unknown.
  - `show` stores `ollama_effort_support(&val, name)`.
  - `sync_local_models` writes it with `set_effort_support`, next to `set_supports_vision` (`:660-662`).
- [ ] **Step 4: Run all four suites.** Expected: PASS; `show_reads_tools_and_context` is unchanged.
- [ ] **Step 5: Gate, docs, commit**
  `docs/design.md` "Capabilities per model" (`:102`) and AGENTS.md section 4 ("Capabilities per model", line 133): add "effort (levels / toggle / none / unknown)".
  Commit: `M6: learn which models take an effort level from Anthropic, OpenRouter and Ollama`.

---

### Task 5: OpenAI-compatible: send `reasoning_effort`, refuse once, flag it

**Files:**
- Modify: `src-tauri/src/gateway/openai_compat.rs`: the body (`:189-245`), the retry (`:263-306`), finish handling (`:397`)
- Modify: `src-tauri/src/tools/agent.rs` (the per-step request at `:265-273`, after each reply); `src-tauri/src/commands/chat.rs` (`send_message`, `run_agent`: after the result)
- Test: `src-tauri/tests/openai_compat.rs`, `tests/agent.rs`

**Interfaces:**
- Consumes: `req.local.effort`, `req.local.effort_support`, `Usage.effort_ignored`, `Services::mark_effort_ignored`.
- Produces, in `gateway/mod.rs`: `pub fn effort_to_send(local: &LocalOptions) -> Option<Effort>`. It returns `local.effort` unless `local.effort_support == Some(EffortSupport::None)`. All three adapters use it.
- Produces: `pub const THINKING_USED_THE_REPLY: &str = "The model used its whole reply on thinking. Choose a lower effort and try again.";` in `gateway/mod.rs`.

- [ ] **Step 1: Write the failing tests** (`tests/openai_compat.rs`; templates `asks_for_usage_in_the_stream` `:830` and `retries_once_without_stream_options_when_refused` `:882`):
  - `sends_reasoning_effort_only_when_set`:
    - with `local.effort = Some(High)`, the request body has `"reasoning_effort": "high"` (`body_partial_json`);
    - with `None`, `server.received_requests()` bodies have no `reasoning_effort` key;
    - with `effort_support = Some(None)` and effort High, there is no key either.
  - `effort_refused_by_name_is_dropped_once`:
    - the first mock answers 400 `{"error":{"message":"Invalid 'reasoning_effort' for non-reasoning model"}}`, expected once;
    - the second answers a normal stream;
    - assert exactly 2 requests, the 2nd without `reasoning_effort`, and `reply.usage.effort_ignored == true`.
  - `other_400s_keep_the_effort_error`: a 400 `temperature must be at most 2` gives 1 request and an error, with no retry.
  - `both_refusals_in_one_reply`: a 400 naming `stream_options`, then a 400 naming `reasoning_effort`, then success. Assert 3 requests, the last with neither key; the loop stays bounded because each pass removes one key.
  - `openai_thinking_used_the_whole_reply`: a stream with only `finish_reason: "length"`, no content and no tool calls. Assert the error is `ProviderError::Provider { message: THINKING_USED_THE_REPLY }`, while a `length` with some text still returns the text as today.
  - `tests/agent.rs` `a_refused_effort_is_not_resent_in_later_steps`, using `Recorder` (`:2278`) or a wiremock queue:
    - step 1 is refused-then-ok with a tool call, step 2 a normal answer;
    - assert step 2's request has no `reasoning_effort`, the run's `Usage.effort_ignored == true`, and step 1 and step 2 share `effort` when nothing is refused (D6).
- [ ] **Step 2: Run and see them fail**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml --test openai_compat effort`, then `--test agent refused_effort`.
  Expected: FAIL.
- [ ] **Step 3: Implement**
  - After `stream_options`, insert `reasoning_effort` when `effort_to_send` is `Some`.
  - Extend the retry branch: on 400/422 whose lowercased body contains `"reasoning_effort"` and whose map still holds that key, remove it, set a local `effort_ignored = true`, and `continue`. Never match on plain `reasoning`: "unsupported for reasoning models" errors would then strip it wrongly.
  - Put `effort_ignored` into the returned `Usage`.
  - Empty-length → `THINKING_USED_THE_REPLY`.
  - Agent: keep a `mut local = args.local.clone()`. After a reply with `effort_ignored`, set `local.effort = None` and remember it, then OR it into the run's `Usage`.
  - Commands: in `send_message` and `run_agent`, after an `Ok(usage)` with `effort_ignored`, call `services.mark_effort_ignored(connection_id, &model_id)` before sending `Done(usage)`.
- [ ] **Step 4: Run** the openai_compat, agent and connections suites. Expected: PASS, with the required success / 401 / 429 / dropped-stream tests unchanged.
- [ ] **Step 5: Gate, docs, commit**
  `docs/security.md` section 5: one line: "Effort: one retry without `reasoning_effort` (or Anthropic's `output_config`) when a provider refuses it by name, to the same provider only."
  Commit: `M6: OpenAI-compatible effort with one retry when a model refuses it`.

---

### Task 6: Anthropic: `output_config.effort`, max_tokens, refusal

**Files:**
- Modify: `src-tauri/src/gateway/anthropic.rs:63-64` (constants), `:274` (the max_tokens choice), `:280-302` (body), the HTTP error path before streaming, `:478` (the max_tokens stop)
- Test: `src-tauri/tests/anthropic.rs`

**Interfaces:**
- Consumes: `effort_to_send`, `THINKING_USED_THE_REPLY`, `Usage.effort_ignored` (Task 5).
- Produces: `fn max_tokens(has_tools: bool, effort: Option<Effort>) -> u32` (private). It returns `MAX_TOKENS_WITH_TOOLS` (32,000) when tools are present or effort is `High`, else `MAX_TOKENS` (8,192).

- [ ] **Step 1: Write the failing tests** (template: `sends_tools_and_more_tokens` `:708`):
  - `sends_output_config_effort_only_when_set`:
    - effort Medium → body has `"output_config": {"effort": "medium"}` and `"max_tokens": 8192`;
    - High without tools → `"output_config": {"effort": "high"}` and `"max_tokens": 32000`;
    - Default → no `output_config` key (check the received body), max_tokens unchanged;
    - support `None` with High → no key.
  - `anthropic_effort_refused_by_name_is_dropped_once`: a 400 `{"type":"error","error":{"type":"invalid_request_error","message":"output_config.effort: not supported for this model"}}` once, then a stream. Assert 2 requests, the 2nd without `output_config`, and `effort_ignored`. The test's wording is illustrative: the exact text isn't documented, so match on the body containing `effort`.
  - `anthropic_thinking_used_the_whole_reply`: stream a `thinking` block (with `signature_delta`), then `message_delta` with `stop_reason: "max_tokens"`, no text and no tool_use. Assert the error is `THINKING_USED_THE_REPLY`.
  - Regression: `parses_tool_use_and_keeps_thinking` (`:747`) and `redacted_thinking_is_kept` (`:933`) still pass.
- [ ] **Step 2: Run and see them fail**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml --test anthropic effort`
  Expected: FAIL.
- [ ] **Step 3: Implement**
  - Insert `output_config` when `effort_to_send` is `Some`.
  - Build the request in a loop like openai_compat's: on 400 whose body contains `effort` and while the map still holds `output_config`, remove it, flag it, and retry once.
  - Use `max_tokens(..)`. An empty `max_tokens` stop gives `THINKING_USED_THE_REPLY`; the existing tool_use case at `:478` stays as it is.
  - Leave `anthropic-version: 2026-10-21` unchanged: that version changes nothing for effort.
- [ ] **Step 4: Run** `cargo test --manifest-path src-tauri/Cargo.toml --test anthropic`. Expected: PASS.
- [ ] **Step 5: Gate, commit.** Commit: `M6: Anthropic effort through output_config, with room to think at High`.

---

### Task 7: Ollama: `think`

**Files:**
- Modify: `src-tauri/src/gateway/ollama_chat.rs:109-139` (body), the `done` handling (length)
- Test: `src-tauri/tests/ollama_chat.rs`. Fix the full `LocalOptions { .. }` literal at `:121` with `..Default::default()`.

**Interfaces:**
- Consumes: `LocalOptions.effort`, `LocalOptions.effort_support`, `THINKING_USED_THE_REPLY`.
- Produces: `pub fn think_value(effort: Option<Effort>, support: Option<EffortSupport>) -> Option<serde_json::Value>`:
  - `(None, _)` → None;
  - `(Some(e), Some(Levels))` → `json!(e.as_str())`;
  - `(Some(_), Some(Toggle))` → `json!(true)`;
  - anything else → None. Unknown support never sends, because Ollama returns 400 for a model that can't think.

- [ ] **Step 1: Write the failing tests**
  - Unit table `think_value_table`: every combination above.
  - `sends_think_only_when_supported`: Levels + Low → body `"think": "low"`; Toggle + High → `"think": true`.
  - `think_is_never_sent_without_thinking_support`: support `None`, and support unknown, with effort High. Assert the body has no `think` key. The existing default-case exact `body_json` in `sends_options_only_when_set` (`:101`) still passes.
  - `ollama_thinking_used_the_whole_reply`: NDJSON with only `message.thinking` chunks, then `{"done":true,"done_reason":"length"}`. Assert `THINKING_USED_THE_REPLY`.
  - Regression: `keeps_thinking_for_replay` (`:324`).
- [ ] **Step 2: Run and see them fail**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml --test ollama_chat think`
  Expected: FAIL.
- [ ] **Step 3: Implement.** Insert `think` when `think_value` is `Some`. The empty-length case gives the error. No refusal retry here: the capability rule keeps the 400 from happening.
- [ ] **Step 4: Run** `--test ollama_chat`. Expected: PASS.
- [ ] **Step 5: Gate, commit.** Commit: `M6: Ollama think from the effort level, only for models that can think`.

---

### Task 8: The UI

**Files:**
- Create: `src/features/models/EffortSelect.tsx`, one small component used in three places
- Modify: `src/features/models/ModelsScreen.tsx:325-364` (the "Chosen models" card, next to Reads images); `src/features/models/LocalPanel.tsx:274-296` (next to Context length); `src/features/chat/ModelPicker.tsx` (beside the model select, for the current model)
- Modify: `src/features/models/store.ts`: add `setEffort`
- Modify: `src/features/chat/store.ts` (`applyEvent` `done` branch, `:538`), `src/features/chat/persist.ts` (envelope), `src/features/chat/MessageList.tsx` (the note line)
- Test: `src/features/models/EffortSelect.test.tsx`, `ModelsScreen.test.tsx`, `LocalPanel.test.tsx`, `chat/ModelPicker.test.tsx`, `chat/store.test.ts`

**Interfaces:**
- Consumes: `commands.setModelEffort(connectionId: number, modelId: string, effort: Effort | null)`, `ChatModel.effort`, `ChatModel.effortSupport`, `Usage.effortIgnored`.
- Produces:
  - `export function EffortSelect({ model, onChange }: { model: ChatModel; onChange: (effort: Effort | null) => void }): JSX.Element`. It is a `<select aria-label={`${model.displayName} effort`}>` with options `Default` (value `""`), `Low`, `Medium`, `High`, and a visible `<label>` "Effort".
  - When `model.effortSupport === "none"`, it is `disabled` with `title` and an adjacent hint `This model doesn't take an effort level.`
  - Models store: `setEffort(model: ChatModel, effort: Effort | null): Promise<string | null>`. It calls the command, then `refresh()`, and returns the error text through `appErrorText`. It copies the `select()` pattern from 2026-11-19 and never sets `loadError`.
  - `UiMessage.effortIgnored?: boolean`, saved in the envelope as `effortIgnored?: true`. No DB migration: content parts are opaque text.

- [ ] **Step 1: Write the failing tests**
  - `EffortSelect.test.tsx`:
    - "shows the stored level and reports changes": model effort `high` → select value `high`; change to `""` → `onChange(null)`.
    - "is off for a model that refuses effort": `effortSupport: "none"` → `disabled`, hint text present.
  - `ModelsScreen.test.tsx`: "sets a cloud model's effort". Template: the vision test (~`:436-488`). Change the `Claude effort` combobox to `medium` → `setModelEffort` called with `(1, "anthropic/claude", "medium")`, then with `null` for Default.
  - `LocalPanel.test.tsx`: "sets a local model's effort" (template: "sets the context length" `:249`).
  - `ModelPicker.test.tsx`: "the effort select follows the current model". Switch the selected model → the select shows that model's effort; changing it calls `setModelEffort` for the current model. A failed save shows `role="alert"` and the old value comes back.
  - `chat/store.test.ts`: "a reply whose effort was ignored says so". A `done` event with `usage.effortIgnored: true` → the message has `effortIgnored: true`, and `appendMessage` is called with an envelope containing `effortIgnored: true`.
  - `MessageList` test (or in `store.test.ts` plus a render): the note text `This model ignored the effort level, so it's now off for this model.` renders under that reply and not under others.
- [ ] **Step 2: Run and see them fail**
  Run: `npx vitest run src/features/models src/features/chat`
  Expected: FAIL. `EffortSelect` isn't found and `setModelEffort` isn't called.
- [ ] **Step 3: Implement**
  - Build `EffortSelect`, place it in the three spots and add the store action.
  - Add the `done` branch: set `effortIgnored` from `event.data.effortIgnored`, keeping the existing save path.
  - Render the note line in `MessageItem`.
  - Use Tailwind classes matching the Reads images select. Check the AI panel's options row still wraps at 720 px (`flex-wrap`).
- [ ] **Step 4: Run** `npx vitest run` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Check in the browser.** Start the Vite dev server with stubbed IPC, as the 2026-11-15 Settings check did. Look at the Models screen and the AI panel at 1024×768 and 720×480: no overflow, and the select is readable.
- [ ] **Step 6: Gate, commit.** Commit: `M6: Effort select on the Models screen, local models and beside the picker`.

---

### Task 9: Docs, memory, and the live check

**Files:**
- Modify: `docs/user-guide.md`: the "Connecting Models" section (`:58`, `:68`, `:91`)
- Modify: `docs/design.md`: the Models screen bullets (`:245-247`)
- Modify: `CHANGELOG.md`: `### Added`
- Modify: `.ai/memory/progress.md`, `.ai/memory/known-issues.md`; create `.ai/memory/log/<date>-m6-effort-levels.md`

- [ ] **Step 1: User guide.** Add an "Effort" paragraph covering:
  - what the levels do;
  - Default = the provider's choice, and Ollama thinking models think by default;
  - DeepSeek treats Medium and High the same;
  - higher levels cost more tokens and time;
  - "ignored" means the model doesn't take it;
  - where to set it.
- [ ] **Step 2: CHANGELOG** `### Added`: "**Effort:** choose Default, Low, Medium or High for each model on the Models screen or beside the model picker. It is sent in each provider's own form, and a model that doesn't take it is turned off for effort automatically (decision 0033)."
- [ ] **Step 3: known-issues.md**, three entries:
  - Anthropic thinking counts toward `max_tokens`, and High uses 32,000;
  - Ollama returns 400 if `think` goes to a model that can't think, so unknown support never sends it;
  - never match the OpenAI-compatible retry on plain "reasoning".
- [ ] **Step 4: Live check in `npm run tauri dev`.** It needs the human's own keys; record which providers were tried in the session log:
  - one OpenAI reasoning model at Low and High (token counts differ);
  - a non-reasoning OpenAI model (the "ignored" line appears once, and the select then shows disabled);
  - Claude at High (a longer answer, no error);
  - an Ollama thinking model (`think` sent) and a non-thinking one (no error);
  - a DeepSeek agent task with two tool calls (Task 1's fix).
- [ ] **Step 5: Gate, session log, progress, commit.** Commit: `M6: effort levels docs and memory`.

---

## Self-review notes (done while writing)

- **Decisions to tasks:**
  - D1 → Tasks 2, 3, 8; D2 → Task 3 (enum);
  - D3 → not built (no `ChatEvent::Thinking`), and Task 1 keeps reasoning out of `Delta`;
  - D4 → Tasks 2 and 4; D5 → Tasks 5 and 6 (Ollama prevents the refusal, Task 7);
  - D6 → Task 5 agent test; D7 → Task 6; D8 → Task 7 `think_value`; D9 → Task 9 user guide; D10 → Tasks 5, 6 and 7.
- **Types used across tasks:**
  - `Effort` and `EffortSupport` (Task 3);
  - `effort_to_send` and `THINKING_USED_THE_REPLY` (Task 5, used in 6 and 7);
  - `Usage.effort_ignored` (3 → 5, 6, 8);
  - `set_effort` and `set_effort_support` (2 → 3, 4);
  - `mark_effort_ignored` (3 → 5);
  - `ReasoningEcho` (Task 1 only).
- **Literal sites that break when a field is added:** `ModelInfo {` (Task 2), `Usage {` (Task 3), `LocalOptions {` in `tests/ollama_chat.rs:121` (Task 7). `AgentRun` is untouched, so none of its 29 test literals change.
- **Not done on purpose:**
  - per-chat effort (D1);
  - showing thinking text (D3);
  - `xhigh` and `max`;
  - OpenRouter's `reasoning: {effort}` object form: the top-level field is documented; switch only if a live test shows OpenRouter ignoring it;
  - Anthropic `thinking: {type: "adaptive"}` for 4.6–4.8 models, where thinking is off by default. The human can add it to D7.
