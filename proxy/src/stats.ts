import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { LOG_DIR } from "./config";

const TIERS = ["haiku", "sonnet", "opus"] as const;
const COST = { haiku: 1, sonnet: 4, opus: 20 }; // illustrative relative weights

const tierOf = (model: string) => TIERS.find((t) => model?.includes(t)) ?? "opus";
const pct = (xs: number[], q: number) => (xs.length ? xs.sort((a, b) => a - b)[Math.floor((xs.length - 1) * q)] : null);

const readJsonl = (name: string): any[] =>
  existsSync(LOG_DIR + name)
    ? readFileSync(LOG_DIR + name, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
const idOf = (r: any): string => r.id ?? r.ts; // rows logged before ids existed use their timestamp

/** Store "this prompt should have gone to <tier>" with the exact Laya input, for retraining. */
export function saveFeedback(body: any): boolean {
  if (!body || typeof body.id !== "string" || !TIERS.includes(body.tier)) return false;
  const row = readJsonl("routing.jsonl").find((r) => idOf(r) === body.id);
  if (!row) return false;
  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(LOG_DIR + "feedback.jsonl", JSON.stringify({
    ts: new Date().toISOString(), id: body.id, tier: body.tier, routed: tierOf(row.finalModel),
    state: row.state ?? row.promptPreview ?? "", prompt: row.promptPreview ?? "", prevAssistant: row.prevAssistant ?? "",
  }) + "\n");
  return true;
}

/** Aggregate logs/routing.jsonl (+ feedback.jsonl, latest click per id wins) for the dashboard. */
export function stats() {
  const rows = readJsonl("routing.jsonl");
  const feedback = new Map<string, string>(readJsonl("feedback.jsonl").map((f) => [f.id, f.tier]));
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
    fallbacks: rows.filter((r) => r.fallbackReason && r.turnType === "fresh").length,
    retries: rows.filter((r) => r.retried).length,
    layaMs: { p50: pct(laya, 0.5), p95: pct(laya, 0.95) },
    costVsAllOpus: rows.length ? cost / (rows.length * COST.opus) : null,
    daily: Object.entries(days).sort().map(([day, c]) => ({ day, ...c })),
    feedback: {
      labeled: feedback.size,
      agreed: fresh.filter((r) => feedback.get(idOf(r)) === tierOf(r.finalModel)).length,
    },
    recent: fresh.slice(-30).reverse().map((r) => ({
      id: idOf(r), ts: r.ts, model: tierOf(r.finalModel), override: !!r.override, fallback: !!r.fallbackReason,
      opus: r.probs?.opus ?? null, prompt: r.promptPreview ?? "", feedback: feedback.get(idOf(r)) ?? null,
    })),
  };
}
