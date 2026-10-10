import { appendFileSync, mkdirSync } from "node:fs";
import { LOG_DIR } from "./config";

type Block = { type?: string; text?: string };

/** Sanitized request shape for Step 0: structure only, no prompt text, no header values. */
export function shapeOf(req: Request, body: any) {
  const blocks = (content: unknown) =>
    typeof content === "string"
      ? [{ type: "string", reminder: content.startsWith("<system-reminder>") }]
      : Array.isArray(content)
        ? (content as Block[]).map((b) => ({
            type: b?.type,
            ...(b?.type === "text" ? { reminder: (b.text ?? "").startsWith("<system-reminder>"), tag: /^\s*<([a-zA-Z][\w-]*)[\s>]/.exec(b.text ?? "")?.[1] ?? null, len: (b.text ?? "").length } : {}),
          }))
        : [];
  return {
    ts: new Date().toISOString(),
    method: req.method,
    path: new URL(req.url).pathname,
    headerNames: [...req.headers.keys()].sort(),
    authScheme: (req.headers.get("authorization") ?? "").split(" ")[0] || (req.headers.has("x-api-key") ? "x-api-key" : "none"),
    model: body?.model,
    bodyKeys: body ? Object.keys(body).sort() : [],
    metadataKeys: body?.metadata ? Object.keys(body.metadata) : [],
    thinking: body?.thinking ? Object.keys(body.thinking) : undefined,
    toolCount: Array.isArray(body?.tools) ? body.tools.length : 0,
    systemLen: typeof body?.system === "string" ? body.system.length : Array.isArray(body?.system) ? body.system.length : 0,
    messages: Array.isArray(body?.messages) ? body.messages.slice(-4).map((m: any) => ({ role: m.role, blocks: blocks(m.content) })) : [],
    messageCount: Array.isArray(body?.messages) ? body.messages.length : 0,
  };
}

export function record(req: Request, body: any, status: number) {
  mkdirSync(LOG_DIR, { recursive: true });
  appendFileSync(LOG_DIR + "shapes.jsonl", JSON.stringify({ ...shapeOf(req, body), status }) + "\n");
}
