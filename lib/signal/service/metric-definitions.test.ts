import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "vitest";

import type { Harness } from "./test-fixtures";
import { createSignalService } from "./index";
import { addNewRequest, addRequest, cedar, createHarness, staff, unit } from "./test-fixtures";

/**
 * Worked examples of each metric as PRODUCT.md "Main metric and kill criterion" defines it.
 * When a definition there changes, change its example here in the same commit.
 */
const DEFINED_IN_PRODUCT = [
  "Intake Duplicate Rate",
  "Review Coverage",
  "backlog baseline",
  "suggestion acceptance",
  "Suspected Duplication",
  "undo rate",
  "Origin",
] as const;

const productMetricSection = async () => {
  const product = await readFile(new URL("../../../PRODUCT.md", import.meta.url), "utf-8");
  const start = product.indexOf("## Main metric");
  assert.ok(start !== -1, "PRODUCT.md lost its '## Main metric' section");
  const end = product.indexOf("\n## ", start + 1);
  return product.slice(start, end === -1 ? undefined : end).toLowerCase();
};

const suspect = async (harness: Harness, a: string, b: string) =>
  await harness.repo.upsertSuspectedDuplicate({
    a,
    b,
    model: "judge-v1",
    reason: "same approval flow",
    source: "scan",
    workspaceId: harness.workspaceId,
  });

const duplicate = async (harness: Harness, featureRequestId: string, canonicalId: string) =>
  await harness.review.decide(
    { canonicalId, decision: "duplicate", featureRequestId, otherId: canonicalId },
    staff,
  );

/** A new request (created through a Check) suspected to share a need with a backlog request. */
const suspectedIntake = async () => {
  const harness = await createHarness({});
  const backlog = await addRequest(harness, "Manager approval for swaps", unit(0));
  const fresh = await addNewRequest(harness, "Approve shift trades", unit(1));
  await suspect(harness, fresh.id, backlog.id);
  return { backlog, fresh, harness };
};

describe("PRODUCT.md metric definitions", () => {
  it("still names every metric these examples cover", async () => {
    const section = await productMetricSection();
    for (const name of DEFINED_IN_PRODUCT) {
      assert.ok(
        section.includes(name.toLowerCase()),
        `PRODUCT.md no longer defines "${name}": update its worked example in this file`,
      );
    }
  });
});

describe("Intake Duplicate Rate: reviewed new requests confirmed Duplicate", () => {
  it("counts only Review Decisions, never an undecided AI suspicion", async () => {
    const { harness } = await suspectedIntake();

    const metrics = await harness.review.metrics();

    assert.deepEqual(metrics.intakeDuplicateRate, { duplicates: 0, rate: null, reviewed: 0 });
    assert.deepEqual(metrics.suspectedDuplication, { open: 2, rate: 1, total: 2 });
  });

  it("counts Related as reviewed but not Duplicate", async () => {
    const { backlog, fresh, harness } = await suspectedIntake();

    await harness.review.decide(
      {
        decision: "related",
        featureRequestId: fresh.id,
        otherId: backlog.id,
        sharedDimension: "manager approval",
      },
      staff,
    );

    const metrics = await harness.review.metrics();
    assert.deepEqual(metrics.intakeDuplicateRate, { duplicates: 0, rate: 0, reviewed: 1 });
  });

  it("leaves backlog duplicates out of intake and in the baseline", async () => {
    const harness = await createHarness({});
    const canonical = await addRequest(harness, "Manager approval", unit(0));
    const older = await addRequest(harness, "Approve trades", unit(1));
    await suspect(harness, canonical.id, older.id);

    await duplicate(harness, older.id, canonical.id);

    const metrics = await harness.review.metrics();
    assert.deepEqual(metrics.intakeDuplicateRate, { duplicates: 0, rate: null, reviewed: 0 });
    assert.deepEqual(metrics.backlogBaseline, { duplicates: 2, rate: 1, reviewed: 2 });
  });

  it("drops a duplicate again once its decision is undone", async () => {
    const { backlog, fresh, harness } = await suspectedIntake();
    const decision = await duplicate(harness, fresh.id, backlog.id);
    const marked = await harness.review.metrics();
    assert.equal(marked.intakeDuplicateRate.duplicates, 1);

    await harness.review.undo(decision.id, staff);

    const metrics = await harness.review.metrics();
    assert.deepEqual(metrics.intakeDuplicateRate, { duplicates: 0, rate: null, reviewed: 0 });
    assert.deepEqual(metrics.reviewCoverage, { rate: 0, reviewed: 0, total: 1 });
  });
});

describe("Review Coverage: reviewed new requests over new requests", () => {
  it("counts No Duplicates as reviewed and ignores backlog requests", async () => {
    const harness = await createHarness({});
    await addRequest(harness, "Backlog", unit(0));
    const reviewed = await addNewRequest(harness, "Reviewed", unit(1));
    await addNewRequest(harness, "Unreviewed", unit(2));

    await harness.review.decide({ decision: "none", featureRequestId: reviewed.id }, staff);

    const metrics = await harness.review.metrics();
    assert.deepEqual(metrics.reviewCoverage, { rate: 0.5, reviewed: 1, total: 2 });
  });
});

