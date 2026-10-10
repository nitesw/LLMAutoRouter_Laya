type Block = { type?: string; text?: string; [k: string]: unknown };
type Message = { role: string; content: string | Block[] };

// Claude Code wraps injected context in XML-style tags (<system-reminder>, command wrappers, ...).
const INJECTED = /^\s*<([a-zA-Z][\w-]*)[\s>]/;

export const isInjected = (text: string) => INJECTED.test(text);
export const injectedTag = (text: string) => INJECTED.exec(text)?.[1] ?? null;

const blocksOf = (m: Message): Block[] =>
  typeof m.content === "string" ? [{ type: "text", text: m.content }] : Array.isArray(m.content) ? m.content : [];

/** Index of the last user-role message (the list can also contain system-role entries). */
export function lastUserIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.role === "user") return i;
  return -1;
}

const hasToolResult = (m: Message) => blocksOf(m).some((b) => b.type === "tool_result");

/** What the user actually typed in a message: text blocks minus injected ones. */
export function typedText(m: Message): string {
  return blocksOf(m)
    .filter((b) => b.type === "text" && typeof b.text === "string" && !isInjected(b.text))
    .map((b) => b.text as string)
    .join("\n")
    .trim();
}

export type Turn =
  | { kind: "fresh"; index: number; prompt: string; prev: string }
  | { kind: "continuation" };

/** Fresh = the last user message has no tool_result and contains typed text. */
export function classifyTurn(messages: Message[]): Turn {
  const i = lastUserIndex(messages);
  if (i < 0 || hasToolResult(messages[i])) return { kind: "continuation" };
  const prompt = typedText(messages[i]);
  if (!prompt) return { kind: "continuation" };
  let prev = "";
  for (let j = i - 1; j >= 0; j--) {
    const m = messages[j];
    if (m.role !== "user" || hasToolResult(m)) continue;
    prev = typedText(m);
    if (prev) break;
  }
  return { kind: "fresh", index: i, prompt, prev };
}

/** Same input format the evaluated numbers came from (build_dataset.py::text). */
export function formatState(prev: string, prompt: string): string {
  return (prev ? `[previous: ${prev.slice(0, 200)}]\n` : "") + prompt.slice(0, 2000);
}

/** Apply fn to the first typed (non-injected) text block of messages[index], in place. */
export function editFirstTyped(messages: Message[], index: number, fn: (t: string) => string) {
  const m = messages[index];
  if (typeof m.content === "string") { m.content = fn(m.content); return; }
  const b = m.content.find((x) => x.type === "text" && typeof x.text === "string" && !isInjected(x.text));
  if (b) b.text = fn(b.text as string);
}

/** Tag names of injected blocks in the last user message, for logging. */
export function injectedTags(messages: Message[]): string[] {
  const i = lastUserIndex(messages);
  if (i < 0) return [];
  return blocksOf(messages[i]).flatMap((b) => (b.type === "text" && b.text ? [injectedTag(b.text)].filter(Boolean) as string[] : []));
}
