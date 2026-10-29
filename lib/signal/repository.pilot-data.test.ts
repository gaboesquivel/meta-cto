import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { beforeEach, describe, it } from "vitest";

import type { SignalDb } from "./db";
import { PILOT_WORKSPACE } from "./pilot";
import { createRepository } from "./repository";
import type { SignalRepository } from "./repository";
import type { NewEvalRun, PilotGroundTruthInput } from "./repository-pilot-data";
import { evalRuns, pilotAnswerKey, pilotFeedback, pilotLoads } from "./schema";
import { createTestDb } from "./test-db";

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
    { confirmedAt: null, confirmedBy: "Rosa", key: "fb-2", kind: "feedback", needId: "payroll" },
  ],
  counts: { accounts: 1, featureRequests: 1, feedback: 2, sharesNeed: 1 },
  expectedBacklogDuplicateRate: 0.15,
  feedback: [
    {
      accountId: null,
      accountKey: "acme",
      customerName: "Ana",
      customerRole: "Shift lead",
      description: "Let my team trade shifts.",
      key: "fb-1",
      title: "Trade shifts",
    },
    {
      accountId: null,
      accountKey: "acme",
      customerName: "Bo",
      customerRole: "Owner",
      description: "Export payroll.",
      key: "fb-2",
      title: "Payroll export",
    },
  ],
  fingerprint: "sha256:one",
  manifest: { backlogAuthor: "Gabo", expectedBacklogDuplicateRate: 0.15 },
  workspaceId,
  ...overrides,
});

const run = (overrides: Partial<NewEvalRun> = {}): NewEvalRun => ({
  completed: 2,
  createdAt: new Date("2026-11-01T12:00:00.000Z"),
  failureDetails: [],
  failures: 0,
  fingerprint: "sha256:v2",
  message: null,
  model: "test/judge",
  pairs: 2,
  promptVersion: "pv-1",
  readings: { sameNeed: { predicted: 1, truePositives: 1 } },
  repeat: false,
  results: [{ expected: "same_need", id: "v2-001", predicted: "same_need" }],
  sameNeedPositives: 1,
  setName: "held-out-v2",
  status: "completed",
  ...overrides,
});

describe("pilot ground truth", () => {
  let db: SignalDb;
  let repo: SignalRepository;
  let workspaceId: string;

  beforeEach(async () => {
    db = await createTestDb();
    repo = createRepository(db);
    ({ id: workspaceId } = await repo.ensureWorkspace(PILOT_WORKSPACE));
  });

  const rowCount = async (
    table: typeof pilotLoads | typeof pilotFeedback | typeof pilotAnswerKey,
  ) => {
    const rows = await db.select().from(table);
    return rows.length;
  };

  it("reads nothing before a load, and finds the Pilot Workspace without creating it", async () => {
    assert.equal(await repo.pilotGroundTruth(workspaceId), null);
    assert.deepEqual(await repo.pilotLoadHistory(workspaceId), []);
    const found = await repo.findWorkspace(PILOT_WORKSPACE.slug);
    assert.equal(found?.id, workspaceId);
    assert.equal(await repo.findWorkspace("nowhere"), null);
  });

  it("stores the feedback set, Answer Key and manifest with the fingerprint", async () => {
    const stored = await repo.storePilotGroundTruth(
      groundTruth(workspaceId, { now: new Date("2026-11-02T00:00:00.000Z") }),
    );
    assert.equal(stored.outcome, "loaded");
    assert.equal(stored.load.reset, false);

    const truth = await repo.pilotGroundTruth(workspaceId);
    assert.ok(truth);
    assert.equal(truth.fingerprint, "sha256:one");
    assert.equal(truth.loadedAt, "2026-11-02T00:00:00.000Z");
    assert.equal(truth.feedbackCount, 2);
    assert.equal(truth.expectedBacklogDuplicateRate, 0.15);
    assert.deepEqual(truth.manifest, { backlogAuthor: "Gabo", expectedBacklogDuplicateRate: 0.15 });
    assert.deepEqual(truth.counts, {
      accounts: 1,
      answerKey: 3,
      featureRequests: 1,
      feedback: 2,
      sharesNeed: 1,
    });
    assert.deepEqual(truth.labels, {
      featureRequests: [{ confirmed: true, key: "fr-swap", needId: "swap" }],
      feedback: [
        { confirmed: true, key: "fb-1", needId: "swap" },
        { confirmed: false, key: "fb-2", needId: "payroll" },
      ],
    });
  });

  it("is a no-op when reloaded with the same fingerprint", async () => {
    const first = await repo.storePilotGroundTruth(groundTruth(workspaceId));
    const again = await repo.storePilotGroundTruth(groundTruth(workspaceId));
    assert.equal(again.outcome, "unchanged");
    assert.equal(again.load.id, first.load.id);
    assert.equal(await rowCount(pilotLoads), 1);
    assert.equal(await rowCount(pilotFeedback), 2);
  });

  it("replaces the ground truth on a new fingerprint, records a reset and keeps the history", async () => {
    await repo.storePilotGroundTruth(
      groundTruth(workspaceId, { now: new Date("2026-11-02T00:00:00.000Z") }),
    );
    const changed = groundTruth(workspaceId, {
      answerKey: [
        {
          confirmedAt: "2026-10-28",
          confirmedBy: "Rosa",
          key: "fb-1",
          kind: "feedback",
          needId: "x",
        },
      ],
      feedback: [at0(groundTruth(workspaceId).feedback)],
      fingerprint: "sha256:two",
      now: new Date("2026-11-03T00:00:00.000Z"),
    });
    const reset = await repo.storePilotGroundTruth(changed);
    assert.equal(reset.outcome, "reset");
    assert.equal(reset.load.reset, true);
    assert.equal(reset.load.previousFingerprint, "sha256:one");

    const truth = await repo.pilotGroundTruth(workspaceId);
    assert.equal(truth?.fingerprint, "sha256:two");
    assert.equal(truth?.feedbackCount, 1);
    assert.deepEqual(truth?.labels, {
      featureRequests: [],
      feedback: [{ confirmed: true, key: "fb-1", needId: "x" }],
    });
    // Earlier rows are replaced, not kept beside the new ones.
    assert.equal(await rowCount(pilotFeedback), 1);
    assert.equal(await rowCount(pilotAnswerKey), 1);

    const history = await repo.pilotLoadHistory(workspaceId);
    assert.deepEqual(
      history.map((h) => [h.fingerprint, h.reset, h.previousFingerprint]),
      [
        ["sha256:one", false, null],
        ["sha256:two", true, "sha256:one"],
      ],
    );
  });

  it("ignores a load that never finished", async () => {
    await repo.storePilotGroundTruth(groundTruth(workspaceId));
    await db.insert(pilotLoads).values({
      accounts: 0,
      answerKeyEntries: 0,
      featureRequests: 0,
      feedback: 0,
      fingerprint: "sha256:half",
      manifest: {},
      sharesNeed: 0,
      workspaceId,
    });
    const truth = await repo.pilotGroundTruth(workspaceId);
    assert.equal(truth?.fingerprint, "sha256:one");
    const history = await repo.pilotLoadHistory(workspaceId);
    assert.equal(history.length, 1);
  });

  it("keeps Workspaces apart", async () => {
    const other = await repo.ensureWorkspace({ name: "Other", slug: "other" });
    await repo.storePilotGroundTruth(groundTruth(workspaceId));
    assert.equal(await repo.pilotGroundTruth(other.id), null);
    const otherLoad = await repo.storePilotGroundTruth(groundTruth(other.id));
    assert.equal(otherLoad.outcome, "loaded");
    const truth = await repo.pilotGroundTruth(workspaceId);
    assert.equal(truth?.feedbackCount, 2);
  });
});

