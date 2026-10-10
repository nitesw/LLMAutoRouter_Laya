// `bun start`: Laya sidecar → router proxy → stats dashboard, with prefixed logs. Ctrl+C stops all.
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const LAYA_PORT = process.env.LAYA_PORT ?? "8765";
const CHECKPOINT = join(ROOT, process.env.ROUTER_CHECKPOINT ?? "checkpoints/router-v1");
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : null;

const children: ReturnType<typeof Bun.spawn>[] = [];
const COLORS = { sidecar: 35, proxy: 36, dashboard: 33 } as const;
// Per-request access logs (keep-warm pings every second) are noise.
const QUIET = /"(POST \/v1\/systemone|GET \/health) HTTP/;

async function pipe(name: keyof typeof COLORS, stream: ReadableStream<Uint8Array>) {
  const tag = `\x1b[${COLORS[name]}m[${name}]\x1b[0m `;
  let buf = "";
  for await (const chunk of stream) {
    buf += new TextDecoder().decode(chunk);
    const lines = buf.split("\n");
    buf = lines.pop()!;
    for (const l of lines) if (l.trim() && !QUIET.test(l)) console.log(tag + l);
  }
}

function run(name: keyof typeof COLORS, cmd: string[], cwd: string, env: Record<string, string> = {}) {
  const p = Bun.spawn(cmd, { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  children.push(p);
  pipe(name, p.stdout);
  pipe(name, p.stderr);
  p.exited.then((code) => { if (!stopping) { console.log(`[${name}] exited (${code}), stopping`); stop(code ?? 1); } });
  return p;
}

const healthy = () => fetch(`http://127.0.0.1:${LAYA_PORT}/health`).then((r) => r.ok, () => false);

let stopping = false;
function stop(code = 0) {
  stopping = true;
  for (const c of children) c.kill();
  process.exit(code);
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

for (const need of [".venv/bin/laya-serve", "checkpoints/router-v1/model.safetensors"]) {
  if (!existsSync(join(ROOT, need))) { console.error(`missing ${need}; see README → Setup`); process.exit(1); }
}

if (await healthy()) {
  console.log(`[sidecar] already running on :${LAYA_PORT}`);
} else {
  run("sidecar", [join(ROOT, ".venv/bin/laya-serve")], ROOT, {
    LAYA_EXTRA_MODELS: JSON.stringify({ router: CHECKPOINT }),
    LAYA_MODELS: "router", LAYA_PRELOAD: "1", LAYA_PORT, LAYA_HOST: "127.0.0.1",
  });
  console.log("[sidecar] loading router-v1…");
  for (let i = 0; i < 120 && !(await healthy()); i++) await Bun.sleep(1000);
  if (!(await healthy())) { console.error("[sidecar] did not become healthy"); stop(1); }
  console.log("[sidecar] ready");
}
if (only === "sidecar") await new Promise(() => {});

run("proxy", ["bun", "src/index.ts"], join(ROOT, "proxy"));
run("dashboard", ["bun", "run", "dev"], join(ROOT, "dashboard"));
console.log("\nready → ANTHROPIC_BASE_URL=http://localhost:8787 claude    stats → http://localhost:8788\n");
