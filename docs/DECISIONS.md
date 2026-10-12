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

## 7. Threshold c = 0.9 (superseded by 14)
The user chose c = 0.9. It sends 33% of prompts to Opus (down from ~90% today) with 3.4% routed
too weak. The cautious end of the curve was preferred over maximum savings.

## 8. Overrides are rules
The classifier cannot follow "use opus" phrasing (tested). The proxy handles `>opus`, `>sonnet`
and `>haiku` prefixes with plain string matching, and strips the tag before forwarding.
The prefix was first `!`, but Claude Code treats a leading `!` as bash mode, so the prompt never
reaches the proxy. `>` has no meaning in Claude Code's prompt box.

## 9. Never skip the LLM (for now)
`none` predictions are routed to Haiku. Answering without a model may come later, if the logs show
it's reliable.

## 10. Sticky routing per turn
Tool-result continuations keep the model that started the turn, so the agent loop stays coherent
and the prompt cache stays warm.

## 11. Effort routing deferred
Effort/thinking-level routing is a second Laya question for later (Phase 5). The training data has
no record of past effort settings, so labels must come from real-traffic reviews.

## 12. Keep the sidecar warm (superseded by 15)
In the first real session, every Laya call timed out at 300 ms. On MPS a cold call after a few
seconds idle takes 150 ms to 1 s, while a warm one takes ~40–70 ms. The proxy now pings the sidecar
every second while Claude Code has been active in the last 10 minutes, and the timeout is 1 s as a
safety margin. CPU inference was slower (200–450 ms) and is not used.

## 13. Prompt suggestions are not routed
Claude Code's prompt-suggestion feature sends main-loop-shaped requests whose text starts with
`[SUGGESTION MODE:`. They pass through untouched and don't change the conversation's sticky tier.

## 14. Threshold lowered to c = 0.8
After the first working sessions the user switched to c = 0.8: 20% of prompts to Opus and 4.4%
routed too weak (19/30 hard prompts reach Opus), at ~35% of all-Opus cost. `ROUTER_THRESHOLD`
overrides it without a code change.

## 15. No keep-warm; Laya always decides
Keep-warm pings held the GPU at 50–70%. The user would rather wait ~1 s on a cold call. The model
warms once at startup, there are no pings (`KEEP_WARM_MS=0`), and the timeout is 10 s, so a cold
Laya still makes the decision itself.

## 16. Fallback is Sonnet, and only when Laya is down
A Laya failure (crash, error, timeout) routes to `FALLBACK_TIER`, which defaults to Sonnet. It is
never Opus by default. A slow or cold Laya is not a failure.

## 17. Feedback buttons are the source of real labels
The router under-uses Haiku because the original labels lean toward Sonnet. Instead of more
synthetic data, the user labels real prompts from the dashboard (`H / S / O`). The next retrain
waits for ~150–200 clicks. Acknowledgement routing stays an open problem (`docs/PLAN.md`).

## 18. Never close quiet streams
"API Error: Connection lost mid-response" during Advising was the proxy, not Anthropic. The response
stream goes silent while the advisor or a long thinking step runs, and Bun's server closed the
connection after ~30 s of no bytes (reproduced with a mock upstream). The proxy now listens with
`idleTimeout: 0`. The advisor and any other request content are forwarded untouched, as before.

## 19. Your own model choice is logged, never rerouted
Only Opus main-loop requests are routed. When Claude Code asks for Sonnet or Haiku (you picked it
with `/model`), the request goes through unchanged, but the fresh prompt is still logged with
`passthrough: true` so it shows on the dashboard ("your pick") and can get feedback clicks.
