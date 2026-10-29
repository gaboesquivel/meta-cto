import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { computeMetrics } from "@/evals/signal-verdict/metrics";
import { v2Readings } from "@/evals/signal-verdict/readings";
import { PILOT_WORKSPACE } from "@/lib/signal/pilot";
import { createRepository } from "@/lib/signal/repository";
import type { SignalRepository } from "@/lib/signal/repository";
import type { NewEvalRun, PilotGroundTruthInput } from "@/lib/signal/repository-pilot-data";
import { createTestDb } from "@/lib/signal/test-db";

import { readProofLocks } from "./locks";
import type { HeldOutV2Lock, PilotLock, ProofLocks } from "./locks";
import { buildProofReport } from "./report";
import { getProofReport, loadProofInputs, repositoryProofStore } from "./sources";
import type { ProofSourceDeps } from "./sources";

/**
 * The Proof Report's sources (spec 004): database records (PGlite with the real migrations) and
 * the committed freeze locks. No pilot or v2 content file is read.
 */

const PROMPT = "pv-current00000";
const NOW = new Date("2026-11-01T00:00:00.000Z");
const PILOT_PRINT = `sha256:${"a".repeat(64)}`;
const V2_PRINT = `sha256:${"b".repeat(64)}`;
const OTHER_PRINT = `sha256:${"c".repeat(64)}`;

const pilotLock = (overrides: Partial<PilotLock> = {}): PilotLock => ({
  accounts: 1,
  expectedBacklogDuplicateRate: 0.15,
  featureRequests: 1,
  feedback: 2,
  fingerprint: PILOT_PRINT,
  frozenAt: "2026-10-30T09:00:00.000Z",
  sharesNeed: 1,
  ...overrides,
});

const v2Lock = (overrides: Partial<HeldOutV2Lock> = {}): HeldOutV2Lock => ({
  fingerprint: V2_PRINT,
  frozenAt: "2026-10-30T12:00:00.000Z",
  pairs: 160,
  sameNeedPositives: 70,
  set: "held-out-v2",
  ...overrides,
});

const locks = (
  pilot: PilotLock | null = pilotLock(),
  v2: HeldOutV2Lock | null = v2Lock(),
): ProofLocks => ({ pilot: { lock: pilot, ok: true }, v2: { lock: v2, ok: true } });

const groundTruth = (
  workspaceId: string,
  overrides: Partial<PilotGroundTruthInput> = {},
): PilotGroundTruthInput => ({
  answerKey: [
    {
      confirmedAt: "2026-10-27",
      confirmedBy: "Rosa",
      key: "fr-swap",
      kind: "feature_request",
      needId: "swap",
    },
    {
      confirmedAt: "2026-10-27",
      confirmedBy: "Rosa",
      key: "fb-1",
      kind: "feedback",
      needId: "swap",
    },
    { confirmedAt: null, confirmedBy: null, key: "fb-2", kind: "feedback", needId: "payroll" },
  ],
  counts: { accounts: 1, featureRequests: 1, feedback: 2, sharesNeed: 1 },
  expectedBacklogDuplicateRate: 0.2,
  feedback: ["fb-1", "fb-2", "fb-3"].map((key) => ({
    accountId: null,
    accountKey: "acme",
    customerName: "Ana",
    customerRole: "Shift lead",
    description: `secret feedback ${key}`,
    key,
    title: `title ${key}`,
  })),
  fingerprint: PILOT_PRINT,
  manifest: { backlogAuthor: "Gabo" },
  now: new Date("2026-10-30T10:00:00.000Z"),
  workspaceId,
  ...overrides,
});

const readings = () => {
  const metrics = computeMetrics([]);
  metrics.sameNeed = { ...metrics.sameNeed, expected: 70, predicted: 100, truePositives: 97 };
  metrics.relatedNeed = { ...metrics.relatedNeed, predicted: 100, truePositives: 90 };
  return v2Readings({ failures: 0, metrics });
};

const evalRun = (overrides: Partial<NewEvalRun> = {}): NewEvalRun => ({
  completed: 160,
  createdAt: new Date("2026-10-31T10:00:00.000Z"),
  failureDetails: [],
  failures: 0,
  fingerprint: V2_PRINT,
  message: null,
  model: "judge",
  pairs: 160,
  promptVersion: PROMPT,
  readings: readings(),
  repeat: false,
  results: [{ expected: "same_need", id: "v2-secret-pair", predicted: "same_need" }],
  sameNeedPositives: 70,
  setName: "held-out-v2",
  status: "completed",
  ...overrides,
});

let repo: SignalRepository;
let workspaceId: string;

