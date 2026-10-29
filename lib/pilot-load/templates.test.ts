import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Committed templates stay empty (spec 004, decision 0004): filled pilot files and Held-Out Set
 * v2 pairs live only in the private folder. Every array must be empty and every value null.
 */
const TEMPLATES = [
  "data/pilot/answer-key.json",
  "data/pilot/backlog.json",
  "data/pilot/feedback.json",
  "data/pilot/manifest.json",
  "evals/signal-verdict/held-out-v2.json",
];

/** Paths of every value that is not an empty array, null, or an object of such. */
const contentIn = (value: unknown, at = "$"): string[] => {
  if (value === null) return [];
  if (Array.isArray(value)) return value.length === 0 ? [] : [at];
  if (typeof value === "object") {
    return Object.entries(value).flatMap(([key, v]) => contentIn(v, `${at}.${key}`));
  }
  return [at];
};

describe("committed templates", () => {
  it("detects content anywhere in a template", () => {
    assert.deepEqual(contentIn({ a: null, b: [], c: { d: null } }), []);
    assert.deepEqual(contentIn([{ key: "fb-1" }]), ["$"]);
    assert.deepEqual(contentIn({ a: { b: "x" }, c: 0.1, d: false }), ["$.a.b", "$.c", "$.d"]);
  });

  it.each(TEMPLATES)("%s has no content", (file) => {
    const json: unknown = JSON.parse(readFileSync(path.join(process.cwd(), file), "utf-8"));
    assert.deepEqual(contentIn(json), [], `${file} must stay an empty template`);
  });
});
