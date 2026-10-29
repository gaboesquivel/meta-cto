import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { events } from "../schema";
import { createSignalService } from "./index";
import type { Harness } from "./test-fixtures";
import { addRequest, cedar, createHarness, staff, unit } from "./test-fixtures";

const draft = { description: "Managers sign off each change", title: "Managers approve changes" };

const sameNeedOn = (id: string) => ({
  build: () => ({
    judgments: [
      {
        featureRequestId: id,
        reason: "same approval flow",
        sharedDimension: null,
        verdict: "same_need" as const,
      },
    ],
    underlyingNeed: "Control over schedule changes",
  }),
  kind: "output" as const,
});

const originsOf = async (harness: Harness) => {
  const rows = await harness.db.select({ origin: events.origin, type: events.type }).from(events);
  return rows.map((row) => `${row.type}:${row.origin}`).toSorted();
};

/** The Origin stored on a Check and on a Feature Request. */
const storedOrigins = async (harness: Harness, checkId: string, featureRequestId: string) => {
  const check = await harness.repo.getCheck(checkId);
  const request = await harness.repo.getFeatureRequest(featureRequestId);
  return { check: check?.origin, request: request?.origin };
};

/** Check, create, Support, Comment and a Review Decision, each through the service. */
const fullFlow = async (harness: Harness) => {
  const target = await addRequest(harness, "Approval workflow", unit(0));
  harness.judge.state.behavior = sameNeedOn(target.id);
  const check = await harness.service.check({ actor: staff, draft, onBehalfOf: cedar });
  await harness.service.support(target.id, {
    actor: staff,
    checkId: check.checkId,
    onBehalfOf: cedar,
  });
  await harness.service.comment(target.id, { actor: staff, body: "Also for nights" });
  const created = await harness.service.create({
    actor: staff,
    checkId: check.checkId,
    draft,
    skipReason: "Different team",
  });
  await harness.review.decide({ decision: "none", featureRequestId: created.id }, staff);
  return { check, created };
};

describe("Origin is recorded at the source", () => {
  it("defaults to demo on Checks, created Feature Requests and every event", async () => {
    const harness = await createHarness({ vectors: { Managers: unit(0) } });

    const { check, created } = await fullFlow(harness);

    assert.deepEqual(await storedOrigins(harness, check.checkId, created.id), {
      check: "demo",
      request: "demo",
    });
    assert.deepEqual(await originsOf(harness), [
      "comment_added:demo",
      "draft_checked:demo",
      "feature_request_created:demo",
      "feature_request_supported:demo",
      "review_decided:demo",
    ]);
  });

  it("records the caller's Origin, eval here, everywhere it writes", async () => {
    const harness = await createHarness({ origin: "eval", vectors: { Managers: unit(0) } });

    const { check, created } = await fullFlow(harness);

    assert.deepEqual(await storedOrigins(harness, check.checkId, created.id), {
      check: "eval",
      request: "eval",
    });
    const recorded = await originsOf(harness);
    assert.ok(recorded.every((entry) => entry.endsWith(":eval")));
  });

  it("gives a created Feature Request the Origin of the Check that authorized it", async () => {
    const evalHarness = await createHarness({ origin: "eval", vectors: { Managers: unit(0) } });
    const check = await evalHarness.service.check({ actor: staff, draft });

    const demoService = createSignalService({
      embedder: evalHarness.embedder.embedder,
      judge: evalHarness.judge.judge,
      now: () => evalHarness.clock.now,
      repo: evalHarness.repo,
      workspaceId: evalHarness.workspaceId,
    });

    const created = await demoService.create({ actor: staff, checkId: check.checkId, draft });

    const stored = await storedOrigins(evalHarness, check.checkId, created.id);
    assert.equal(stored.request, "eval");
  });
});

describe("metrics read one Origin at a time", () => {
  it("default to the caller's own Origin and say which one they read", async () => {
    const harness = await createHarness({ origin: "eval", vectors: { Managers: unit(0) } });
    await fullFlow(harness);

    const own = await harness.review.metrics();
    const demo = await harness.review.metrics({ origin: "demo" });

    assert.equal(own.origin, "eval");
    assert.equal(own.checks, 1);
    assert.deepEqual(own.reviewCoverage, { rate: 0, reviewed: 0, total: 1 });
    assert.equal(demo.origin, "demo");
    assert.equal(demo.checks, 0);
    assert.deepEqual(demo.reviewCoverage, { rate: null, reviewed: 0, total: 0 });
  });

  it("refuses an unknown Origin with invalid_input", async () => {
    const harness = await createHarness({});

    await assert.rejects(
      harness.review.metrics({ origin: "production" as "demo" }),
      (error: Error & { code?: string }) => {
        assert.equal(error.code, "invalid_input");
        return true;
      },
    );
  });
});
