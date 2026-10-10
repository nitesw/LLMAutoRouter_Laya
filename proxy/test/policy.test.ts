import { expect, test } from "bun:test";
import fixture from "./fixtures/policy.json";
import { chooseTier } from "../src/policy";

test("chooseTier matches the Python sweep rule on all held-out probability vectors", () => {
  const mismatches = fixture.rows.filter((r) => chooseTier(r.probs, fixture.threshold) !== r.tier);
  expect(mismatches.length).toBe(0);
  expect(fixture.rows.length).toBe(293);
});

test("none is never chosen; it counts toward haiku", () => {
  expect(chooseTier({ none: 0.95, haiku: 0, sonnet: 0.05, opus: 0 }, 0.9)).toBe("haiku");
});
