import type { Tier } from "./config";

export type Probs = { none: number; haiku: number; sonnet: number; opus: number };
const ORDER: Tier[] = ["haiku", "sonnet", "opus"];

/** none is merged into haiku: the router never skips the LLM. */
export function collapse(p: Probs): [number, number, number] {
  return [p.none + p.haiku, p.sonnet, p.opus];
}

/** Cheapest tier whose cumulative probability of being enough reaches c (same rule as sweep.py). */
export function chooseTier(p: Probs, c: number): Tier {
  let cum = 0;
  for (const [i, v] of collapse(p).entries()) {
    cum += v;
    if (cum >= c) return ORDER[i];
  }
  return "opus";
}
