import { useEffect, useState } from "react";
import { Card, CardTitle } from "./components/ui/card";

const TIERS = ["haiku", "sonnet", "opus"] as const;
type Tier = (typeof TIERS)[number];
const TAGS = ["continuation", "needs-context", "trivial", "cant-tell", "cancelled"] as const;
const TAG_HINTS: Record<(typeof TAGS)[number], string> = {
  continuation: "A short reply to Claude's last message (\"done\", \"ok\", \"continue\"). Its tier depends on the work, not the words.",
  "needs-context": "Looks easy but needs codebase or conversation knowledge to do well.",
  trivial: "Would be fine on Haiku whatever the context (rename, small edit, quick question).",
  "cant-tell": "The prompt text alone can't decide the tier. Kept out of training.",
  cancelled: "You sent it but interrupted or revoked it before it was answered. Kept out of training.",
};
type Tag = (typeof TAGS)[number];
type Counts = Record<Tier, number>;
type Stats = {
  requests: number;
  prompts: number;
  byModel: Counts;
  byModelAllRequests: Counts;
  overrides: number;
  passthrough: number;
  fallbacks: number;
  retries: number;
  layaMs: { p50: number | null; p95: number | null };
  costVsAllOpus: number | null;
  daily: ({ day: string } & Counts)[];
  feedback: { labeled: number; agreed: number };
  recent: {
    id: string; ts: string; model: Tier; override: boolean; passthrough: boolean; fallback: boolean;
    opus: number | null; probs: Record<string, number> | null; layaMs: number | null; fallbackReason: string | null;
    prompt: string; prevAssistant: string; state: string; feedback: Tier | null; tags: Tag[];
  }[];
};

const PAGE_SIZE = 10;
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

type Recent = Stats["recent"][number];

// Why the label is what it is. Tags are for analysis, except cant-tell and cancelled, which keep the row out of training.
function TagChips({ id, tags, onSaved }: { id: string; tags: Tag[]; onSaved: () => void }) {
  const toggle = (t: Tag) =>
    fetch("/_router/feedback", {
      method: "POST",
      body: JSON.stringify({ id, tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] }),
    }).then(onSaved);
  return (
    <ul className="space-y-2">
      {TAGS.map((t) => (
        <li key={t} className="flex items-start gap-3">
          <button
            onClick={() => toggle(t)}
            className="shrink-0 rounded-full border px-2.5 py-0.5 text-xs transition-colors"
            style={tags.includes(t) ? { background: "var(--foreground)", color: "var(--background)", borderColor: "var(--foreground)" } : { borderColor: "var(--border)" }}
          >
            {t}
          </button>
          <span className="text-xs text-[var(--muted)]">{TAG_HINTS[t]}</span>
        </li>
      ))}
    </ul>
  );
}

