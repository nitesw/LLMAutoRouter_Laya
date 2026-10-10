import { useEffect, useState } from "react";
import { Card, CardTitle } from "./components/ui/card";

const TIERS = ["haiku", "sonnet", "opus"] as const;
type Tier = (typeof TIERS)[number];
type Counts = Record<Tier, number>;
type Stats = {
  requests: number;
  prompts: number;
  byModel: Counts;
  byModelAllRequests: Counts;
  overrides: number;
  fallbacks: number;
  retries: number;
  layaMs: { p50: number | null; p95: number | null };
  costVsAllOpus: number | null;
  daily: ({ day: string } & Counts)[];
  feedback: { labeled: number; agreed: number };
  recent: {
    id: string; ts: string; model: Tier; override: boolean; fallback: boolean;
    opus: number | null; prompt: string; feedback: Tier | null;
  }[];
};

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "–");
const color = (t: Tier) => `var(--${t})`;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardTitle>{label}</CardTitle>
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>}
    </Card>
  );
}

function ShareBar({ counts }: { counts: Counts }) {
  const total = TIERS.reduce((s, t) => s + counts[t], 0);
  return (
    <div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {TIERS.filter((t) => counts[t]).map((t) => (
          <div key={t} title={`${t}: ${counts[t]}`} style={{ flex: counts[t], background: color(t) }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {TIERS.map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: color(t) }} />
            {t} <span className="tabular-nums text-[var(--muted)]">{counts[t]} · {pct(counts[t], total)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// "This prompt should have gone to <tier>". Clicks become training labels.
function FeedbackButtons({ id, value, onSaved }: { id: string; value: Tier | null; onSaved: () => void }) {
  const save = (tier: Tier) =>
    fetch("/_router/feedback", { method: "POST", body: JSON.stringify({ id, tier }) }).then(onSaved);
  return (
    <span className="flex shrink-0 gap-1">
      {TIERS.map((t) => (
        <button
          key={t}
          onClick={() => save(t)}
          title={`should be ${t}`}
          className="size-6 rounded-md border border-[var(--border)] text-xs font-medium uppercase transition-colors hover:border-[var(--muted)]"
          style={value === t ? { background: color(t), borderColor: color(t), color: "white" } : undefined}
        >
          {t[0]}
        </button>
      ))}
    </span>
  );
}

function Daily({ days }: { days: Stats["daily"] }) {
  const max = Math.max(1, ...days.map((d) => d.haiku + d.sonnet + d.opus));
  return (
    <div className="space-y-2">
      {days.slice(-14).map((d) => (
        <div key={d.day} className="flex items-center gap-3 text-sm">
          <span className="w-12 shrink-0 tabular-nums text-[var(--muted)]">{d.day.slice(5)}</span>
          <div className="flex-1">
            <div className="flex h-2.5 gap-0.5" style={{ width: `${(100 * (d.haiku + d.sonnet + d.opus)) / max}%` }}>
              {TIERS.filter((t) => d[t]).map((t) => (
                <div key={t} title={`${t}: ${d[t]}`} className="rounded-sm" style={{ flex: d[t], background: color(t) }} />
              ))}
            </div>
          </div>
          <span className="tabular-nums text-[var(--muted)]">{d.haiku + d.sonnet + d.opus}</span>
        </div>
      ))}
    </div>
  );
}

export function App() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  const load = () =>
    fetch("/_router/stats")
      .then((r) => r.json())
      .then((s) => { setStats(s); setError(false); })
      .catch(() => setError(true));

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  if (!stats) {
    return (
      <p className="p-8 text-[var(--muted)]">
        {error ? "Can't reach the router proxy on :8787. Start everything with `bun start` in the repo root." : "Loading…"}
      </p>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Router stats</h1>
        {error && <span className="text-xs text-[var(--muted)]">proxy unreachable, showing last data</span>}
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Prompts routed" value={String(stats.prompts)} hint={`${stats.requests} API requests incl. tool steps`} />
        <Stat label="Sent to Opus" value={pct(stats.byModel.opus, stats.prompts)} hint="of your prompts" />
        <Stat
          label="Cost vs all-Opus"
          value={stats.costVsAllOpus == null ? "–" : `${Math.round(stats.costVsAllOpus * 100)}%`}
          hint="rough estimate, weights 1 : 4 : 20"
        />
        <Stat label="Laya decision" value={stats.layaMs.p50 == null ? "–" : `${stats.layaMs.p50} ms`} hint={`p95 ${stats.layaMs.p95 ?? "–"} ms`} />
      </div>

      <Card>
        <CardTitle>Your prompts by model</CardTitle>
        <ShareBar counts={stats.byModel} />
      </Card>

      <Card>
        <CardTitle>All API requests by model (incl. tool steps)</CardTitle>
        <ShareBar counts={stats.byModelAllRequests} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
        <Card>
          <CardTitle>Per day (last 14)</CardTitle>
          {stats.daily.length ? <Daily days={stats.daily} /> : <p className="text-sm text-[var(--muted)]">No data yet.</p>}
          <div className="mt-4 space-y-1 border-t border-[var(--border)] pt-3 text-sm text-[var(--muted)]">
            <div>Overrides (&gt;opus etc.): <span className="text-[var(--foreground)]">{stats.overrides}</span></div>
            <div>Fallbacks to Opus: <span className="text-[var(--foreground)]">{stats.fallbacks}</span></div>
            <div>Retries after 400: <span className="text-[var(--foreground)]">{stats.retries}</span></div>
            <div>
              Labeled by you: <span className="text-[var(--foreground)]">{stats.feedback.labeled}</span>
              {stats.feedback.labeled > 0 && <> · router agreed {pct(stats.feedback.agreed, stats.feedback.labeled)}</>}
            </div>
          </div>
        </Card>

        <Card className="min-w-0">
          <CardTitle>Recent prompts · mark what each should have used</CardTitle>
          <ul className="divide-y divide-[var(--border)] text-sm">
            {stats.recent.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: color(r.model) }} title={r.model} />
                <span className="w-14 shrink-0">{r.model}</span>
                <span className="min-w-0 flex-1 truncate" title={r.prompt}>{r.prompt}</span>
                <span className="shrink-0 tabular-nums text-xs text-[var(--muted)]">
                  {r.override ? "override" : r.fallback ? "fallback" : r.opus == null ? "" : `P(opus) ${r.opus.toFixed(2)}`}
                </span>
                <FeedbackButtons id={r.id} value={r.feedback} onSaved={load} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </main>
  );
}
