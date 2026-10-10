export const MODELS = {
  haiku: "claude-haiku-5-5",
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
} as const;
export type Tier = keyof typeof MODELS;

export const THRESHOLD = Number(process.env.ROUTER_THRESHOLD ?? 0.8);
export const PORT = Number(process.env.PROXY_PORT ?? 8787);
export const UPSTREAM = process.env.UPSTREAM_URL ?? "https://api.anthropic.com";
export const LAYA_URL = process.env.LAYA_URL ?? "http://127.0.0.1:8765/v1/systemone";
export const LAYA_TIMEOUT_MS = Number(process.env.LAYA_TIMEOUT_MS ?? 1000);
export const LOG_DIR = process.env.LOG_DIR ?? new URL("../../logs/", import.meta.url).pathname;
export const RECORD = process.env.RECORD === "1";
// Keep the sidecar's GPU warm while Claude Code is active (cold calls take up to ~1 s on MPS).
export const KEEP_WARM_MS = Number(process.env.KEEP_WARM_MS ?? 1000);
export const KEEP_WARM_IDLE_MS = Number(process.env.KEEP_WARM_IDLE_MS ?? 10 * 60 * 1000);
