import { readFileSync } from "node:fs";
import { KEEP_WARM_IDLE_MS, KEEP_WARM_MS, LAYA_TIMEOUT_MS, LAYA_URL } from "./config";
import type { Probs } from "./policy";

const QUESTIONS = JSON.parse(
  readFileSync(new URL("../../checkpoints/router-v1/questions.json", import.meta.url), "utf8"),
);

/** Ask the sidecar for tier probabilities. Throws on timeout or error; the caller fails open. */
export async function askLaya(state: string, timeoutMs = LAYA_TIMEOUT_MS): Promise<Probs> {
  const res = await fetch(process.env.LAYA_URL ?? LAYA_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "router", state, questions: QUESTIONS }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`laya ${res.status}`);
  const out = await res.json();
  const p = out?.answers?.label?.probabilities;
  if (!p || typeof p.opus !== "number") throw new Error("laya: no probabilities");
  return p as Probs;
}

let lastActivity = 0;
let warming = false;

/** Load the model onto the GPU once at startup so the first prompt is fast. */
export function warmUp() {
  askLaya("ok", 60_000).catch(() => {});
}

/** Mark Claude Code activity; pings the sidecar every KEEP_WARM_MS until idle for KEEP_WARM_IDLE_MS. */
export function touchKeepWarm() {
  lastActivity = Date.now();
  if (warming || KEEP_WARM_MS <= 0) return;
  warming = true;
  (async () => {
    while (Date.now() - lastActivity < KEEP_WARM_IDLE_MS) {
      await askLaya("ok", 5000).catch(() => {});
      await Bun.sleep(KEEP_WARM_MS);
    }
    warming = false;
  })();
}
