import { existsSync, readFileSync } from "node:fs";
import { LOG_DIR } from "./config";

const TIERS = ["haiku", "sonnet", "opus"] as const;
const COST = { haiku: 1, sonnet: 4, opus: 20 }; // illustrative relative weights

const tierOf = (model: string) => TIERS.find((t) => model?.includes(t)) ?? "opus";
const pct = (xs: number[], q: number) => (xs.length ? xs.sort((a, b) => a - b)[Math.floor((xs.length - 1) * q)] : null);

/** Aggregate logs/routing.jsonl for the dashboard. */
export function stats() {
  const file = LOG_DIR + "routing.jsonl";
  const rows = existsSync(file)
    ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const fresh = rows.filter((r) => r.turnType === "fresh" && !String(r.promptPreview ?? "").startsWith("[SUGGESTION MODE:"));
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
    recent: fresh.slice(-15).reverse().map((r) => ({
      ts: r.ts, model: tierOf(r.finalModel), override: !!r.override,
      opus: r.probs?.opus ?? null, prompt: r.promptPreview ?? "",
    })),
  };
}
