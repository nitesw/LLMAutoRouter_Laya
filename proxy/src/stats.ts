import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { LOG_DIR } from "./config";

const TIERS = ["haiku", "sonnet", "opus"] as const;
const COST = { haiku: 1, sonnet: 4, opus: 20 }; // illustrative relative weights

/** Why a label is what it is. `cant-tell` (prompt text alone cannot decide it) and `cancelled` (sent, then revoked) are kept out of training. */
export const TAGS = ["continuation", "needs-context", "trivial", "cant-tell", "cancelled"] as const;

const tierOf = (model: string) => TIERS.find((t) => model?.includes(t)) ?? "opus";
const pct = (xs: number[], q: number) => (xs.length ? xs.sort((a, b) => a - b)[Math.floor((xs.length - 1) * q)] : null);

const readJsonl = (name: string): any[] =>
  existsSync(LOG_DIR + name)
    ? readFileSync(LOG_DIR + name, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
const idOf = (r: any): string => r.id ?? r.ts; // rows logged before ids existed use their timestamp

/** Latest feedback row per prompt id. Each row is complete (tier and tags merged), so the last one wins. */
const latestFeedback = () => new Map<string, any>(readJsonl("feedback.jsonl").map((f) => [f.id, f]));

/** Store "this prompt should have gone to <tier>" and/or reason tags with the exact Laya input, for retraining. */
export function saveFeedback(body: any): boolean {
  if (!body || typeof body.id !== "string") return false;
  if (body.tier !== undefined && !TIERS.includes(body.tier)) return false;
  if (body.tags !== undefined && !(Array.isArray(body.tags) && body.tags.every((t: any) => TAGS.includes(t)))) return false;
  if (body.tier === undefined && body.tags === undefined) return false;
  const row = readJsonl("routing.jsonl").find((r) => idOf(r) === body.id);
  if (!row) return false;
  const prev = latestFeedback().get(body.id);
  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(LOG_DIR + "feedback.jsonl", JSON.stringify({
    ts: new Date().toISOString(), id: body.id, tier: body.tier ?? prev?.tier ?? null, tags: [...new Set<string>(body.tags ?? prev?.tags ?? [])],
    routed: tierOf(row.finalModel),
    state: row.state ?? row.promptPreview ?? "", prompt: row.promptPreview ?? "", prevAssistant: row.prevAssistant ?? "",
  }) + "\n");
  return true;
}

/** Aggregate logs/routing.jsonl (+ feedback.jsonl, latest click per id wins) for the dashboard. */
export function stats() {
  const rows = readJsonl("routing.jsonl");
  const feedback = latestFeedback();
  const fresh = rows.filter((r) => r.turnType === "fresh" && !/^(\[SUGGESTION MODE:|The user stepped away and is coming back\.)/.test(String(r.promptPreview ?? "")));
  const count = (rs: any[]) => Object.fromEntries(TIERS.map((t) => [t, rs.filter((r) => tierOf(r.finalModel) === t).length]));

  const days: Record<string, Record<string, number>> = {};
  for (const r of fresh) {
    const d = (days[r.ts.slice(0, 10)] ??= { haiku: 0, sonnet: 0, opus: 0 });
    d[tierOf(r.finalModel)]++;
  }
  const cost = rows.reduce((s, r) => s + COST[tierOf(r.finalModel)], 0);
  const laya = fresh.map((r) => r.layaMs).filter((x) => typeof x === "number");

  return {
    requests: rows.length,
    prompts: fresh.length,
    byModel: count(fresh),
    byModelAllRequests: count(rows),
    overrides: fresh.filter((r) => r.override).length,
    passthrough: fresh.filter((r) => r.passthrough).length,
    fallbacks: rows.filter((r) => r.fallbackReason && r.turnType === "fresh").length,
    retries: rows.filter((r) => r.retried).length,
    layaMs: { p50: pct(laya, 0.5), p95: pct(laya, 0.95) },
    costVsAllOpus: rows.length ? cost / (rows.length * COST.opus) : null,
    daily: Object.entries(days).sort().map(([day, c]) => ({ day, ...c })),
    feedback: {
      labeled: [...feedback.values()].filter((f) => f.tier).length,
      agreed: fresh.filter((r) => feedback.get(idOf(r))?.tier === tierOf(r.finalModel)).length,
    },
    recent: fresh.slice(-200).reverse().map((r) => ({
      id: idOf(r), ts: r.ts, model: tierOf(r.finalModel), override: !!r.override, passthrough: !!r.passthrough, fallback: !!r.fallbackReason,
      opus: r.probs?.opus ?? null, probs: r.probs ?? null, layaMs: r.layaMs ?? null, fallbackReason: r.fallbackReason ?? null,
      prompt: r.promptPreview ?? "", prevAssistant: r.prevAssistant ?? "", state: r.state ?? "", feedback: feedback.get(idOf(r))?.tier ?? null, tags: feedback.get(idOf(r))?.tags ?? [],
    })),
  };
}
