import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

process.env.KEEP_WARM_MS = "0";

// One mock server plays both Anthropic (/v1/messages*) and the Laya sidecar (/v1/systemone).
let mock: ReturnType<typeof Bun.serve>;
let upstreamCalls: { model: string; auth: string | null; body: any }[] = [];
let layaProbs: any = { none: 0, haiku: 0.95, sonnet: 0.04, opus: 0.01 };
let layaDelayMs = 0;
let rejectModel: string | null = null;
const logDir = mkdtempSync(tmpdir() + "/router-test-") + "/";

beforeAll(() => {
  mock = Bun.serve({
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      const body = await req.json().catch(() => null);
      if (path === "/v1/systemone") {
        await Bun.sleep(layaDelayMs);
        return Response.json({ answers: { label: { probabilities: layaProbs } } });
      }
      upstreamCalls.push({ model: body?.model, auth: req.headers.get("authorization"), body });
      if (body?.model === rejectModel) return new Response('{"error":"unsupported"}', { status: 400 });
      const stream = new ReadableStream({
        async start(c) {
          for (const ev of ["event: a\ndata: 1\n\n", "event: b\ndata: 2\n\n"]) { c.enqueue(new TextEncoder().encode(ev)); await Bun.sleep(3); }
          c.close();
        },
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream" } });
    },
  });
  process.env.UPSTREAM_URL = `http://localhost:${mock.port}`;
  process.env.LAYA_URL = `http://localhost:${mock.port}/v1/systemone`;
  process.env.LOG_DIR = logDir;
});
afterAll(() => mock.stop());
beforeEach(() => { upstreamCalls = []; layaDelayMs = 0; rejectModel = null; layaProbs = { none: 0, haiku: 0.95, sonnet: 0.04, opus: 0.01 }; });

const tools = [{ name: "Read" }];
const call = async (body: any, session = "s1") => {
  const { app } = await import("../src/index");
  return app.handle(new Request("http://proxy/v1/messages", {
    method: "POST",
    headers: { authorization: "Bearer tok", "content-type": "application/json", "x-claude-code-session-id": session },
    body: JSON.stringify(body),
  }));
};
const fresh = (text: string) => ({ model: "claude-opus-5-5", tools, messages: [{ role: "user", content: [{ type: "text", text }] }] });
const lastLog = () => JSON.parse(readFileSync(logDir + "routing.jsonl", "utf8").trim().split("\n").at(-1)!);

test("easy fresh prompt is routed down, SSE streamed unchanged, auth passed through", async () => {
  const res = await call(fresh("fix the typo"));
  expect(await res.text()).toBe("event: a\ndata: 1\n\nevent: b\ndata: 2\n\n");
  expect(upstreamCalls[0].model).toBe("claude-haiku-5-5");
  expect(upstreamCalls[0].auth).toBe("Bearer tok");
  expect(lastLog()).toMatchObject({ turnType: "fresh", tier: "haiku", finalModel: "claude-haiku-5-5" });
});

test("continuation keeps the sticky tier from its turn", async () => {
  await call(fresh("fix the typo"), "s2");
  layaProbs = { none: 0, haiku: 0, sonnet: 0, opus: 1 }; // must not be consulted
  const body = { model: "claude-opus-5-5", tools, messages: [
    { role: "user", content: "fix the typo" },
    { role: "assistant", content: [{ type: "tool_use", id: "1", name: "Read", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "1", content: "x" }] },
  ] };
  await call(body, "s2");
  expect(upstreamCalls.map((c) => c.model)).toEqual(["claude-haiku-5-5", "claude-haiku-5-5"]);
});

test(">opus override forces opus and the tag never reaches the model", async () => {
  await call(fresh(">opus fix the typo"), "s3");
  expect(upstreamCalls[0].model).toBe("claude-opus-5-5");
  expect(upstreamCalls[0].body.messages[0].content[0].text).toBe("fix the typo");
  expect(lastLog()).toMatchObject({ override: "opus", tier: "opus" });
});

test("background requests (no tools) pass through untouched", async () => {
  await call({ model: "claude-opus-5-5", messages: [{ role: "user", content: "title this" }] }, "s4");
  expect(upstreamCalls[0].model).toBe("claude-opus-5-5");
});

test("slow sidecar fails open to the original model", async () => {
  layaDelayMs = 1500;
  const res = await call(fresh("fix the typo"), "s5");
  expect(res.status).toBe(200);
  expect(upstreamCalls[0].model).toBe("claude-opus-5-5");
  expect(lastLog().fallbackReason).toContain("laya");
});

test("400 on a downgraded model retries once with the original", async () => {
  rejectModel = "claude-haiku-5-5";
  const res = await call(fresh("fix the typo"), "s6");
  expect(res.status).toBe(200);
  expect(upstreamCalls.map((c) => c.model)).toEqual(["claude-haiku-5-5", "claude-opus-5-5"]);
  expect(lastLog()).toMatchObject({ retried: true, finalModel: "claude-opus-5-5" });
});

test("prompt-suggestion requests pass through and do not touch the sticky tier", async () => {
  await call(fresh("fix the typo"), "s7");
  await call(fresh("[SUGGESTION MODE: Suggest what the user might naturally type next]"), "s7");
  expect(upstreamCalls.map((c) => c.model)).toEqual(["claude-haiku-5-5", "claude-opus-5-5"]);
});