beforeEach(async () => {
  repo = createRepository(await createTestDb());
  ({ id: workspaceId } = await repo.ensureWorkspace(PILOT_WORKSPACE));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const deps = (overrides: Partial<ProofSourceDeps> = {}): ProofSourceDeps => ({
  locks: () => locks(),
  now: () => NOW,
  pilotMetrics: vi.fn(() => Promise.resolve(null)),
  promptVersion: () => PROMPT,
  store: () => repositoryProofStore(repo),
  ...overrides,
});

describe("loadProofInputs: pilot data", () => {
  it("reads stored ground truth under its lock and scores the stored Answer Key", async () => {
    await repo.storePilotGroundTruth(groundTruth(workspaceId));
    const inputs = await loadProofInputs(deps());
    expect(inputs.generatedAt).toBe(NOW.toISOString());
    expect(inputs.pilotFiles).toMatchObject({
      backlogRequests: 1,
      changed: false,
      expectedBacklogDuplicateRate: 0.15,
      feedback: 3,
      frozen: true,
      frozenAt: "2026-10-30T09:00:00.000Z",
      // The stored feedback count, not the lock's.
      frozenFeedback: 3,
      loaded: true,
      loadedAt: "2026-10-30T10:00:00.000Z",
      readable: true,
      ready: false,
      unconfirmed: 1,
    });
    // Scored from the stored labels: nothing filed yet, so no actions.
    expect(inputs.answerKeyScores?.agentCorrectness.actions).toBe(0);
  });

  it("says 'changed after freeze: reading reset' when the stored fingerprint differs from the lock", async () => {
    await repo.storePilotGroundTruth(groundTruth(workspaceId, { fingerprint: OTHER_PRINT }));
    const inputs = await loadProofInputs(deps());
    expect(inputs.pilotFiles).toMatchObject({ changed: true, loaded: true, ready: false });
    const report = buildProofReport(inputs);
    expect(report.readiness.readingResets.join(" ")).toMatch(
      /changed after freeze: reading reset/u,
    );
    const intake = report.bars.find((bar) => bar.key === "intakeDuplicateRate");
    expect(intake?.verdict).toBe("inconclusive");
    expect(intake?.reasons.join(" ")).toMatch(/reading reset/u);
  });

  it("reads Inconclusive with 'pilot data not loaded' before a load, using the lock's counts", async () => {
    const inputs = await loadProofInputs(deps());
    expect(inputs.pilotFiles).toMatchObject({
      backlogRequests: 1,
      feedback: 2,
      frozen: true,
      frozenFeedback: 2,
      loaded: false,
      loadedAt: null,
      ready: false,
    });
    expect(inputs.answerKeyScores).toBeNull();
    const report = buildProofReport(inputs);
    expect(report.verdict).toBe("inconclusive");
    const intake = report.bars.find((bar) => bar.key === "intakeDuplicateRate");
    expect(intake?.reasons.join(" ")).toMatch(/pilot data not loaded/iu);
  });

  it("is not loaded when the Pilot Workspace does not exist, and never creates it", async () => {
    const empty = createRepository(await createTestDb());
    const inputs = await loadProofInputs(deps({ store: () => repositoryProofStore(empty) }));
    expect(inputs.pilotFiles).toMatchObject({ loaded: false });
    expect(await empty.findWorkspace(PILOT_WORKSPACE.slug)).toBeNull();
  });

  it("is not frozen without a lock, and loaded data then has no lock to compare with", async () => {
    await repo.storePilotGroundTruth(groundTruth(workspaceId));
    const inputs = await loadProofInputs(deps({ locks: () => locks(null) }));
    expect(inputs.pilotFiles).toMatchObject({
      changed: false,
      expectedBacklogDuplicateRate: 0.2,
      frozen: false,
      frozenAt: null,
      loaded: true,
    });
  });

  it("reads 'pilot data not loaded' and 'no v2 reading' without a database, never an error", async () => {
    const report = await getProofReport(deps({ store: () => null }));
    expect(report.verdict).toBe("inconclusive");
    const text = report.bars.flatMap((bar) => bar.reasons).join(" ");
    expect(text).toMatch(/pilot data not loaded/iu);
    expect(text).toMatch(/no v2 reading/iu);
  });

  it("reports an unreadable lock or a failed read with a stable message, not the raw error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const unreadable = await loadProofInputs(
      deps({
        locks: () => ({
          pilot: { error: new SyntaxError("Unexpected token in /srv/app/data"), ok: false },
          v2: { error: new Error("boom"), ok: false },
        }),
      }),
    );
    expect(unreadable.pilotFiles).toEqual({
      message: "a lock file is not valid JSON.",
      readable: false,
    });
    expect(unreadable.heldOutV2.readable).toBe(false);

    const failing = await loadProofInputs(
      deps({
        store: () => ({
          answerKeyScores: () => Promise.reject(new Error("postgres://secret")),
          pilotGroundTruth: () => Promise.reject(new Error("postgres://secret")),
          v2Reading: () => Promise.reject(new Error("postgres://secret")),
        }),
      }),
    );
    expect(failing.pilotFiles.readable).toBe(false);
    expect(JSON.stringify(failing)).not.toMatch(/secret/u);
  });

  it("says why pilot metrics are missing: not configured or failed", async () => {
    const none = await loadProofInputs(deps());
    expect(none.pilotMetricsError).toMatch(/database is not configured/iu);

    vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await loadProofInputs(
      deps({ pilotMetrics: () => Promise.reject(new Error("postgres://secret")) }),
    );
    expect(failed.pilotMetricsError).toMatch(/could not be read/iu);
    expect(failed.pilotMetricsError).not.toMatch(/secret/u);
  });
});

