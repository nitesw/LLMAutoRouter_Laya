# LLM Auto Router

A local router that sits between Claude Code and the Anthropic API and sends each prompt to the
cheapest model that can handle it — Haiku, Sonnet or Opus — instead of using Opus for everything.

The decision is made by [Laya](https://github.com/NandhaKishorM/laya), an open-source "System 1"
decision engine (a ~421M-parameter encoder, not an LLM). It reads a prompt and returns a
probability for each model tier in ~50–100 ms on a Mac. We fine-tuned it on real Claude Code
prompts so it learns what "hard" means for this user's work.

> **Status:** working end to end (router, proxy, dashboard). Next steps in [docs/PLAN.md](docs/PLAN.md).

## How it works

```
Claude Code ──ANTHROPIC_BASE_URL=http://localhost:8787──► Router proxy (Bun + Elysia)
                                                              │
                                   1. ">opus" / ">sonnet" / ">haiku" prefix? → force that model
                                   2. tool-result continuation?             → keep this turn's model
                                   3. otherwise ask Laya (laya-serve sidecar, ~60 ms)
                                                              │
                                 cheapest tier whose cumulative P(enough) ≥ 0.8
                                                              │
                                ┌─────────────────┬───────────┴───────┐
                            Haiku 5.5        Sonnet 5.5          Opus 5.5
```

- **Overrides win.** Starting a prompt with `>opus`, `>sonnet` or `>haiku` forces that model; the
  tag is stripped before the request is forwarded. The classifier does *not* understand
  "use opus" in plain words — that is handled by these rules, not by Laya.
- **Escalation threshold `c = 0.8`.** The router picks the cheapest tier whose cumulative
  probability of being sufficient reaches 0.8 (set `ROUTER_THRESHOLD` to change it). When unsure, it escalates.
- **Never skips the LLM.** Laya can predict a `none` tier (trivial acknowledgements); for now it is
  treated as Haiku.
- **Fail-open.** If Laya is down or slow, the request goes to the model Claude Code asked for.

## Results so far

Held-out test: 293 real prompts never seen in training. Labels are model-assigned, so treat the
numbers as directional.

| Router | Sent to Opus | Routed too weak | Hard prompts reaching Opus | Relative cost* |
|---|---|---|---|---|
| Always Opus (before) | 100% | 0% | 30/30 | 100% |
| Always Sonnet | 0% | 10.2% | 0/30 | 20% |
| Laya zero-shot (not fine-tuned) | — | 59% | — | — |
| router-v1, c = 0.9 | 33% | 3.4% | 21/30 | 46% |
| **router-v1, c = 0.8 (current)** | **20%** | **4.4%** | **19/30** | **35%** |

\* Illustrative weights Haiku 1 : Sonnet 4 : Opus 20. The Opus share is price-independent.

Full experiment log: [docs/RESULTS.md](docs/RESULTS.md).

## Repository layout

| Path | What |
|---|---|
| `training/extract_prompts.py` | Pull real prompts from `~/.claude/history.jsonl` → `data/prompts.jsonl` |
| `training/build_dataset.py` | Join labels, stratified train/test split → `data/train.csv`, `data/test.csv` |
| `training/scrub.py` | Strict PII/secret redaction → `kaggle/train_clean.csv` (the only file that leaves the machine) |
| `training/merge_dataset.py` | Merge cleaned real prompts with restyled synthetic ones (v3 dataset) |
| `training/apply_restyle.py` | Assemble restyled synthetic prompts from `data/restyle/out_*.txt` |
| `training/eval_router.py` | Accuracy + confusion matrix of a checkpoint on `data/test.csv` |
| `training/sweep.py` | Escalation-threshold sweep (Opus share vs. too-weak rate) |
| `kaggle/train_router.ipynb` | Fine-tuning notebook (Kaggle, free T4 GPU) |
| `checkpoints/router-v1/` | **Production router** (not in git) |
| `checkpoints/router-v2/` | Retrained on restyled synthetic data; kept for comparison (not in git) |
| `laya/` | Clone of the Laya repo, incl. `laya-ts` (TypeScript/ONNX runtime) (not in git) |
| `dashboard/` | Local stats page (`bun run dev` → :8788) |
| `docs/` | Plan, results, decisions |

`data/`, `checkpoints/`, `kaggle/*.csv|zip` and `laya/` are git-ignored: they hold private prompts
or large binaries.

## Setup

Needs [Bun](https://bun.sh), [uv](https://docs.astral.sh/uv/) and Python 3.12.

```bash
git clone --depth 1 https://github.com/NandhaKishorM/laya.git
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -e "./laya[serve]"
bun install                      # installs proxy/ and dashboard/ too
```

You also need a trained checkpoint in `checkpoints/router-v1/` (see Retraining).

## Run

```bash
bun start
```

That starts the Laya sidecar (:8765), waits until the model is loaded, then starts the router
proxy (:8787) and the stats dashboard (:8788). Ctrl+C stops all three. In another terminal:

```bash
ANTHROPIC_BASE_URL=http://localhost:8787 claude
```

Start a prompt with `>opus`, `>sonnet` or `>haiku` to force a model. Set `ROUTER_THRESHOLD`
(default 0.8) to trade Opus usage against safety.

Always run Python with `-I`, because the `laya/` clone has the same name as the package and
shadows it:

```bash
.venv/bin/python -I training/eval_router.py checkpoints/router-v1   # accuracy + confusion matrix
.venv/bin/python -I training/sweep.py                                # threshold trade-off table
bun run test                                                         # proxy tests
```

## Dashboard

A small local stats page (Vite + React + Tailwind) at http://localhost:8788, started by
`bun start`. It reads the proxy's routing log through `GET /_router/stats`.

It shows the share of prompts per model, the share of all API requests (tool steps included), a
rough cost estimate against all-Opus, Laya latency, a per-day breakdown and your recent prompts.
Everything stays on your machine.

## Retraining

1. Rebuild the dataset (`training/build_dataset.py` → `training/scrub.py` → `training/merge_dataset.py`).
2. Upload `kaggle/train_clean.csv` as a **private** Kaggle dataset version.
3. Run `kaggle/train_router.ipynb` with **Save Version → Save & Run All**, accelerator **GPU T4**,
   internet on. Check the log says `device cuda`, not `device cpu`. ~7 min.
4. Download the output zip, unzip to `checkpoints/router-vN`, run `training/eval_router.py` and `training/sweep.py`.
   A new checkpoint replaces v1 only if it beats it at `c = 0.8` (see the eval gate in the plan).

Training locally on Apple Silicon (MPS) works but is roughly 20× slower.
