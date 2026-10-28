import assert from "node:assert/strict";
import { describe, it } from "vitest";

import type { JudgeBehavior } from "./test-fixtures";
import { addRequest, cedar, createHarness, payloadOf, staff, unit } from "./test-fixtures";

const draft = {
  description: "Managers sign off each change",
  title: "Managers approve shift changes",
};

const verdicts = (sameId: string | null, relatedId: string | null): JudgeBehavior => ({
  build: () => ({
    judgments: [
      ...(sameId
        ? [
            {
              featureRequestId: sameId,
              reason: "same approval flow",
              sharedDimension: null,
              verdict: "same_need" as const,
            },
          ]
        : []),
      ...(relatedId
        ? [
            {
              featureRequestId: relatedId,
              reason: "both touch trades",
              sharedDimension: "shift trades",
              verdict: "related_need" as const,
            },
          ]
        : []),
    ],
    underlyingNeed: "Control over schedule changes",
  }),
  kind: "output",
});

const setup = async (withSame: boolean) => {
  const harness = await createHarness({ vectors: { Managers: unit(0) } });
  const sofia = await addRequest(harness, "Shift swaps don't sync", unit(0));
  const daniel = await addRequest(harness, "Approval workflow", unit(0));
  harness.judge.state.behavior = verdicts(withSame ? daniel.id : null, sofia.id);
  const check = await harness.service.check({ actor: staff, draft, onBehalfOf: cedar });
  return { check, daniel, harness, sofia };
};

describe("signal service create", () => {
  it("creates with related links, underlying need and events after a related-only check", async () => {
    const { check, harness, sofia } = await setup(false);

    const created = await harness.service.create({
      actor: staff,
      checkId: check.checkId,
      draft: { description: `  ${draft.description}`, title: draft.title.toUpperCase() },
      onBehalfOf: { ...cedar, requester: { name: "Marta", role: "ops lead" } },
    });

    assert.equal(created.underlyingNeed, "Control over schedule changes");
    assert.equal(created.skipReason, null);
    assert.deepEqual(created.createdBy, staff);
    assert.deepEqual(created.onBehalfOf, { account: "Cedar Market", requester: "Marta" });
    assert.deepEqual(created.relatedLinks, [
      {
        featureRequestId: sofia.id,
        reason: "both touch trades",
        sharedDimension: "shift trades",
        title: "Shift swaps don't sync",
      },
    ]);
    const row = await harness.repo.getFeatureRequest(created.id);
    assert.equal(row?.checkId, check.checkId);
    assert.equal(row?.embedding?.length, 1536);

    const [createdEvent] = await harness.repo.eventsOfType(
      harness.workspaceId,
      "feature_request_created",
    );
    assert.equal(createdEvent?.subjectId, created.id);
    assert.deepEqual(createdEvent?.payload, {
      actor: staff,
      checkId: check.checkId,
      hadSameNeed: false,
      skipReason: null,
    });
    const linkEvents = await harness.repo.eventsOfType(harness.workspaceId, "related_link_added");
    assert.equal(linkEvents.length, 1);
    assert.equal(payloadOf(linkEvents[0]).featureRequestId, sofia.id);
  });

  it("requires a skip reason after a same need verdict, then records it", async () => {
    const { check, harness } = await setup(true);

    await assert.rejects(harness.service.create({ actor: staff, checkId: check.checkId, draft }), {
      code: "skip_reason_required",
      status: 422,
    });

    const created = await harness.service.create({
      actor: staff,
      checkId: check.checkId,
      draft,
      skipReason: "Different team owns approvals",
    });
    assert.equal(created.skipReason, "Different team owns approvals");
    const [event] = await harness.repo.eventsOfType(harness.workspaceId, "feature_request_created");
    assert.equal(payloadOf(event).hadSameNeed, true);
  });

  it("refuses a create without a stored check", async () => {
    const { harness } = await setup(false);

    await assert.rejects(
      harness.service.create({
        actor: staff,
        checkId: "11111111-1111-4111-8111-111111111111",
        draft,
      }),
      { code: "check_required", status: 409 },
    );
  });

  it("refuses a create whose draft differs from the check", async () => {
    const { check, harness } = await setup(false);

    await assert.rejects(
      harness.service.create({
        actor: staff,
        checkId: check.checkId,
        draft: { ...draft, title: "Something else" },
      }),
      { code: "check_mismatch", status: 409 },
    );
  });

  it("refuses a create after the check expired", async () => {
    const { check, harness } = await setup(false);
    harness.clock.now = new Date("2026-10-28T12:31:00.000Z");

    await assert.rejects(harness.service.create({ actor: staff, checkId: check.checkId, draft }), {
      code: "check_expired",
      status: 410,
    });
  });

  it("rejects invalid input", async () => {
    const { harness } = await setup(false);

    await assert.rejects(harness.service.create({ actor: staff, checkId: "nope", draft }), {
      code: "invalid_input",
      status: 400,
    });
  });
});
