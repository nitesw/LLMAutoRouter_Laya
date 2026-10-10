# CLAUDE.md

Local LLM router: a Bun/Elysia proxy in front of the Anthropic API that uses a fine-tuned Laya
classifier to send each Claude Code prompt to Haiku, Sonnet or Opus. Read `README.md` for the
overview and `docs/PLAN.md` for what to build next.

## Commands

```bash
.venv/bin/python -I eval_router.py checkpoints/router-v1   # evaluate a checkpoint
.venv/bin/python -I sweep.py                                # escalation threshold sweep
```

- **Always pass `-I` to Python.** The `laya/` folder (a git clone) has the same name as the
  `laya` package and shadows the import otherwise.
- Do not train on the Mac — it takes hours on MPS. Training runs on Kaggle via
  `kaggle/train_router.ipynb` (see README → Retraining). Ask the user to run it; it needs their account.

## Ground rules

- **Private data.** `data/` and `kaggle/` hold the user's real Claude Code prompts. Never commit
  them, never print them in bulk, never send them to an external service. The only file allowed to
  leave the machine is `kaggle/train_clean.csv`, and only after `scrub.py` plus a row-by-row privacy
  review. Synthetic prompts must not contain real company, client or person names.
- **The test set is frozen.** Never edit `data/test.csv`, never train on it, and dedupe every new
  training row against it (normalised text match, as `merge_dataset.py` does). Results are only
  comparable while the test set stays the same.
- **Production checkpoint is `checkpoints/router-v1`** with threshold `c = 0.9`. `router-v2` is
  kept only for comparison. A new checkpoint replaces v1 only if it passes the eval gate in
  `docs/PLAN.md`.
- **Routing rule:** cheapest tier whose cumulative probability (`none+haiku`, `sonnet`, `opus`)
  reaches `c`. A `none` prediction is treated as Haiku — never skip the LLM.
- **Overrides are rules, not ML.** `!opus` / `!sonnet` / `!haiku` at the start of a prompt force
  the model and are stripped. The classifier cannot follow "use opus" in plain words (tested).
- **Input format must match training.** Laya sees
  `"[previous: <previous user prompt, ≤120 chars>]\n<prompt, ≤300 chars>"` (the prefix only when
  there is a previous prompt). Changing this format means retraining.
- **Fail open.** Any router error or timeout forwards the request with the model Claude Code
  asked for.
- Report results honestly: say when a change is within noise (293 test prompts ≈ ±3 points).

## Stack and style

- Proxy: TypeScript on Bun + Elysia (to be created in `proxy/`). Laya runs as a `laya-serve`
  sidecar (Python) until the `laya-ts` ONNX path replaces it.
- Python scripts are small, single-purpose, top-level scripts with a one-line docstring;
  match that style rather than introducing frameworks.
- Model IDs: `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`. Keep them in one config
  map, not scattered through code.