describe("undo rate: Duplicate decisions later undone", () => {
  it("ignores undone Related and Distinct decisions", async () => {
    const { backlog, fresh, harness } = await suspectedIntake();
    const related = await harness.review.decide(
      {
        decision: "related",
        featureRequestId: fresh.id,
        otherId: backlog.id,
        sharedDimension: "manager approval",
      },
      staff,
    );
    await harness.review.undo(related.id, staff);
    const distinct = await harness.review.decide(
      { decision: "distinct", featureRequestId: fresh.id, otherId: backlog.id },
      staff,
    );
    await harness.review.undo(distinct.id, staff);

    const metrics = await harness.review.metrics();
    assert.deepEqual(metrics.undoRate, { decisions: 0, rate: null, undone: 0 });
  });
});

describe("Origin: intake reads one Origin (the caller's by default); the Workspace owns the backlog", () => {
  const draft = { description: "Managers sign off each change", title: "Managers approve swaps" };

  /** An eval run on the demo Workspace: a Check that finds a Same Need, then a Support. */
  const evalCheckThenSupport = async (harness: Harness, targetId: string) => {
    const evalService = createSignalService({
      embedder: harness.embedder.embedder,
      judge: harness.judge.judge,
      origin: "eval",
      repo: harness.repo,
      workspaceId: harness.workspaceId,
    });
    const check = await evalService.check({ actor: { name: "eval", type: "agent" }, draft });
    await evalService.support(targetId, {
      actor: staff,
      checkId: check.checkId,
      onBehalfOf: cedar,
    });
  };

  it("leaves an eval Check and its Support out of demo Suggestion Acceptance", async () => {
    const harness = await createHarness({ vectors: { Managers: unit(0) } });
    const target = await addRequest(harness, "Manager approval for swaps", unit(0));
    harness.judge.state.behavior = {
      build: () => ({
        judgments: [
          {
            featureRequestId: target.id,
            reason: "same approval flow",
            sharedDimension: null,
            verdict: "same_need",
          },
        ],
        underlyingNeed: "Control over swaps",
      }),
      kind: "output",
    };

    await evalCheckThenSupport(harness, target.id);

    const demo = await harness.review.metrics();
    assert.equal(demo.origin, "demo");
    assert.equal(demo.checks, 0);
    assert.equal(demo.suggestionAcceptance, null);
    const evalRun = await harness.review.metrics({ origin: "eval" });
    assert.equal(evalRun.checks, 1);
    assert.equal(evalRun.suggestionAcceptance, 1);
  });

  it("reads the Workspace's seeded backlog for every intake Origin, and only that Origin's intake", async () => {
    const harness = await createHarness({});
    const seeded = await Promise.all(
      ["Manager approval", "Approve trades", "Swap sign-off"].map(
        async (title, index) =>
          await harness.repo.upsertSeedFeatureRequest({
            createdByActorName: "seed",
            createdByActorType: "staff",
            description: `${title} description`,
            embedding: unit(index),
            seedKey: `fr-${index}`,
            title,
            underlyingNeed: null,
            workspaceId: harness.workspaceId,
          }),
      ),
    );
    const [canonical, older, pending] = seeded;
    assert.ok(canonical && older && pending);
    await suspect(harness, canonical.id, older.id);
    await duplicate(harness, older.id, canonical.id);
    await suspect(harness, pending.id, canonical.id);
    const evalIntake = await harness.repo.insertFeatureRequest({
      createdByActorName: "eval",
      createdByActorType: "agent",
      createdViaCheck: true,
      description: "Eval filing",
      embedding: null,
      origin: "eval",
      title: "Eval filing",
      underlyingNeed: null,
      workspaceId: harness.workspaceId,
    });
    await suspect(harness, evalIntake.id, canonical.id);

    const demo = await harness.review.metrics();
    assert.equal(demo.origin, "demo");
    assert.deepEqual(demo.backlogBaseline, { duplicates: 1, rate: 1, reviewed: 1 });
    assert.deepEqual(demo.suspectedDuplication, { open: 2, rate: 1, total: 2 });
    assert.deepEqual(demo.undoRate, { decisions: 1, rate: 0, undone: 0 });
    assert.deepEqual(demo.reviewCoverage, { rate: null, reviewed: 0, total: 0 });
    const evalRun = await harness.review.metrics({ origin: "eval" });
    assert.deepEqual(evalRun.suspectedDuplication, { open: 3, rate: 1, total: 3 });
    assert.deepEqual(evalRun.reviewCoverage, { rate: 0, reviewed: 0, total: 1 });
  });

  it("keeps the backlog baseline for a demo caller once the seeded backlog is reviewed", async () => {
    const harness = await createHarness({});
    const [canonical, older] = await Promise.all(
      ["Manager approval", "Approve trades"].map(
        async (title, index) =>
          await harness.repo.upsertSeedFeatureRequest({
            createdByActorName: "seed",
            createdByActorType: "staff",
            description: `${title} description`,
            embedding: unit(index),
            seedKey: `fr-${index}`,
            title,
            underlyingNeed: null,
            workspaceId: harness.workspaceId,
          }),
      ),
    );
    assert.ok(canonical && older);
    await suspect(harness, canonical.id, older.id);
    await duplicate(harness, older.id, canonical.id);

    const demo = await harness.review.metrics();
    assert.deepEqual(demo.backlogBaseline, { duplicates: 2, rate: 1, reviewed: 2 });
  });
});
