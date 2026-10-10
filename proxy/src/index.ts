import { Elysia } from "elysia";
import { MODELS, PORT, RECORD, THRESHOLD } from "./config";
import { passthrough, relay, sendUpstream } from "./forward";
import { logDecision } from "./log";
import { record } from "./record";
import { warmUp } from "./laya";
import { decide } from "./route";
import { saveFeedback, stats } from "./stats";

async function handleMessages(request: Request): Promise<Response> {
  const raw = await request.text();
  let body: any;
  try { body = JSON.parse(raw); } catch { return relay(await sendUpstream(request, raw)); }

  const originalModel = body.model;
  const d = await decide(request, body);
  if (!d.eligible) {
    const res = await sendUpstream(request, raw);
    if (RECORD) record(request, body, res.status);
    return relay(res);
  }

  const finalModel = d.tier ? MODELS[d.tier] : originalModel;
  let res = await sendUpstream(request, JSON.stringify({ ...body, model: finalModel }));
  let retried = false, upstreamError: string | undefined;
  if (res.status === 400 && finalModel !== originalModel) {
    upstreamError = (await res.text()).slice(0, 300);
    res = await sendUpstream(request, JSON.stringify({ ...body, model: originalModel }));
    retried = true;
  }
  if (RECORD) record(request, body, res.status);
  const { eligible, ...rest } = d;
  logDecision({ id: crypto.randomUUID(), ...rest, originalModel, finalModel: retried ? originalModel : finalModel, status: res.status, retried, upstreamError });
  return relay(res);
}

async function handle(request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === "/_router/stats") return Response.json(stats());
  if (path === "/_router/feedback" && request.method === "POST") {
    const ok = saveFeedback(await request.json().catch(() => null));
    return Response.json({ ok }, { status: ok ? 200 : 400 });
  }
  if (request.method === "POST" && path === "/v1/messages") return handleMessages(request);
  if (!RECORD || request.method !== "POST") return passthrough(request);
  const raw = await request.text();
  let body: any = null;
  try { body = JSON.parse(raw); } catch {}
  const res = await sendUpstream(request, raw);
  record(request, body, res.status);
  return relay(res);
}

export const app = new Elysia().all("*", ({ request }) => handle(request), { parse: "none" });

if (import.meta.main) {
  app.listen(PORT);
  warmUp();
  console.log(`router proxy on http://localhost:${PORT}  threshold ${THRESHOLD}${RECORD ? "  (recording shapes)" : ""}`);
}
