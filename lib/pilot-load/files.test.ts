import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "vitest";

import {
  answerKeyFor,
  answerKeyLabels,
  checkPilotReady,
  fingerprint,
  freezePilot,
  PILOT_FILES,
  readPilotFiles,
  readPilotLock,
  writePilotLock,
} from "./files";
import type { PilotFiles, PilotLock } from "./files";
import { at, pilotFixture } from "./fixture";

const NOW = new Date("2026-10-28T12:00:00.000Z");

const frozenLock = (files: PilotFiles): PilotLock => {
  const result = freezePilot({ files, lock: null, now: NOW });
  assert.ok(result.ok, result.ok ? "" : result.message);
  return result.lock;
};

describe("fingerprint", () => {
  it("ignores key order and array order of keyed entries", () => {
    const files = pilotFixture();
    const reordered = pilotFixture();
    reordered.feedback.reverse();
    reordered.answerKey.reverse();
    reordered.manifest = { ...reordered.manifest };
    assert.equal(fingerprint(files), fingerprint(reordered));
    assert.match(fingerprint(files), /^sha256:[0-9a-f]{64}$/u);
  });

  it("moves when the backlog, feedback, Answer Key or manifest changes", () => {
    const base = fingerprint(pilotFixture());
    const edits: ((f: PilotFiles) => void)[] = [
      (f) => (at(f.backlog.featureRequests, 0).title = "Swap shifts"),
      (f) => (at(f.feedback, 0).description = "changed"),
      (f) => (at(f.answerKey, 1).sharesNeedWith = "fr-swap"),
      (f) => (at(f.answerKey, 0).confirmedBy = "Someone else"),
      (f) => (f.manifest.expectedBacklogDuplicateRate = 0.2),
    ];
    for (const edit of edits) {
      const files = pilotFixture();
      edit(files);
      assert.notEqual(fingerprint(files), base);
    }
  });
});

describe("checkPilotReady", () => {
  it("is ready once frozen and unchanged", () => {
    const files = pilotFixture();
    const status = checkPilotReady(files, frozenLock(files));
    assert.equal(status.ready, true);
    assert.equal(status.frozen, true);
    assert.equal(status.changed, false);
    assert.deepEqual(status.unconfirmed, []);
    assert.deepEqual(status.counts, {
      accounts: 1,
      answerKey: 2,
      featureRequests: 1,
      feedback: 2,
      noMatch: 1,
      sharesNeed: 1,
      unconfirmed: 0,
    });
  });

  it("reports unconfirmed Answer Key entries", () => {
    const files = pilotFixture();
    at(files.answerKey, 0).confirmedBy = "  ";
    at(files.answerKey, 1).confirmedAt = null;
    const status = checkPilotReady(files, null);
    assert.equal(status.ready, false);
    assert.equal(status.frozen, false);
    assert.deepEqual(status.unconfirmed, ["fb-1", "fb-2"]);
    assert.equal(status.counts.unconfirmed, 2);
    assert.ok(status.messages.some((m) => m.includes("unconfirmed")));
  });

  it("detects a change after freeze as a reset reading", () => {
    const files = pilotFixture();
    const lock = frozenLock(files);
    at(files.answerKey, 1).sharesNeedWith = "fr-swap";
    const status = checkPilotReady(files, lock);
    assert.equal(status.ready, false);
    assert.equal(status.frozen, true);
    assert.equal(status.changed, true);
    assert.ok(status.messages.some((m) => m.includes("changed after freeze: reading reset")));
  });

  it("reports feedback without an Answer Key entry and broken references", () => {
    const files = pilotFixture();
    files.answerKey.pop();
    at(files.answerKey, 0).sharesNeedWith = "fr-missing";
    const status = checkPilotReady(files, null);
    assert.equal(status.ready, false);
    assert.ok(status.problems.some((p) => p.includes("fb-2")));
    assert.ok(status.problems.some((p) => p.includes("fr-missing")));
  });
});

