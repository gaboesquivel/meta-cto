import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, it } from "vitest";

import { addRequest, agent, cedar, createHarness, mix, staff, unit } from "./test-fixtures";

describe("signal service search", () => {
  it("searches semantically with q and pages by offset cursor", async () => {
    const harness = await createHarness({ vectors: { swap: unit(0) } });
    const sofia = await addRequest(harness, "Shift swaps don't sync", unit(0), "Reliable trades");
    const daniel = await addRequest(harness, "Approve shift changes", mix(0, 1, 0.4));
    await addRequest(harness, "Payroll export", unit(5));
    await harness.service.support(sofia.id, { actor: staff, onBehalfOf: cedar });
    await harness.service.support(sofia.id, {
      actor: staff,
      onBehalfOf: { account: { name: "Harbor Bistro" } },
    });

    const first = await harness.service.search({ limit: 2, q: "swap" });

    assert.deepEqual(
      first.items.map((item) => item.id),
      [sofia.id, daniel.id],
    );
    assert.equal(first.nextCursor, 2);
    assert.equal(first.items[0]?.supportCount, 2);
    assert.equal(first.items[0]?.accountCount, 2);
    assert.equal(first.items[0]?.underlyingNeed, "Reliable trades");
    assert.equal(first.items[1]?.supportCount, 0);
    assert.equal(harness.embedder.calls.at(-1), "swap");

    const second = await harness.service.search({ cursor: 2, limit: 2, q: "swap" });
    assert.deepEqual(
      second.items.map((item) => item.title),
      ["Payroll export"],
    );
    assert.equal(second.nextCursor, null);
  });

  it("lists newest first without q", async () => {
    const harness = await createHarness({});
    await addRequest(harness, "Older", unit(0));
    await sleep(5);
    await addRequest(harness, "Newer", unit(1));

    const page = await harness.service.search({ limit: 1 });

    assert.deepEqual(
      page.items.map((item) => item.title),
      ["Newer"],
    );
    assert.equal(page.nextCursor, 1);
    assert.equal(harness.embedder.calls.length, 0);
  });
});

describe("signal service get", () => {
  it("returns supports with account context, comments and related links", async () => {
    const harness = await createHarness({});
    const sofia = await addRequest(harness, "Shift swaps don't sync", unit(0), "Reliable trades");
    const daniel = await addRequest(harness, "Approve shift changes", unit(1));
    await harness.repo.insertRelatedLink({
      a: sofia.id,
      b: daniel.id,
      reason: "both about trades",
      sharedDimension: "shift trades",
      source: "seed",
    });
    await harness.service.support(sofia.id, {
      actor: agent,
      onBehalfOf: {
        account: { name: "Cedar Market", plan: "pro", segment: "retail", size: "24 stores" },
        requester: { name: "Marta" },
      },
      quote: "Trades vanish",
    });
    await harness.service.comment(sofia.id, {
      actor: staff,
      body: "Also at Harbor",
      onBehalfOf: { account: { name: "Harbor" } },
    });

    const detail = await harness.service.get(sofia.id);
    const fromDaniel = await harness.service.get(daniel.id);

    assert.equal(detail.title, "Shift swaps don't sync");
    assert.equal(detail.underlyingNeed, "Reliable trades");
    assert.deepEqual(detail.createdBy, { name: "seed", type: "staff" });
    assert.deepEqual(detail.onBehalfOf, { account: null, requester: null });
    assert.equal(detail.supports.length, 1);
    assert.deepEqual(detail.supports[0]?.account, {
      name: "Cedar Market",
      plan: "pro",
      segment: "retail",
      size: "24 stores",
    });
    assert.deepEqual(detail.supports[0]?.actor, agent);
    assert.equal(detail.supports[0]?.requester, "Marta");
    assert.equal(detail.comments[0]?.account, "Harbor");
    assert.equal(detail.comments[0]?.body, "Also at Harbor");
    assert.deepEqual(detail.relatedLinks, [
      {
        featureRequestId: daniel.id,
        reason: "both about trades",
        sharedDimension: "shift trades",
        title: "Approve shift changes",
      },
    ]);
    assert.equal(fromDaniel.relatedLinks[0]?.featureRequestId, sofia.id);
    assert.equal(typeof detail.createdAt, "string");
  });

  it("returns not_found for missing or malformed ids", async () => {
    const harness = await createHarness({});

    await assert.rejects(harness.service.get("44444444-4444-4444-8444-444444444444"), {
      code: "not_found",
      status: 404,
    });
    await assert.rejects(harness.service.get("bogus"), { code: "not_found", status: 404 });
  });
});

describe("signal service metrics", () => {
  it("reports nulls honestly before any check", async () => {
    const harness = await createHarness({});

    assert.deepEqual(await harness.service.metrics(), {
      checks: 0,
      checksWithSameNeed: 0,
      createsAfterSameNeed: 0,
      fragmentationRate: null,
      reviewCoverage: 0,
      suggestionAcceptance: null,
    });
  });

  it("derives suggestion acceptance and creates after same need from events", async () => {
    const harness = await createHarness({ vectors: { Traded: unit(0) } });
    const sofia = await addRequest(harness, "Shift swaps don't sync", unit(0));
    const draft = { description: "Trades vanish", title: "Traded shifts missing" };
    harness.judge.state.behavior = {
      build: () => ({
        judgments: [
          {
            featureRequestId: sofia.id,
            reason: "same trades",
            sharedDimension: null,
            verdict: "same_need",
          },
        ],
        underlyingNeed: "need",
      }),
      kind: "output",
    };
    const accepted = await harness.service.check({ actor: staff, draft });
    const skipped = await harness.service.check({ actor: staff, draft });
    harness.judge.state.behavior = { kind: "error" };
    const degraded = await harness.service.check({ actor: staff, draft });

    await harness.service.support(sofia.id, {
      actor: staff,
      checkId: accepted.checkId,
      onBehalfOf: cedar,
    });
    await harness.service.support(sofia.id, {
      actor: staff,
      checkId: degraded.checkId,
      onBehalfOf: { account: { name: "Other" } },
    });
    await harness.service.create({
      actor: staff,
      checkId: skipped.checkId,
      draft,
      skipReason: "Different scope",
    });

    assert.deepEqual(await harness.service.metrics(), {
      checks: 3,
      checksWithSameNeed: 2,
      createsAfterSameNeed: 1,
      fragmentationRate: null,
      reviewCoverage: 0,
      suggestionAcceptance: 0.5,
    });
  });
});
