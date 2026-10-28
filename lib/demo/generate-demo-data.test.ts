import assert from "node:assert/strict";
import { describe, expect, it } from "vitest";

import { generateDemoData } from "./generate-demo-data";

describe("generateDemoData", () => {
  it("returns deterministic users for a fixed seed", () => {
    const first = generateDemoData({ rows: 3, schema: "users", seed: 99 });
    const second = generateDemoData({ rows: 3, schema: "users", seed: 99 });
    assert.deepEqual(first.records, second.records);
    expect(first.rows).toBe(3);
  });

  it("rejects row counts above the limit", () => {
    expect(() => generateDemoData({ rows: 50, schema: "orders", seed: 1 })).toThrow();
  });
});
