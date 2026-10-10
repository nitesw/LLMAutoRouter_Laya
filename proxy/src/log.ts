import { appendFileSync, mkdirSync } from "node:fs";
import { LOG_DIR } from "./config";

export function logDecision(entry: Record<string, unknown>) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_DIR + "routing.jsonl", JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
  } catch (e) {
    console.error("routing log write failed:", e);
  }
}
