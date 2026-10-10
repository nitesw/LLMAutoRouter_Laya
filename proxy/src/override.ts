import type { Tier } from "./config";

const TAG = /^\s*>(opus|sonnet|haiku)\b\s*/i;

export function parseOverride(text: string): Tier | null {
  const m = TAG.exec(text);
  return m ? (m[1].toLowerCase() as Tier) : null;
}

export function stripOverride(text: string): string {
  return text.replace(TAG, "");
}
