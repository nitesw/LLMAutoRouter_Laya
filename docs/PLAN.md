# Plan

Goal: keep doing the same work in Claude Code while Opus handles roughly a third of prompts instead
of ~90%, with as few prompts as possible routed to a model that is too weak.

Each phase ends with acceptance criteria. Do not start a phase until the previous one meets them.

---

## Phase 0 — Router model ✅ done

- [x] Clone Laya, run it zero-shot (useless on real prompts: 14% exact, 59% too weak)
- [x] Extract 1,475 real prompts from `~/.claude/history.jsonl`, label by tier
- [x] Freeze a 293-prompt held-out test set (real prompts only)
- [x] Strict scrub + privacy review before anything leaves the machine
- [x] Fine-tune on Kaggle T4 → `router-v1` (68% exact, 96% within one tier)
- [x] Add 1,325 synthetic prompts, restyle them toward the user's voice → `router-v2` (no real gain)
- [x] Escalation threshold sweep → **v1 at `c = 0.9`**: 33% to Opus, 3.4% too weak (later lowered to 0.8: 20% / 4.4%)
- [x] Verify the classifier cannot follow "use opus" phrasing → overrides must be rules

---

## Phase 1 — Laya sidecar ✅ done

Result: the sidecar (now launched by `bun start`, `scripts/start.ts`) serves router-v1 on MPS; `scripts/check_sidecar.py` shows
exact parity with `laya.load()` (max diff 0.0) and p50 56 ms / p95 80 ms.

Serve `router-v1` over HTTP so the proxy can call it.

- [x] Sidecar launch (originally `scripts/laya-sidecar.sh`, now part of `scripts/start.ts`):
  ```bash
  LAYA_EXTRA_MODELS='{"router": "./checkpoints/router-v1"}' \
  LAYA_PORT=8765 LAYA_PRELOAD=1 \
  .venv/bin/laya-serve
  ```
  Verify whether `LAYA_MODELS=router` limits preloading to our checkpoint only (avoid loading the
  2.3 GB bundled set).
- [ ] Request shape the proxy will send to `POST /v1/systemone`:
  ```json
  {"model": "router", "state": "<formatted prompt>", "questions": <checkpoints/router-v1/questions.json>}
  ```
- [ ] Read the probabilities from `answers.label.probabilities`.

**Accept when:** p50 latency < 100 ms on the Mac once warm; the sidecar returns the same
probabilities as `laya.load()` in Python for 20 test prompts (±1e-3).

---

## Phase 2 — Proxy (Bun + Elysia), the core

`proxy/` — a small Anthropic-compatible pass-through that only rewrites `model`.

### Request flow for `POST /v1/messages`

1. **Classify the turn.**
   - *Fresh prompt*: the last message is `role: user` and contains a text block.
   - *Continuation*: the last user message contains only `tool_result` blocks. That is Claude Code's
     agent loop, and it must keep the model that started the turn.
2. **Override check (fresh prompts only).** `^\s*>(opus|sonnet|haiku)\b` in the first text block
   → force that tier and strip the tag from the forwarded body.
3. **Route (fresh prompts, no override).**
   - Build the Laya input exactly like the evaluated test set:
     `"[previous: " + prevUserPrompt[0:200] + "]\n" + prompt`, prefix only when a
     previous user prompt exists (`proxy/src/turn.ts::formatState`).
   - Call the sidecar with a 300 ms timeout.
   - Collapse probabilities: `[none + haiku, sonnet, opus]`. Pick the cheapest tier whose
     cumulative sum reaches `C = 0.8`.
4. **Sticky routing.** Store the chosen tier per conversation and reuse it for continuations.
   Switching models mid-turn throws away the prompt cache and confuses the agent loop.
5. **Rewrite and forward.** Map the tier to a model ID from config, replace `body.model`, forward
   to `https://api.anthropic.com` with the original headers (the user's auth passes through
   untouched), and stream the response back byte-for-byte.
6. **Pass through everything else.** That includes `count_tokens`, other endpoints, and requests
   whose `model` is not the main model. Claude Code also makes its own small-model background
   calls, and those should not be touched.
7. **Fail open.** If the sidecar is down, times out or errors, use the original model. If Anthropic
   returns 400 for a downgraded request (for example a parameter the smaller model rejects),
   retry once with the original model and log it.

### Config (`proxy/config.ts`)

