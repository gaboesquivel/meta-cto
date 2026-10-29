import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { seedFeatureRequests } from "@/data/crewday/seed";

import { loadEvalSet } from "./sets";

const seedKeys = new Set(seedFeatureRequests.map((fr) => fr.key));
const heldOut = loadEvalSet("held-out");
const dev = loadEvalSet("dev");

const find = (id: string) => heldOut.find((p) => p.id === id);

describe("eval sets", () => {
  test("every target is a seeded Feature Request and ids are unique", () => {
    for (const p of [...heldOut, ...dev]) assert.ok(seedKeys.has(p.target), p.id);
    const ids = [...heldOut, ...dev].map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("held-out set has about 25 pairs with every verdict", () => {
    assert.ok(heldOut.length >= 20 && heldOut.length <= 30);
    for (const verdict of ["same_need", "related_need", "different"]) {
      assert.ok(
        heldOut.some((p) => p.expected === verdict),
        verdict,
      );
    }
  });

  test("dev drafts never appear in the held-out set", () => {
    const heldOutTitles = new Set(heldOut.map((p) => p.draft.title.toLowerCase()));
    for (const p of dev) assert.ok(!heldOutTitles.has(p.draft.title.toLowerCase()), p.id);
  });

  test("includes the must-pass cases", () => {
    assert.deepEqual([find("ho-01")?.target, find("ho-01")?.expected], ["swap-sync", "same_need"]);
    assert.deepEqual(
      [find("ho-02")?.target, find("ho-02")?.expected],
      ["change-approvals", "same_need"],
    );
    assert.deepEqual(
      [find("ho-03")?.target, find("ho-03")?.expected],
      ["swap-sync", "related_need"],
    );
    assert.deepEqual(
      [find("ho-04")?.target, find("ho-04")?.expected],
      ["multi-location-view", "same_need"],
    );
    assert.deepEqual(
      [find("ho-05")?.target, find("ho-05")?.expected],
      ["change-approvals", "related_need"],
    );
  });
});
