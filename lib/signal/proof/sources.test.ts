import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fingerprintPairs, V2_LOCK_FILE, V2_SET_FILE } from "@/evals/signal-verdict/held-out-v2";
import type { HeldOutV2Pair } from "@/evals/signal-verdict/held-out-v2";
import { RUN_LOG_FILE } from "@/evals/signal-verdict/run-log";
import type { RunLogEntry } from "@/evals/signal-verdict/run-log";
import { v2Readings } from "@/evals/signal-verdict/readings";
import { computeMetrics } from "@/evals/signal-verdict/metrics";
import { fingerprint, PILOT_FILES } from "@/lib/pilot-load/files";
import { pilotFixture } from "@/lib/pilot-load/fixture";

import { buildProofReport } from "./report";
import { loadProofInputs } from "./sources";
import type { ProofSourceDeps } from "./sources";

const PROMPT = "pv-current00000";
const NOW = new Date("2026-11-01T00:00:00.000Z");

const writeJson = (dir: string, file: string, value: unknown) =>
  writeFileSync(path.join(dir, file), JSON.stringify(value), "utf-8");

const pilotDir = ({ changed = false, frozen = true } = {}) => {
  const dir = mkdtempSync(path.join(tmpdir(), "proof-pilot-"));
  const files = pilotFixture();
  writeJson(dir, PILOT_FILES.answerKey, files.answerKey);
  writeJson(dir, PILOT_FILES.backlog, files.backlog);
  writeJson(dir, PILOT_FILES.feedback, files.feedback);
  writeJson(dir, PILOT_FILES.manifest, files.manifest);
  if (frozen) {
    const print = changed ? `sha256:${"0".repeat(64)}` : fingerprint(files);
    writeJson(dir, PILOT_FILES.lock, {
      accounts: 1,
      expectedBacklogDuplicateRate: 0.15,
      featureRequests: 1,
      feedback: 2,
      fingerprint: print,
      frozenAt: "2026-10-30T09:00:00.000Z",
      sharesNeed: 1,
    });
  }
  return dir;
};

const pair = (id: string): HeldOutV2Pair => ({
  confirmedAt: "2026-10-30T10:00:00.000Z",
  confirmedBy: "Product Manager",
  draft: { description: `description ${id}`, title: `title ${id}` },
  expected: "same_need",
  id,
  note: "why",
  target: "swap-sync",
});

const PAIRS = [pair("v2-01"), pair("v2-02")];
const PRINT = fingerprintPairs(PAIRS);

const entry = (overrides: Partial<RunLogEntry> = {}): RunLogEntry => {
  const metrics = computeMetrics([]);
  metrics.sameNeed = { ...metrics.sameNeed, expected: 70, predicted: 100, truePositives: 97 };
  return {
    at: "2026-10-31T10:00:00.000Z",
    counts: { completed: 160, failures: 0, pairs: 160, sameNeedPositives: 70 },
    failures: [],
    fingerprint: PRINT,
    model: "judge",
    promptVersion: PROMPT,
    readings: v2Readings({ failures: 0, metrics }),
    repeat: false,
    results: [],
    set: "held-out-v2",
    status: "completed",
    ...overrides,
  };
};

const evalDir = ({ entries = [entry()], lock = true, changed = false, emptied = false } = {}) => {
  const dir = mkdtempSync(path.join(tmpdir(), "proof-eval-"));
  let set = changed ? [...PAIRS, pair("v2-03")] : PAIRS;
  if (emptied) set = [];
  writeJson(dir, V2_SET_FILE, set);
  if (lock) {
    writeJson(dir, V2_LOCK_FILE, {
      fingerprint: PRINT,
      frozenAt: "2026-10-30T12:00:00.000Z",
      pairs: 2,
      sameNeedPositives: 2,
      set: "held-out-v2",
    });
  }
  writeFileSync(
    path.join(dir, RUN_LOG_FILE),
    entries.map((e) => JSON.stringify(e)).join("\n"),
    "utf-8",
  );
  return dir;
};