describe("loadProofInputs: Held-Out Set v2", () => {
  it("reads the frozen set from its lock and the stored reading for the current prompt version", async () => {
    await repo.recordEvalRun(evalRun());
    const inputs = await loadProofInputs(deps());
    expect(inputs.heldOutV2).toEqual({
      changed: false,
      frozen: true,
      frozenAt: "2026-10-30T12:00:00.000Z",
      message: null,
      pairs: 160,
      readable: true,
      sameNeedPositives: 70,
    });
    expect(inputs.v2Reading).toEqual({
      at: "2026-10-31T10:00:00.000Z",
      failures: 0,
      promptVersion: PROMPT,
      relatedNeed: { predicted: 100, truePositives: 90 },
      sameNeed: { predicted: 100, truePositives: 97 },
      sameNeedPositives: 70,
      status: "completed",
    });
    const report = buildProofReport(inputs);
    const sameNeed = report.bars.find((bar) => bar.key === "sameNeedPrecision");
    expect(sameNeed?.verdict).toBe("pass");
    expect(report.bars.find((bar) => bar.key === "relatedNeedPrecision")?.verdict).toBe("pass");
  });

  it("keeps an older prompt version's reading only as the latest, and skips repeats", async () => {
    await repo.recordEvalRun(evalRun({ promptVersion: "pv-older000000" }));
    await repo.recordEvalRun(
      evalRun({
        createdAt: new Date("2026-11-01T00:00:00.000Z"),
        promptVersion: "pv-older000000",
        repeat: true,
      }),
    );
    const inputs = await loadProofInputs(deps());
    expect(inputs.v2Reading).toBeNull();
    expect(inputs.v2LatestReading).toMatchObject({
      at: "2026-10-31T10:00:00.000Z",
      promptVersion: "pv-older000000",
    });
  });

  it("reads 'no v2 reading' when nothing is stored", async () => {
    const report = buildProofReport(await loadProofInputs(deps()));
    const sameNeed = report.bars.find((bar) => bar.key === "sameNeedPrecision");
    expect(sameNeed?.verdict).toBe("inconclusive");
    expect(sameNeed?.reasons.join(" ")).toMatch(/no v2 reading/iu);
  });

  it("resets the reading when the latest stored run is from another fingerprint than the lock", async () => {
    await repo.recordEvalRun(evalRun());
    await repo.recordEvalRun(
      evalRun({ createdAt: new Date("2026-11-01T00:00:00.000Z"), fingerprint: OTHER_PRINT }),
    );
    const inputs = await loadProofInputs(deps());
    expect(inputs.heldOutV2).toMatchObject({ changed: true, frozen: true });
    const report = buildProofReport(inputs);
    expect(report.readiness.readingResets.join(" ")).toMatch(
      /changed after freeze: reading reset/u,
    );
    const sameNeed = report.bars.find((bar) => bar.key === "sameNeedPrecision");
    expect(sameNeed?.verdict).toBe("inconclusive");
    expect(sameNeed?.reasons.join(" ")).toMatch(/reading reset/u);
  });

  it("has no reading when the set is not frozen", async () => {
    await repo.recordEvalRun(evalRun());
    const inputs = await loadProofInputs(deps({ locks: () => locks(pilotLock(), null) }));
    expect(inputs.heldOutV2).toMatchObject({ changed: false, frozen: false, pairs: 0 });
    expect(inputs.v2Reading).toBeNull();
    expect(inputs.v2LatestReading).toBeNull();
  });
});

const lockRoot = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "proof-locks-"));
  mkdirSync(path.join(dir, "data/pilot"), { recursive: true });
  mkdirSync(path.join(dir, "evals/signal-verdict"), { recursive: true });
  return dir;
};

describe("readProofLocks", () => {
  it("reads the two committed locks, and treats a missing lock as not frozen", () => {
    const dir = lockRoot();
    writeFileSync(path.join(dir, "data/pilot/pilot.lock.json"), JSON.stringify(pilotLock()));
    expect(readProofLocks(dir)).toEqual({
      pilot: { lock: pilotLock(), ok: true },
      v2: { lock: null, ok: true },
    });
  });

  it("returns the error for a malformed lock", () => {
    const dir = lockRoot();
    writeFileSync(path.join(dir, "evals/signal-verdict/held-out-v2.lock.json"), "{not json");
    const read = readProofLocks(dir);
    expect(read.v2.ok).toBe(false);
  });
});