describe("freezePilot", () => {
  it("records the fingerprint and counts", () => {
    const files = pilotFixture();
    const lock = frozenLock(files);
    assert.equal(lock.fingerprint, fingerprint(files));
    assert.equal(lock.frozenAt, NOW.toISOString());
    assert.equal(lock.expectedBacklogDuplicateRate, 0.15);
    assert.equal(lock.feedback, 2);
  });

  it("refuses empty, unconfirmed, unstated-rate and rule-breaking sets", () => {
    const cases: [string, (f: PilotFiles) => void][] = [
      [
        "empty",
        (f) => {
          f.feedback = [];
          f.answerKey = [];
        },
      ],
      ["unconfirmed", (f) => (at(f.answerKey, 0).confirmedAt = null)],
      ["invalid", (f) => (f.manifest.expectedBacklogDuplicateRate = null)],
      ["invalid", (f) => (at(f.answerKey, 0).confirmedBy = "Gabo (author)")],
      ["invalid", (f) => (f.manifest.feedbackGenerator.family = "Claude")],
      ["invalid", (f) => f.feedback.push({ ...at(f.feedback, 0), key: "fb-1" })],
    ];
    for (const [code, edit] of cases) {
      const files = pilotFixture();
      edit(files);
      const result = freezePilot({ files, lock: null, now: NOW });
      assert.equal(result.ok, false);
      assert.equal(result.ok ? null : result.code, code);
    }
  });

  it("freezes once; a changed set is refused", () => {
    const files = pilotFixture();
    const lock = frozenLock(files);
    const again = freezePilot({ files, lock, now: NOW });
    assert.equal(again.ok ? null : again.code, "already_frozen");
    at(files.feedback, 0).title = "changed";
    const changed = freezePilot({ files, lock, now: NOW });
    assert.equal(changed.ok ? null : changed.code, "changed_after_freeze");
  });
});

describe("answerKeyFor", () => {
  it("returns the shared-need backlog key, null for none, undefined for unknown items", () => {
    const files = pilotFixture();
    assert.deepEqual(answerKeyFor(files, "fb-1"), { confirmed: true, sharesNeedWith: "fr-swap" });
    assert.deepEqual(answerKeyFor(files, "fb-2"), { confirmed: true, sharesNeedWith: null });
    assert.equal(answerKeyFor(files, "fb-404"), undefined);
  });
});

describe("answerKeyLabels", () => {
  it("gives every Answer Key entry with whether a person confirmed it, for scoring", () => {
    const files = pilotFixture();
    const [first] = files.answerKey;
    assert.ok(first);
    files.answerKey = [{ ...first, confirmedBy: null }, ...files.answerKey.slice(1)];
    assert.deepEqual(answerKeyLabels(files), [
      { confirmed: false, feedback: "fb-1", sharesNeedWith: "fr-swap" },
      { confirmed: true, feedback: "fb-2", sharesNeedWith: null },
    ]);
  });
});

describe("pilot files on disk", () => {
  it("reads, and round-trips the lock", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "pilot-"));
    const files = pilotFixture();
    writeFileSync(path.join(dir, PILOT_FILES.manifest), JSON.stringify(files.manifest));
    writeFileSync(path.join(dir, PILOT_FILES.backlog), JSON.stringify(files.backlog));
    writeFileSync(path.join(dir, PILOT_FILES.feedback), JSON.stringify(files.feedback));
    writeFileSync(path.join(dir, PILOT_FILES.answerKey), JSON.stringify(files.answerKey));
    const read = readPilotFiles(dir);
    assert.equal(fingerprint(read), fingerprint(files));
    assert.equal(readPilotLock(dir), null);
    const lock = frozenLock(read);
    writePilotLock(lock, dir);
    assert.deepEqual(readPilotLock(dir), lock);
    assert.ok(readFileSync(path.join(dir, PILOT_FILES.lock), "utf-8").endsWith("\n"));
  });

  it("the shipped templates are empty, valid and unfrozen", () => {
    const files = readPilotFiles();
    assert.equal(files.backlog.featureRequests.length, 0);
    assert.equal(files.feedback.length, 0);
    assert.equal(files.answerKey.length, 0);
    assert.equal(readPilotLock(), null);
    const status = checkPilotReady(files, null);
    assert.equal(status.ready, false);
    assert.deepEqual(status.problems, []);
  });
});