function DetailSheet({ r, onClose, onSaved }: { r: Recent; onClose: () => void; onSaved: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{title}</h3>
      {children}
    </section>
  );
  const box = "max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-[var(--border)] p-3 text-sm";
  return (
    <div className="fixed inset-0 z-10 flex justify-end bg-black/50" onClick={onClose}>
      <aside className="h-full w-full max-w-lg space-y-5 overflow-y-auto border-l border-[var(--border)] bg-[var(--background)] p-5" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: color(r.model) }} />
            <span className="font-medium">routed to {r.model}</span>
            <span className="text-xs text-[var(--muted)]">{new Date(r.ts).toLocaleString()}</span>
          </div>
          <button onClick={onClose} className="rounded-md border border-[var(--border)] px-2 py-0.5 text-sm" title="Close (Esc)">✕</button>
        </header>

        <Section title="Should have used">
          <FeedbackButtons id={r.id} value={r.feedback} onSaved={onSaved} />
        </Section>

        <Section title="Your prompt (first 300 characters)">
          <div className={box}>{r.prompt}</div>
        </Section>

        <Section title="Claude's last message (first 300 characters)">
          <div className={box}>{r.prevAssistant || <span className="text-[var(--muted)]">none logged</span>}</div>
        </Section>

        <Section title="Why was it routed here?">
          <div className="space-y-1 text-sm">
            {r.override && <div>Forced by an override tag, Laya was not asked.</div>}
            {r.passthrough && <div>Sent to the model you picked in Claude Code (/model). Not routed.</div>}
            {r.fallback && <div>Laya failed ({r.fallbackReason}), so the fallback tier was used.</div>}
            {r.probs && (
              <div className="tabular-nums text-[var(--muted)]">
                {Object.entries(r.probs).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(" · ")}
                {r.layaMs != null && ` · ${r.layaMs} ms`}
              </div>
            )}
          </div>
        </Section>

        <Section title="Tags (what kind of prompt is this?)">
          <TagChips id={r.id} tags={r.tags} onSaved={onSaved} />
        </Section>
      </aside>
    </div>
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(0);

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

  const pages = stats ? Math.max(1, Math.ceil(stats.recent.length / PAGE_SIZE)) : 1;
  const current = Math.min(page, pages - 1);

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
            <div>Not routed (/model not Opus): <span className="text-[var(--foreground)]">{stats.passthrough ?? 0}</span></div>
            <div>Fallbacks to Opus: <span className="text-[var(--foreground)]">{stats.fallbacks}</span></div>
            <div>Retries after 400: <span className="text-[var(--foreground)]">{stats.retries}</span></div>
            <div>
              Labeled by you: <span className="text-[var(--foreground)]">{stats.feedback.labeled}</span>
              {stats.feedback.labeled > 0 && <> · router agreed {pct(stats.feedback.agreed, stats.feedback.labeled)}</>}
            </div>
          </div>
        </Card>

        <Card className="min-w-0">
          <CardTitle>Recent prompts · click one for details</CardTitle>
          <ul className="divide-y divide-[var(--border)] text-sm">
            {stats.recent.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((r) => (
              <li key={r.id} className="py-2">
                <div className="flex cursor-pointer items-center gap-3" onClick={() => setOpenId(r.id)}>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: color(r.model) }} title={r.model} />
                  <span className="w-14 shrink-0">{r.model}</span>
                  <span className="min-w-0 flex-1 truncate" title={r.prompt}>{r.prompt}</span>
                  <span className="shrink-0 tabular-nums text-xs text-[var(--muted)]">
                    {r.passthrough ? "your pick" : r.override ? "override" : r.fallback ? "fallback" : r.opus == null ? "" : `P(opus) ${r.opus.toFixed(2)}`}
                  </span>
                  {r.tags.length > 0 && <span className="shrink-0 text-xs text-[var(--muted)]" title={r.tags.join(", ")}>{r.tags.length} tag{r.tags.length > 1 ? "s" : ""}</span>}
                  <span onClick={(e) => e.stopPropagation()}><FeedbackButtons id={r.id} value={r.feedback} onSaved={load} /></span>
                </div>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3 text-sm">
              <button
                onClick={() => setPage(current - 1)}
                disabled={current === 0}
                className="rounded-md border border-[var(--border)] px-3 py-1 disabled:opacity-40"
              >
                ← Newer
              </button>
              <span className="tabular-nums text-[var(--muted)]">Page {current + 1} of {pages}</span>
              <button
                onClick={() => setPage(current + 1)}
                disabled={current >= pages - 1}
                className="rounded-md border border-[var(--border)] px-3 py-1 disabled:opacity-40"
              >
                Older →
              </button>
            </nav>
          )}
        </Card>
      </div>
      {stats.recent.find((r) => r.id === openId) && (
        <DetailSheet r={stats.recent.find((r) => r.id === openId)!} onClose={() => setOpenId(null)} onSaved={load} />
      )}
    </main>
  );
}
