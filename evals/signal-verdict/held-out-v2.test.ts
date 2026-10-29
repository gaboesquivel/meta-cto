import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "vitest";

import { seedFeatureRequests } from "@/data/crewday/seed";

import {
  checkV2Ready,
  fingerprintPairs,
  freezeV2,
  loadHeldOutV2,
  parseHeldOutV2,
  readV2Lock,
  unconfirmedPairs,
  V2_LOCK_FILE,
  V2_SET_FILE,
  writeV2Lock,
} from "./held-out-v2";
import type { HeldOutV2Lock, HeldOutV2Pair } from "./held-out-v2";
import { loadEvalSet } from "./sets";

const NOW = new Date("2026-11-01T12:00:00.000Z");
const seedKeys = new Set(["swap-sync", "change-approvals"]);

const pair = (id: string, overrides: Partial<HeldOutV2Pair> = {}): HeldOutV2Pair => ({
  confirmedAt: "2026-10-30T10:00:00.000Z",
  confirmedBy: "Product Manager",
  draft: { description: `description ${id}`, title: `title ${id}` },
  expected: "same_need",
  id,
  note: "why this label",
  target: "swap-sync",
  ...overrides,
});

const freeze = (
  pairs: HeldOutV2Pair[],
  lock: HeldOutV2Lock | null = null,
  devTitles = new Set<string>(),
) => freezeV2({ devTitles, lock, now: NOW, pairs, seedKeys });

const frozenLock = (pairs: HeldOutV2Pair[]): HeldOutV2Lock => {
  const result = freeze(pairs);
  assert.ok(result.ok);
  return result.lock;
};

describe("Held-Out Set v2 file", () => {
  test("ships as an empty template that parses", () => {
    assert.deepEqual(loadHeldOutV2(), []);
  });

  test("ships unfrozen, so the runner refuses it until people confirm and freeze it", () => {
    assert.equal(readV2Lock(), null);
    const ready = checkV2Ready(loadHeldOutV2(), readV2Lock());
    assert.equal(ready.ok, false);
  });

  test("parses pairs with and without a confirmation", () => {
    const parsed = parseHeldOutV2([
      pair("v2-01"),
      { ...pair("v2-02"), confirmedAt: null, confirmedBy: null },
    ]);
    assert.equal(parsed.length, 2);
    assert.deepEqual(unconfirmedPairs(parsed), ["v2-02"]);
  });

  test("rejects a malformed confirmation date", () => {
    assert.throws(() => parseHeldOutV2([pair("v2-01", { confirmedAt: "last tuesday" })]));
  });

  test("v1 stays frozen and loads as before", () => {
    assert.equal(loadEvalSet("held-out").length, 25);
  });
});

describe("fingerprintPairs", () => {
  test("is stable under key order and pair order", () => {
    const a = pair("v2-01");
    const b = pair("v2-02", { expected: "related_need" });
    const reordered: HeldOutV2Pair = {
      confirmedAt: b.confirmedAt,
      confirmedBy: b.confirmedBy,
      draft: { description: b.draft.description, title: b.draft.title },
      expected: b.expected,
      id: b.id,
      note: b.note,
      target: b.target,
    };
    assert.equal(fingerprintPairs([a, b]), fingerprintPairs([reordered, a]));
    assert.match(fingerprintPairs([a]), /^sha256:[0-9a-f]{64}$/u);
  });

  test("changes when a label, draft or confirmation changes", () => {
    const base = fingerprintPairs([pair("v2-01")]);
    assert.notEqual(base, fingerprintPairs([pair("v2-01", { expected: "different" })]));
    assert.notEqual(
      base,
      fingerprintPairs([pair("v2-01", { draft: { description: "x", title: "y" } })]),
    );
    assert.notEqual(base, fingerprintPairs([pair("v2-01", { confirmedBy: "someone else" })]));
  });
});

describe("unconfirmedPairs", () => {
  test("lists pairs missing who or when", () => {
    const pairs = [
      pair("v2-01"),
      pair("v2-02", { confirmedBy: null }),
      pair("v2-03", { confirmedAt: null }),
      pair("v2-04", { confirmedBy: "  " }),
    ];
    assert.deepEqual(unconfirmedPairs(pairs), ["v2-02", "v2-03", "v2-04"]);
  });
});

