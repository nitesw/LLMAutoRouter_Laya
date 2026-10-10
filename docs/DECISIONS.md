# Decisions

Short records of choices that shape the project, newest last.

## 1. A local proxy, not an MCP server or skill
An MCP tool or skill runs *after* Claude Code has already sent the prompt to the model the user
selected, so it can't change which model answers. A proxy behind `ANTHROPIC_BASE_URL` sees every
request before it is sent and can rewrite `model`.

## 2. Laya as the decision engine
Laya is a single forward pass of an encoder (~421M params) that returns calibrated
probabilities, runs locally in ~50–100 ms, and can be fine-tuned in minutes. An LLM judge would be
slower, cost tokens and give no probabilities to set a threshold on.

## 3. Bun + Elysia for the proxy, with Laya as a sidecar
The user prefers TypeScript/Elysia. The framework's speed is irrelevant next to LLM latency;
the choice is about language preference. Laya stays in Python (`laya-serve`) for now. The
repo's `laya-ts` ONNX runtime can move it in-process later without changing the proxy's
interface.

## 4. Fine-tune on the user's own prompts; train on Kaggle
Zero-shot Laya was unusable (59% too weak). Training on an Apple Silicon Mac via MPS was estimated at
3+ hours, while a Kaggle T4 took ~7 minutes. Only the strictly scrubbed and privacy-reviewed file is
uploaded, to a private dataset.

## 5. Frozen real-prompt test set
293 real prompts, never trained on, with every new training row deduped against them. Synthetic
data is never used for testing, because the model scores much higher on synthetic prompts (87%)
than on real ones (70%).

## 6. router-v1 over router-v2
More synthetic data (v2) did not improve real-prompt accuracy and made the probabilities worse
for escalation (8.2% vs 3.4% too weak at c = 0.9).

## 7. Threshold c = 0.9
The user chose c = 0.9. It sends 33% of prompts to Opus (down from ~90% today) with 3.4% routed
too weak. The cautious end of the curve was preferred over maximum savings.

## 8. Overrides are rules
The classifier cannot follow "use opus" phrasing (tested). The proxy handles `!opus`, `!sonnet`
and `!haiku` prefixes with plain string matching, and strips the tag before forwarding.

## 9. Never skip the LLM (for now)
`none` predictions are routed to Haiku. Answering without a model may come later, if the logs show
it's reliable.

## 10. Sticky routing per turn
Tool-result continuations keep the model that started the turn, so the agent loop stays coherent
and the prompt cache stays warm.

## 11. Effort routing deferred
Effort/thinking-level routing is a second Laya question for later (Phase 5). The training data has
no record of past effort settings, so labels must come from real-traffic reviews.
