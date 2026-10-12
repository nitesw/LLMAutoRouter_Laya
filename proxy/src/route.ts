import { FALLBACK_TIER, MODELS, THRESHOLD, type Tier } from "./config";
import { askLaya, touchKeepWarm } from "./laya";
import { parseOverride, stripOverride } from "./override";
import { chooseTier, type Probs } from "./policy";
import { conversationKey, recall, remember } from "./sessions";
import { classifyTurn, editFirstTyped, formatState, injectedTags, lastAssistantText } from "./turn";

export type Decision = {
  eligible: boolean;
  /** Main-loop prompt for a model you picked yourself (not Opus): logged for the dashboard, not routed. */
  observed?: boolean;
  convKey?: string;
  turnType?: "fresh" | "continuation";
  override?: Tier | null;
  probs?: Probs | null;
  tier?: Tier | null;
  layaMs?: number;
  fallbackReason?: string | null;
  injected?: string[];
  promptPreview?: string;
  state?: string;
  prevAssistant?: string;
};

/** The main agent loop: requests that carry tools. Background calls (no tools) pass through unlogged. */
export function isMainLoop(path: string, body: any): boolean {
  return path === "/v1/messages" && Array.isArray(body?.tools) && body.tools.length > 0 && Array.isArray(body?.messages);
}

/** Only Opus main-loop requests are routed; a model you chose yourself is respected. */
export function isEligible(path: string, body: any): boolean {
  return isMainLoop(path, body) && body?.model === MODELS.opus;
}

/** Decide the tier for a request; mutates body (strips an override tag). Never throws. */
// Claude Code background features (prompt suggestions, away recaps) reuse the main-loop request shape; leave them alone.
const BACKGROUND = /^(\[SUGGESTION MODE:|The user stepped away and is coming back\.)/;

export async function decide(req: Request, body: any): Promise<Decision> {
  touchKeepWarm();
  const path = new URL(req.url).pathname;
  if (!isMainLoop(path, body)) return { eligible: false };
  if (!isEligible(path, body)) return observe(body);
  const convKey = conversationKey(req, body);
  const turn = classifyTurn(body.messages);
  const base = { eligible: true, convKey, injected: injectedTags(body.messages) };

  if (turn.kind === "continuation") {
    const tier = recall(convKey);
    return { ...base, turnType: "continuation", tier, fallbackReason: tier ? null : "no sticky tier" };
  }

  if (BACKGROUND.test(turn.prompt)) return { eligible: false };
  const preview = turn.prompt.slice(0, 300);
  const prevAssistant = lastAssistantText(body.messages, turn.index).slice(0, 300);
  const override = parseOverride(turn.prompt);
  if (override) {
    editFirstTyped(body.messages, turn.index, stripOverride);
    remember(convKey, override);
    return { ...base, turnType: "fresh", override, tier: override, promptPreview: preview, prevAssistant };
  }

  const state = formatState(turn.prev, turn.prompt);
  const t0 = performance.now();
  try {
    const probs = await askLaya(state);
    const tier = chooseTier(probs, THRESHOLD);
    remember(convKey, tier);
    return { ...base, turnType: "fresh", override: null, probs, tier, layaMs: Math.round(performance.now() - t0), promptPreview: preview, state, prevAssistant };
  } catch (e) {
    remember(convKey, FALLBACK_TIER);
    return { ...base, turnType: "fresh", override: null, probs: null, tier: FALLBACK_TIER, layaMs: Math.round(performance.now() - t0),
      fallbackReason: `laya: ${(e as Error).message}`, promptPreview: preview, state, prevAssistant };
  }
}

/** Record a fresh prompt sent to a non-Opus model without touching it. Continuations and background prompts are skipped. */
function observe(body: any): Decision {
  const turn = classifyTurn(body.messages);
  if (turn.kind !== "fresh" || BACKGROUND.test(turn.prompt)) return { eligible: false };
  return { eligible: false, observed: true, turnType: "fresh", promptPreview: turn.prompt.slice(0, 300),
    state: formatState(turn.prev, turn.prompt), prevAssistant: lastAssistantText(body.messages, turn.index).slice(0, 300) };
}