describe("freezeV2", () => {
  test("records the fingerprint, counts and time once every pair is confirmed", () => {
    const pairs = [
      pair("v2-01"),
      pair("v2-02", { expected: "related_need", target: "change-approvals" }),
    ];
    const result = freeze(pairs);
    assert.ok(result.ok);
    assert.deepEqual(result.lock, {
      fingerprint: fingerprintPairs(pairs),
      frozenAt: NOW.toISOString(),
      pairs: 2,
      sameNeedPositives: 1,
      set: "held-out-v2",
    });
  });

  test("refuses an empty set", () => {
    const result = freeze([]);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.code, "empty");
  });

  test("refuses unconfirmed pairs and names them", () => {
    const result = freeze([pair("v2-01"), pair("v2-02", { confirmedBy: null })]);
    assert.equal(!result.ok && result.code, "unconfirmed");
    assert.match(result.ok ? "" : result.message, /v2-02/u);
  });

  test("refuses duplicate ids, unknown targets and Dev Set drafts", () => {
    assert.equal(freeze([pair("v2-01"), pair("v2-01")]).ok, false);
    const unknown = freeze([pair("v2-01", { target: "not-seeded" })]);
    assert.equal(!unknown.ok && unknown.code, "invalid");
    const leaked = freeze([pair("v2-01")], null, new Set(["title v2-01"]));
    assert.equal(!leaked.ok && leaked.code, "invalid");
  });

  test("refuses to freeze twice", () => {
    const pairs = [pair("v2-01")];
    const again = freeze(pairs, frozenLock(pairs));
    assert.equal(!again.ok && again.code, "already_frozen");
  });

  test("refuses to re-freeze a set changed after freeze", () => {
    const lock = frozenLock([pair("v2-01")]);
    const changed = freeze([pair("v2-01", { expected: "different" })], lock);
    assert.equal(!changed.ok && changed.code, "changed_after_freeze");
    const emptied = freeze([], lock);
    assert.equal(!emptied.ok && emptied.code, "changed_after_freeze");
  });

  test("checks every seeded target the real set could use", () => {
    const result = freezeV2({
      devTitles: new Set(),
      lock: null,
      now: NOW,
      pairs: seedFeatureRequests.map((fr, i) => pair(`v2-${i}`, { target: fr.key })),
      seedKeys: new Set(seedFeatureRequests.map((fr) => fr.key)),
    });
    assert.ok(result.ok);
  });
});

describe("checkV2Ready", () => {
  const pairs = [pair("v2-01"), pair("v2-02")];

  test("accepts a confirmed, frozen, unchanged set", () => {
    const ready = checkV2Ready(pairs, frozenLock(pairs));
    assert.deepEqual(ready, { fingerprint: fingerprintPairs(pairs), ok: true });
  });

  test("refuses an empty set", () => {
    assert.equal(checkV2Ready([], null).ok, false);
  });

  test("refuses unconfirmed pairs", () => {
    const ready = checkV2Ready([pair("v2-01", { confirmedAt: null })], null);
    assert.equal(!ready.ok && ready.code, "unconfirmed");
  });

  test("refuses a set that is not frozen", () => {
    const ready = checkV2Ready(pairs, null);
    assert.equal(!ready.ok && ready.code, "not_frozen");
  });

  test("refuses a set changed after freeze and says the reading reset", () => {
    const lock = frozenLock(pairs);
    const ready = checkV2Ready([...pairs, pair("v2-03")], lock);
    assert.equal(!ready.ok && ready.code, "changed_after_freeze");
    assert.match(ready.ok ? "" : ready.message, /changed after freeze: reading reset/u);
  });

  test("reports a set emptied after freeze as changed, not empty", () => {
    const ready = checkV2Ready([], frozenLock(pairs));
    assert.equal(!ready.ok && ready.code, "changed_after_freeze");
    assert.match(ready.ok ? "" : ready.message, /changed after freeze: reading reset/u);
  });

  test("reports a change after freeze even when a confirmation was removed", () => {
    const lock = frozenLock(pairs);
    const ready = checkV2Ready([pair("v2-01"), pair("v2-02", { confirmedBy: null })], lock);
    assert.equal(!ready.ok && ready.code, "changed_after_freeze");
  });
});

describe("lock file", () => {
  test("round-trips through a directory", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "v2-lock-"));
    assert.equal(readV2Lock(dir), null);
    const lock = frozenLock([pair("v2-01")]);
    writeV2Lock(lock, dir);
    assert.deepEqual(readV2Lock(dir), lock);
    assert.ok(readFileSync(path.join(dir, V2_LOCK_FILE), "utf-8").endsWith("\n"));
  });

  test("loads a set from a directory", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "v2-set-"));
    writeFileSync(path.join(dir, V2_SET_FILE), JSON.stringify([pair("v2-01")]));
    assert.equal(loadHeldOutV2(dir).length, 1);
  });
});