function at0<T>(items: T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error("empty");
  return item;
}

describe("eval runs", () => {
  let db: SignalDb;
  let repo: SignalRepository;
  const key = { fingerprint: "sha256:v2", promptVersion: "pv-1", setName: "held-out-v2" };

  beforeEach(async () => {
    db = await createTestDb();
    repo = createRepository(db);
  });

  it("records every run with Origin eval and whether it judged pairs", async () => {
    await repo.recordEvalRun(run({ completed: 0, readings: null, results: [], status: "refused" }));
    await repo.recordEvalRun(run({ completed: 0, readings: null, results: [], status: "failed" }));
    await repo.recordEvalRun(run());
    const rows = await db.select().from(evalRuns);
    assert.deepEqual(
      rows.map((r) => [r.status, r.judgedPairs, r.origin]),
      [
        ["refused", false, "eval"],
        ["failed", false, "eval"],
        ["completed", true, "eval"],
      ],
    );
  });

  it("knows whether a judged run exists for the key, counting judged failures", async () => {
    assert.equal(await repo.hasJudgedEvalRun(key), false);
    await repo.recordEvalRun(run({ completed: 0, status: "failed" }));
    assert.equal(await repo.hasJudgedEvalRun(key), false);
    await repo.recordEvalRun(run({ completed: 1, failures: 1, status: "failed" }));
    assert.equal(await repo.hasJudgedEvalRun(key), true);
    assert.equal(await repo.hasJudgedEvalRun({ ...key, promptVersion: "pv-2" }), false);
    assert.equal(await repo.hasJudgedEvalRun({ ...key, fingerprint: "sha256:other" }), false);
  });

  it("reads the latest judged, non-repeat run for set, fingerprint and prompt version", async () => {
    const older = await repo.recordEvalRun(
      run({ createdAt: new Date("2026-11-01T00:00:00.000Z") }),
    );
    const newer = await repo.recordEvalRun(
      run({ createdAt: new Date("2026-11-02T00:00:00.000Z"), promptVersion: "pv-2" }),
    );
    await repo.recordEvalRun(
      run({ createdAt: new Date("2026-11-03T00:00:00.000Z"), promptVersion: "pv-2", repeat: true }),
    );
    await repo.recordEvalRun(
      run({
        completed: 0,
        createdAt: new Date("2026-11-04T00:00:00.000Z"),
        promptVersion: "pv-2",
        status: "failed",
      }),
    );
    await repo.recordEvalRun(
      run({ createdAt: new Date("2026-11-05T00:00:00.000Z"), fingerprint: "sha256:old" }),
    );
    await repo.recordEvalRun(
      run({ createdAt: new Date("2026-11-06T00:00:00.000Z"), setName: "held-out" }),
    );

    const latestAny = await repo.latestEvalReading({
      fingerprint: "sha256:v2",
      setName: "held-out-v2",
    });
    assert.equal(latestAny?.id, newer.id);
    assert.equal(latestAny?.createdAt, "2026-11-02T00:00:00.000Z");
    const forPrompt = await repo.latestEvalReading(key);
    assert.equal(forPrompt?.id, older.id);
    assert.equal(await repo.latestEvalReading({ ...key, promptVersion: "pv-9" }), null);
    assert.equal(await repo.latestEvalReading({ ...key, fingerprint: "sha256:none" }), null);

    const [row] = await db.select().from(evalRuns).where(eq(evalRuns.id, older.id));
    assert.deepEqual(row?.readings, { sameNeed: { predicted: 1, truePositives: 1 } });
  });
});
