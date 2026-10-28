import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { addRequest, agent, cedar, createHarness, staff, unit } from "./test-fixtures";

const missingId = "22222222-2222-4222-8222-222222222222";

describe("signal service support", () => {
  it("supports on behalf of an account and returns the detail", async () => {
    const harness = await createHarness({});
    const sofia = await addRequest(harness, "Shift swaps don't sync", unit(0));

    const result = await harness.service.support(sofia.id, {
      actor: agent,
      checkId: "33333333-3333-4333-8333-333333333333",
      onBehalfOf: { ...cedar, requester: { name: "Marta" } },
      quote: "Trades vanish",
    });

    assert.equal(result.created, true);
    assert.equal(result.support.quote, "Trades vanish");
    assert.equal(result.support.requester, "Marta");
    assert.deepEqual(result.support.account, {
      name: "Cedar Market",
      plan: null,
      segment: "retail",
      size: "24 stores",
    });
    assert.equal(result.featureRequest.id, sofia.id);
    assert.equal(result.featureRequest.supportCount, 1);
    assert.equal(result.featureRequest.accountCount, 1);
    const [event] = await harness.repo.eventsOfType(
      harness.workspaceId,
      "feature_request_supported",
    );
    assert.equal(event?.subjectId, sofia.id);
    const account = await harness.repo.upsertAccount({
      name: "Cedar Market",
      workspaceId: harness.workspaceId,
    });
    assert.deepEqual(event?.payload, {
      accountId: account.id,
      actor: agent,
      checkId: "33333333-3333-4333-8333-333333333333",
      supportId: result.support.id,
    });
  });

  it("returns the existing support with created false for a repeat account", async () => {
    const harness = await createHarness({});
    const sofia = await addRequest(harness, "Shift swaps don't sync", unit(0));
    const first = await harness.service.support(sofia.id, {
      actor: staff,
      onBehalfOf: cedar,
      quote: "one",
    });

    const second = await harness.service.support(sofia.id, {
      actor: agent,
      onBehalfOf: cedar,
      quote: "two",
    });

    assert.equal(second.created, false);
    assert.equal(second.support.id, first.support.id);
    assert.equal(second.support.quote, "one");
    assert.equal(second.featureRequest.supportCount, 1);
    const events = await harness.repo.eventsOfType(
      harness.workspaceId,
      "feature_request_supported",
    );
    assert.equal(events.length, 1);
  });

  it("returns not_found for an unknown feature request", async () => {
    const harness = await createHarness({});

    await assert.rejects(harness.service.support(missingId, { actor: staff, onBehalfOf: cedar }), {
      code: "not_found",
      status: 404,
    });
    await assert.rejects(
      harness.service.support("not-a-uuid", { actor: staff, onBehalfOf: cedar }),
      {
        code: "not_found",
        status: 404,
      },
    );
  });
});

describe("signal service comment", () => {
  it("adds a comment with an optional account and records the event", async () => {
    const harness = await createHarness({});
    const sofia = await addRequest(harness, "Shift swaps don't sync", unit(0));

    const withAccount = await harness.service.comment(sofia.id, {
      actor: staff,
      body: "Seen at Cedar too",
      onBehalfOf: cedar,
    });
    const plain = await harness.service.comment(sofia.id, { actor: agent, body: "Noted" });

    assert.equal(withAccount.account, "Cedar Market");
    assert.equal(withAccount.body, "Seen at Cedar too");
    assert.deepEqual(withAccount.actor, staff);
    assert.equal(plain.account, null);
    const events = await harness.repo.eventsOfType(harness.workspaceId, "comment_added");
    assert.equal(events.length, 2);
    assert.equal(events[0]?.subjectId, sofia.id);
  });

  it("returns not_found for an unknown feature request", async () => {
    const harness = await createHarness({});

    await assert.rejects(harness.service.comment(missingId, { actor: staff, body: "hi" }), {
      code: "not_found",
      status: 404,
    });
  });

  it("rejects an empty body", async () => {
    const harness = await createHarness({});
    const sofia = await addRequest(harness, "Shift swaps don't sync", unit(0));

    await assert.rejects(harness.service.comment(sofia.id, { actor: staff, body: "  " }), {
      code: "invalid_input",
      status: 400,
    });
  });
});
