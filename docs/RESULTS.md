# Results log

All evaluations use the same frozen test set: **293 real prompts** (sonnet 187, haiku 68, opus 30,
none 8), held out from every training run. Labels were assigned by a model from the first ~200
characters of each prompt, so some "errors" are label noise. With 293 prompts, differences under
~3 points are within noise.

"Too weak" means the router picked a cheaper tier than the label.

## Data

| Set | Rows | Source |
|---|---|---|
| Real prompts extracted | 1,475 | `~/.claude/history.jsonl` (session transcripts added only system noise) |
| Real, after strict scrub and privacy review | 997 train + 293 test | 184 rows dropped for sensitive content |
| Synthetic v1 | 240 | balanced 60 per tier |
| Synthetic v2 | 1,085 more | 4 themed sets (web, Python/data, native/mobile, planning/multilingual) |
| Restyled synthetic | 1,325 | rewritten toward the user's voice by hand |

Style gap that remains: real prompts have a median of 118 characters, 70% start lowercase and 83%
have no final punctuation. Restyled synthetic prompts have a median of 58 characters, 98% start
lowercase and 99% have no final punctuation. The real prompts are longer, more context-heavy and
messier.

## Runs

### Laya zero-shot (no fine-tuning)
Exact 14.3%, within one tier 51.5%, too weak **59.4%**. It mostly predicted `none`.
Unusable without fine-tuning, which matches Laya's docs (base checkpoints are near chance on custom
decisions).

### router-v1: 1,238 rows (real + 240 synthetic), 8 epochs, soft-CE, shuffled options, Kaggle T4
Training took ~7 minutes. Calibration-slice accuracy went from 9% to 71% and ECE from 0.55 to 0.10.

| | none | haiku | sonnet | opus |
|---|---|---|---|---|
| **none** | 2 | 3 | 2 | 1 |
| **haiku** | 0 | 32 | 32 | 4 |
| **sonnet** | 1 | 16 | 151 | 19 |
| **opus** | 0 | 3 | 14 | 13 |

Rows are the label, columns the prediction. Exact 67.6%, within one tier 96.2%, too weak 11.6%.
For reference, always choosing Sonnet would score 63.8% exact.

### router-v2: 2,322 rows (997 real + 1,325 restyled synthetic)
Calibration-slice accuracy reached 87%, but that slice is mostly synthetic. On the real test set:
exact 70.0%, within one tier 98.0%, too weak 13.0%, and 10/30 opus prompts reached Opus.
It's a tie with v1 on argmax and **worse for escalation** (see below). The model fits synthetic
prompts better than real ones.

## Escalation sweep (`sweep.py`)

Rule: choose the cheapest tier whose cumulative probability (`none + haiku`, `sonnet`, `opus`)
reaches `c`. A `none` prediction is merged into Haiku. Cost uses illustrative weights
Haiku 1 : Sonnet 4 : Opus 20.

| Router | c | → Opus | → Sonnet | → Haiku | Too weak | Opus found | Cost vs all-Opus |
|---|---|---|---|---|---|---|---|
| v1 | argmax | 12% | 67% | 21% | 12.6% | 13/30 | 26% |
| v1 | 0.7 | 16% | 72% | 12% | 6.8% | 15/30 | 31% |
| v1 | 0.8 | 20% | 70% | 10% | 4.4% | 19/30 | 35% |
| **v1** | **0.9** | **33%** | **66%** | **1%** | **3.4%** | **21/30** | **46%** |
| v2 | 0.9 | 17% | 69% | 14% | 8.2% | 16/30 | 32% |
| v1+v2 avg | 0.9 | 28% | 65% | 7% | 3.4% | 21/30 | 42% |
| Always Sonnet | — | 0% | 100% | 0% | 10.2% | 0/30 | 20% |
| Always Opus | — | 100% | 0% | 0% | 0% | 30/30 | 100% |

**Chosen: v1 at c = 0.9.** At c = 0.9 almost nothing goes to Haiku (1%), so most savings come
from moving Opus traffic to Sonnet. The v1+v2 average matches v1's safety with slightly less Opus,
but it needs two models loaded. Revisit it once there is real-traffic data.

## Explicit model requests

Tested at c = 0.9: `use opus for this one` went to Sonnet, `!opus rename…` went to Sonnet, and
`just use sonnet` went to Opus. The classifier does not follow instructions, so overrides are
implemented as rules in the proxy.
