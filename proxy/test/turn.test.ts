import { expect, test } from "bun:test";
import { classifyTurn, editFirstTyped, formatState, lastAssistantText } from "../src/turn";

const R = "<system-reminder>ctx</system-reminder>";

test("fresh prompt: reminders skipped, system-role entry after it ignored", () => {
  const msgs: any = [
    { role: "user", content: [{ type: "text", text: R }, { type: "text", text: "fix the typo" }] },
    { role: "system", content: [{ type: "text", text: "x" }] },
  ];
  expect(classifyTurn(msgs)).toEqual({ kind: "fresh", index: 0, prompt: "fix the typo", prev: "" });
});

test("tool_result turn is a continuation even with a reminder text block", () => {
  const msgs: any = [
    { role: "user", content: "do it" },
    { role: "assistant", content: [{ type: "tool_use", id: "1" }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "1" }, { type: "text", text: R }] },
  ];
  expect(classifyTurn(msgs).kind).toBe("continuation");
});

test("previous prompt skips tool loops and injected-only messages", () => {
  const msgs: any = [
    { role: "user", content: [{ type: "text", text: "first ask" }] },
    { role: "assistant", content: [{ type: "tool_use", id: "1" }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "1" }] },
    { role: "assistant", content: [{ type: "text", text: "done" }] },
    { role: "user", content: [{ type: "text", text: "<command-name>/compact</command-name>" }] },
    { role: "assistant", content: [{ type: "text", text: "ok" }] },
    { role: "user", content: [{ type: "text", text: "thanks" }] },
  ];
  const t = classifyTurn(msgs);
  expect(t).toEqual({ kind: "fresh", index: 6, prompt: "thanks", prev: "first ask" });
});

test("message with only injected text is not a fresh prompt", () => {
  expect(classifyTurn([{ role: "user", content: [{ type: "text", text: R }] }] as any).kind).toBe("continuation");
});

test("formatState matches the evaluated training format", () => {
  expect(formatState("", "hi")).toBe("hi");
  expect(formatState("a".repeat(300), "hi")).toBe(`[previous: ${"a".repeat(200)}]\nhi`);
});

test("editFirstTyped changes only the typed block", () => {
  const msgs: any = [{ role: "user", content: [{ type: "text", text: R }, { type: "text", text: ">opus go" }] }];
  editFirstTyped(msgs, 0, (t) => t.replace(">opus ", ""));
  expect(msgs[0].content).toEqual([{ type: "text", text: R }, { type: "text", text: "go" }]);
});

test("lastAssistantText finds the latest assistant text before the prompt", () => {
  const msgs: any = [
    { role: "assistant", content: [{ type: "text", text: "old" }] },
    { role: "user", content: "x" },
    { role: "assistant", content: [{ type: "tool_use", id: "1" }] },
    { role: "assistant", content: [{ type: "text", text: "please test and say done" }] },
    { role: "user", content: "done" },
  ];
  expect(lastAssistantText(msgs, 4)).toBe("please test and say done");
  expect(lastAssistantText(msgs, 0)).toBe("");
});
