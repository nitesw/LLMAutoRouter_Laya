import { FALLBACK_TIER, MODELS, THRESHOLD, type Tier } from "./config";
import { askLaya, touchKeepWarm } from "./laya";
import { parseOverride, stripOverride } from "./override";
import { chooseTier, type Probs } from "./policy";
import { conversationKey, recall, remember } from "./sessions";
import { classifyTurn, editFirstTyped, formatState, injectedTags, lastAssistantText } from "./turn";

export type Decision = {
  eligible: boolean;
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

/** Only the main agent loop is routed: Opus requests that carry tools. Background calls pass through. */
export function isEligible(path: string, body: any): boolean {
  return path === "/v1/messages" && body?.model === MODELS.opus
    && Array.isArray(body?.tools) && body.tools.length > 0 && Array.isArray(body?.messages);
}

/** Decide the tier for a request; mutates body (strips an override tag). Never throws. */
// Claude Code background features (prompt suggestions, away recaps) reuse the main-loop request shape; leave them alone.
const BACKGROUND = /^(\[SUGGESTION MODE:|The user stepped away and is coming back\.)/;

export async function decide(req: Request, body: any): Promise<Decision> {
  touchKeepWarm();
  if (!isEligible(new URL(req.url).pathname, body)) return { eligible: false };
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