```ts
export const MODELS = { haiku: "claude-haiku-5-5", sonnet: "claude-sonnet-5-5", opus: "claude-opus-5-5" };
export const THRESHOLD = 0.8; // was 0.9, see DECISIONS 14
export const LAYA_URL = "http://localhost:8765/v1/systemone";
export const LAYA_TIMEOUT_MS = 300;
```

### Logging

Every routed request appends one JSONL line to `logs/routing.jsonl`, which is git-ignored and
private:
`ts, conversationKey, turnType, override, probs, chosenTier, originalModel, finalModel, layaMs, fallbackReason, promptPreview (≤300 chars)`.

### Step 0 findings (recorded 2026-10-10 with a pass-through proxy)

- **Subscription auth works through the proxy** (`authorization: Bearer`, all 200s).
- Claude Code sends `claude-opus-5-5` (no suffix) for **every** request, background ones included.
- Main-loop requests carry the full tool list (206 tools); background calls (titles, quota checks,
  `count_tokens`) carry **no tools** → eligibility = Opus + tools present.
- Stable conversation id: header `x-claude-code-session-id`.
- Reminders arrive as separate `<system-reminder>` text blocks; the message list can contain a
  `system`-role entry after the last user message; tool loops are user messages with `tool_result`.
- Body fields: `thinking {type, display}`, `output_config`, `context_management`, `safeguards`,
  `metadata.user_id`. Downgrade rejections are handled by the one-shot retry with the original model.
- Open: what the non-reminder injected blocks are (command wrappers around `/compact` etc.). The
  proxy treats any text block starting with an XML-style tag as injected and logs tag names in
  `injected` — confirm from `logs/routing.jsonl`.

### Tests (`bun test`)

- Turn classification on fixture bodies: fresh, tool-result continuation, and mixed.
- Override parsing and tag stripping.
- Threshold rule against the Python `training/sweep.py` output for the same probabilities.
- Fail-open behavior when the sidecar is down or times out.
- Streaming pass-through against a mock upstream.

**Accept when:** all tests pass; a real Claude Code session through the proxy completes a
multi-step task with tool use; continuations never switch model mid-turn; routing overhead
< 150 ms per fresh prompt.

---

## Phase 3 — Wire into Claude Code

- [x] `bun start` (`scripts/start.ts`) starts the sidecar, the proxy and the dashboard together.
- [ ] Use it: `ANTHROPIC_BASE_URL=http://localhost:8787 claude`, with Opus selected in Claude Code.
  The proxy can only route *down* from the requested model.
- [ ] `bun run stats` summarizes `logs/routing.jsonl`: share per model, overrides, fallbacks, and
  the latency p50/p95.
- [ ] Optional: a Claude Code status line or `UserPromptSubmit` hook that shows the last routing
  decision, so routing isn't invisible.

**Accept when:** one week of normal use with no blocking issues, and stats show Opus ≤ 40% of
fresh prompts.

---

## Phase 4 — Feedback loop and retraining

Real routing logs plus the user's corrections make better training data than synthetic prompts.

- [ ] `bun run review`: walk recent decisions and mark each one `ok`, `too weak` or `too strong`.
  Also count every `>opus` override as a "too weak" signal.
- [ ] Export the reviewed rows to the training format, run the scrub, retrain on Kaggle, and evaluate.
- [ ] **Eval gate.** A new checkpoint replaces v1 only if, at `c = 0.8` on the frozen test set,
  its too-weak rate is ≤ 4.4% **and** its Opus share is ≤ 20%. It also has to do no worse on a
  fresh slice of reviewed real prompts.
- [ ] Also track how many real prompts have been reviewed. Once there are ~500, they become a second,
  more trustworthy test set.

---

## Phase 5 — Effort routing (later)

- [ ] Add a second Laya question (`effort: low | medium | high`) to the same forward pass.
- [ ] The proxy sets the request's effort/thinking parameters from it. The effort level stays fixed
  for the whole turn, the same as the model.
- [ ] Labels come from the Phase 4 reviews. The user's history does not record past effort settings.

## Phase 6 — Optional

- Drop the Python sidecar. Export `router-v1` to ONNX (`laya/laya-ts/scripts/export_onnx.py`) and
  run it inside the Bun process with `laya-ts`, then verify the probabilities match.
- External or local models (OpenRouter, Ollama) for selected tiers, through a provider adapter.
- Answer the `none` tier without an LLM. Only do this if the logs show it's reliable, and use a high
  confidence bar (for example `P(none) ≥ 0.95`).