const deps = (overrides: Partial<ProofSourceDeps> = {}): ProofSourceDeps => ({
  answerKeyScores: vi.fn(() => Promise.resolve(null)),
  evalDir: evalDir(),
  now: () => NOW,
  pilotDir: pilotDir(),
  pilotMetrics: vi.fn(() => Promise.resolve(null)),
  promptVersion: () => PROMPT,
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadProofInputs", () => {
  it("reads frozen pilot files with the lock's expected rate and scores against their Answer Key", async () => {
    const d = deps();
    const inputs = await loadProofInputs(d);
    expect(inputs.generatedAt).toBe(NOW.toISOString());
    expect(inputs.pilotFiles).toMatchObject({
      backlogRequests: 1,
      changed: false,
      expectedBacklogDuplicateRate: 0.15,
      feedback: 2,
      frozen: true,
      frozenFeedback: 2,
      readable: true,
      unconfirmed: 0,
    });
    const labels = vi.mocked(d.answerKeyScores).mock.calls[0]?.[0];
    expect(labels?.feedback.map((label) => label.key)).toEqual(["fb-1", "fb-2"]);
  });

  it("flags pilot files changed after freeze and unreadable ones", async () => {
    const changed = await loadProofInputs(deps({ pilotDir: pilotDir({ changed: true }) }));
    expect(changed.pilotFiles).toMatchObject({ changed: true, readable: true, ready: false });

    vi.spyOn(console, "error").mockImplementation(() => {});
    const missingDir = path.join(tmpdir(), "no-such-dir");
    const missing = await loadProofInputs(deps({ pilotDir: missingDir }));
    expect(missing.pilotFiles.readable).toBe(false);
    const message = missing.pilotFiles.readable ? "" : missing.pilotFiles.message;
    expect(message).toMatch(/missing/iu);
    expect(message).not.toContain(missingDir);
    expect(message).not.toMatch(/ENOENT/u);
    expect(missing.answerKeyScores).toBeNull();
  });

  it("says why pilot metrics are missing: not configured or failed", async () => {
    const none = await loadProofInputs(deps());
    expect(none.pilotMetrics).toBeNull();
    expect(none.pilotMetricsError).toMatch(/database is not configured/iu);

    vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await loadProofInputs(
      deps({ pilotMetrics: () => Promise.reject(new Error("postgres://secret")) }),
    );
    expect(failed.pilotMetricsError).toMatch(/could not be read/iu);
    expect(failed.pilotMetricsError).not.toMatch(/secret/u);
  });

  it("reads the frozen v2 set and the reading for the current prompt version", async () => {
    const inputs = await loadProofInputs(deps());
    expect(inputs.heldOutV2).toMatchObject({
      changed: false,
      frozen: true,
      pairs: 2,
      readable: true,
      sameNeedPositives: 2,
    });
    expect(inputs.v2Reading).toMatchObject({
      failures: 0,
      promptVersion: PROMPT,
      sameNeed: { predicted: 100, truePositives: 97 },
      sameNeedPositives: 70,
      status: "completed",
    });
  });

  it("keeps an older prompt version's reading only as the latest, and skips repeats", async () => {
    const inputs = await loadProofInputs(
      deps({
        evalDir: evalDir({
          entries: [
            entry({ promptVersion: "pv-older000000" }),
            entry({
              at: "2026-11-01T00:00:00.000Z",
              promptVersion: "pv-older000000",
              repeat: true,
            }),
          ],
        }),
      }),
    );
    expect(inputs.v2Reading).toBeNull();
    expect(inputs.v2LatestReading).toMatchObject({
      at: "2026-10-31T10:00:00.000Z",
      promptVersion: "pv-older000000",
    });
  });

  it("reports an unreadable v2 set with a stable message, not the server path", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const dir = evalDir();
    writeFileSync(path.join(dir, V2_SET_FILE), "{not json", "utf-8");
    const inputs = await loadProofInputs(deps({ evalDir: dir }));
    expect(inputs.heldOutV2.readable).toBe(false);
    const message = inputs.heldOutV2.readable ? "" : inputs.heldOutV2.message;
    expect(message).toMatch(/not valid JSON/iu);
    expect(message).not.toContain(dir);
  });

  it("flags a v2 set changed after freeze and a set that is not frozen", async () => {
    const changed = await loadProofInputs(deps({ evalDir: evalDir({ changed: true }) }));
    expect(changed.heldOutV2).toMatchObject({ changed: true, frozen: true });

    const emptied = await loadProofInputs(deps({ evalDir: evalDir({ emptied: true }) }));
    expect(emptied.heldOutV2).toMatchObject({ changed: true, frozen: true, pairs: 0 });
    const report = buildProofReport(emptied);
    expect(report.readiness.readingResets.join(" ")).toMatch(
      /changed after freeze: reading reset/u,
    );
    const sameNeed = report.bars.find((bar) => bar.key === "sameNeedPrecision");
    expect(sameNeed?.verdict).toBe("inconclusive");
    expect(sameNeed?.reasons.join(" ")).toMatch(/reading reset/u);

    const open = await loadProofInputs(deps({ evalDir: evalDir({ lock: false }) }));
    expect(open.heldOutV2).toMatchObject({ changed: false, frozen: false });
    expect(open.v2Reading).toBeNull();
  });
});
