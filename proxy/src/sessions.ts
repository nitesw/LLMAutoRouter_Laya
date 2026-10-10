import type { Tier } from "./config";

const TTL_MS = 6 * 60 * 60 * 1000;
const sticky = new Map<string, { tier: Tier; at: number }>();

export function remember(key: string, tier: Tier) {
  sticky.set(key, { tier, at: Date.now() });
  if (sticky.size > 1000) for (const [k, v] of sticky) if (Date.now() - v.at > TTL_MS) sticky.delete(k);
}

export function recall(key: string): Tier | null {
  const v = sticky.get(key);
  if (!v || Date.now() - v.at > TTL_MS) return null;
  v.at = Date.now();
  return v.tier;
}

export function conversationKey(req: Request, body: any): string {
  const id = req.headers.get("x-claude-code-session-id");
  if (id) return id;
  const first = Array.isArray(body?.messages) ? JSON.stringify(body.messages[0] ?? "") : "";
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(body?.system ?? "") + first).digest("hex").slice(0, 16);
}
