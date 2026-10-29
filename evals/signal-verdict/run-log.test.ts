import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "vitest";

import {
  appendRunLog,
  currentPromptVersion,
  currentV2Reading,
  isRepeatRun,
  promptVersion,
  readRunLog,
  RUN_LOG_FILE,
} from "./run-log";
import type { RunLogEntry } from "./run-log";

const config = {
  model: "anthropic/claude-sonnet-5.5",
  outputSchema: "{}",
  system: "judge",
  userTemplate: "<draft>",
};

const entry = (overrides: Partial<RunLogEntry> = {}): RunLogEntry => ({
  at: "2026-11-01T12:00:00.000Z",
  counts: { completed: 2, failures: 0, pairs: 2, sameNeedPositives: 1 },
  failures: [],
  fingerprint: "sha256:abc",
  model: "anthropic/claude-sonnet-5.5",
  promptVersion: "pv-1",
  repeat: false,
  results: [],
  set: "held-out-v2",
  status: "completed",
  ...overrides,
});

describe("promptVersion", () => {
  test("is a short stable hash of the judge configuration", () => {
    assert.match(promptVersion(config), /^pv-[0-9a-f]{12}$/u);
    assert.equal(promptVersion(config), promptVersion({ ...config }));
  });

  test("changes with the system prompt, user template, output schema or model", () => {
    const base = promptVersion(config);
    assert.notEqual(base, promptVersion({ ...config, system: "judge v2" }));
    assert.notEqual(base, promptVersion({ ...config, userTemplate: "<draft2>" }));
    assert.notEqual(base, promptVersion({ ...config, outputSchema: "{ }" }));
    assert.notEqual(base, promptVersion({ ...config, model: "openai/gpt" }));
  });

  test("derives the current version from the judge without calling a model", () => {
    const current = currentPromptVersion();
    assert.match(current.id, /^pv-[0-9a-f]{12}$/u);
    assert.ok(current.model.length > 0);
    assert.equal(currentPromptVersion().id, current.id);
  });
});

describe("isRepeatRun", () => {
  const key = { fingerprint: "sha256:abc", promptVersion: "pv-1", set: "held-out-v2" };

  test("is false with no earlier run", () => {
    assert.equal(isRepeatRun([], key), false);
  });

  test("is true after a completed or failed run on the same set and prompt version", () => {
    assert.equal(isRepeatRun([entry()], key), true);
    assert.equal(isRepeatRun([entry({ status: "failed" })], key), true);
  });

  test("ignores refused runs, other prompt versions, other fingerprints and other sets", () => {
    assert.equal(isRepeatRun([entry({ status: "refused" })], key), false);
    assert.equal(isRepeatRun([entry({ promptVersion: "pv-2" })], key), false);
    assert.equal(isRepeatRun([entry({ fingerprint: "sha256:def" })], key), false);
    assert.equal(isRepeatRun([entry({ set: "held-out" })], key), false);
  });

  test("ignores a run that failed before any pair reached the judge", () => {
    const preJudge = entry({
      counts: { completed: 0, failures: 0, pairs: 2, sameNeedPositives: 1 },
      status: "failed",
    });
    assert.equal(isRepeatRun([preJudge], key), false);
  });
});

describe("run log file", () => {
  test("appends one JSON line per run and reads them back", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "run-log-"));
    assert.deepEqual(readRunLog(dir), []);
    appendRunLog(entry(), dir);
    appendRunLog(entry({ repeat: true }), dir);
    const lines = readFileSync(path.join(dir, RUN_LOG_FILE), "utf-8").trim().split("\n");
    assert.equal(lines.length, 2);
    const entries = readRunLog(dir);
    assert.equal(entries.length, 2);
    assert.equal(entries[1]?.repeat, true);
  });
});

describe("currentV2Reading", () => {
  const lock = { fingerprint: "sha256:abc" };

  test("is the latest non-repeat run on the frozen fingerprint", () => {
    const older = entry({ promptVersion: "pv-1" });
    const newer = entry({ promptVersion: "pv-2" });
    const repeat = entry({ promptVersion: "pv-2", repeat: true });
    const refused = entry({ status: "refused" });
    assert.equal(currentV2Reading([older, newer, repeat, refused], lock), newer);
  });

  test("is null without a lock, for other sets, or after the set changed", () => {
    assert.equal(currentV2Reading([entry()], null), null);
    assert.equal(currentV2Reading([entry({ set: "held-out" })], lock), null);
    assert.equal(currentV2Reading([entry({ fingerprint: "sha256:old" })], lock), null);
  });

  test("skips runs that failed before any pair reached the judge", () => {
    const judged = entry({ promptVersion: "pv-1" });
    const preJudge = entry({
      counts: { completed: 0, failures: 0, pairs: 2, sameNeedPositives: 1 },
      promptVersion: "pv-2",
      status: "failed",
    });
    assert.equal(currentV2Reading([judged, preJudge], lock), judged);
    assert.equal(currentV2Reading([preJudge], lock), null);
  });
});
