import { expect, test } from "bun:test";
import { parseOverride, stripOverride } from "../src/override";

test("prefix tags force a tier, case-insensitive", () => {
  expect(parseOverride(">opus fix x")).toBe("opus");
  expect(parseOverride("  >Haiku do y")).toBe("haiku");
  expect(parseOverride(">sonnet")).toBe("sonnet");
});

test("tags elsewhere or partial words do not match", () => {
  expect(parseOverride("fix x >opus")).toBeNull();
  expect(parseOverride(">opusx do it")).toBeNull();
  expect(parseOverride("use opus for this")).toBeNull();
});

test("strip removes only the leading tag", () => {
  expect(stripOverride(">opus fix the >opus typo")).toBe("fix the >opus typo");
});
