import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { DEFAULT_PILOT_BLIND_SHARE, isChosenForBlindReview } from "./review-blind";
import type { Harness } from "./test-fixtures";
import { addRequest, createHarness, payloadOf, staff, unit } from "./test-fixtures";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";

const suspect = async (harness: Harness, a: string, b: string) =>
  await harness.repo.upsertSuspectedDuplicate({
    a,
    b,
    model: "judge-v1",
    reason: "same approval flow",
    source: "check",
    workspaceId: harness.workspaceId,
  });

/** A backlog request and a new request the AI suspects is its duplicate. */
const suspectedNewRequest = async (blindShare: number) => {
  const harness = await createHarness({ blindShare });
  const backlog = await addRequest(harness, "Manager approval for swaps", unit(0), "Approvals");
  const fresh = await harness.repo.insertFeatureRequest({
    createdByActorName: "Ana",
    createdByActorType: "staff",
    createdViaCheck: true,
    description: "Approve shift trades description",
    embedding: unit(1),
    origin: harness.origin,
    title: "Approve shift trades",
    underlyingNeed: "AI restated need",
    workspaceId: harness.workspaceId,
  });
  const suspicion = await suspect(harness, backlog.id, fresh.id);
  return { backlog, fresh, harness, suspicion };
};

describe("blind selection", () => {
  it("is reproducible for the same workspace and request", () => {
    const ids = Array.from(
      { length: 50 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    const first = ids.map((id) => isChosenForBlindReview(WORKSPACE, id, 0.3));
    const second = ids.map((id) => isChosenForBlindReview(WORKSPACE, id, 0.3));
    assert.deepEqual(first, second);
  });

  it("chooses about the configured share, none at 0 and all at 1", () => {
    const ids = Array.from(
      { length: 2000 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    const chosen = ids.filter((id) => isChosenForBlindReview(WORKSPACE, id, 0.3)).length;
    assert.ok(chosen > 2000 * 0.25 && chosen < 2000 * 0.35, `chose ${chosen} of 2000`);
    assert.equal(ids.filter((id) => isChosenForBlindReview(WORKSPACE, id, 0)).length, 0);
    assert.equal(ids.filter((id) => isChosenForBlindReview(WORKSPACE, id, 1)).length, 2000);
  });

  it("differs by workspace", () => {
    const ids = Array.from(
      { length: 200 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    const other = "22222222-2222-4222-8222-222222222222";
    const here = ids.map((id) => isChosenForBlindReview(WORKSPACE, id, 0.3));
    const there = ids.map((id) => isChosenForBlindReview(other, id, 0.3));
    assert.notDeepEqual(here, there);
  });

  it("defaults the pilot share to about 30%", () => {
    assert.equal(DEFAULT_PILOT_BLIND_SHARE, 0.3);
  });
});

describe("blind review queue", () => {
  it("withholds the AI suggestion, Reason and restated need on a blind new request", async () => {
    const { backlog, fresh, harness } = await suspectedNewRequest(1);

    const queue = await harness.review.queue();
    const item = queue.items.find((entry) => entry.featureRequest.id === fresh.id);

    assert.equal(item?.blind, true);
    assert.deepEqual(item?.suspicions, []);
    assert.equal(item?.featureRequest.underlyingNeed, null);
    const serialized = JSON.stringify(queue);
    assert.doesNotMatch(serialized, /same approval flow/u);
    assert.doesNotMatch(serialized, /judge-v1/u);
    assert.doesNotMatch(serialized, /AI restated need/u);
    // The backlog side would show the same suspicion; it is withheld there too.
    assert.equal(
      queue.items.some((entry) => entry.featureRequest.id === backlog.id),
      false,
    );
    assert.deepEqual(queue.counts, { backlog: 0, new: 1 });
  });

  it("lists every open Feature Request by title so the PM can pick a canonical unranked", async () => {
    const { backlog, fresh, harness } = await suspectedNewRequest(1);
    const zeta = await addRequest(harness, "Zeta export", unit(2));
    const alpha = await addRequest(harness, "Alpha calendar sync", unit(3));

    const queue = await harness.review.queue();

    assert.deepEqual(
      queue.blindChoices?.map((choice) => choice.title),
      ["Alpha calendar sync", "Approve shift trades", "Manager approval for swaps", "Zeta export"],
    );
    assert.deepEqual(Object.keys(queue.blindChoices?.[0] ?? {}).toSorted(), ["id", "title"]);
    assert.ok(queue.blindChoices?.some((choice) => choice.id === backlog.id));
    assert.ok(queue.blindChoices?.some((choice) => choice.id === fresh.id));
    assert.ok(queue.blindChoices?.some((choice) => choice.id === zeta.id));
    assert.ok(queue.blindChoices?.some((choice) => choice.id === alpha.id));
  });

  it("keeps today's queue when nothing is blind", async () => {
    const { backlog, fresh, harness, suspicion } = await suspectedNewRequest(0);

    const queue = await harness.review.queue();

    assert.equal(queue.blindChoices, undefined);
    assert.deepEqual(queue.counts, { backlog: 1, new: 1 });
    const item = queue.items.find((entry) => entry.featureRequest.id === fresh.id);
    assert.equal(item?.blind, false);
    assert.equal(item?.suspicions[0]?.suggestionId, suspicion.id);
    assert.equal(item?.suspicions[0]?.reason, "same approval flow");
    assert.equal(queue.items.find((entry) => entry.featureRequest.id === backlog.id)?.blind, false);
  });

  it("never makes backlog requests blind", async () => {
    const harness = await createHarness({ blindShare: 1 });
    const a = await addRequest(harness, "A", unit(0));
    const b = await addRequest(harness, "B", unit(1));
    await suspect(harness, a.id, b.id);

    const queue = await harness.review.queue();

    assert.ok(queue.items.every((item) => !item.blind && item.suspicions.length === 1));
    assert.equal(queue.blindChoices, undefined);
  });

  it("shows the suspicion on the backlog side once the blind request is decided", async () => {
    const { backlog, fresh, harness } = await suspectedNewRequest(1);
    const other = await addRequest(harness, "Unrelated", unit(2));

    await harness.review.decide(
      { decision: "distinct", featureRequestId: fresh.id, otherId: other.id },
      staff,
    );

    const queue = await harness.review.queue();
    // One blind decision reviews the blind request; its unseen suspicion stays for the other side.
    assert.equal(
      queue.items.some((entry) => entry.featureRequest.id === fresh.id),
      false,
    );
    const item = queue.items.find((entry) => entry.featureRequest.id === backlog.id);
    assert.equal(item?.blind, false);
    assert.equal(item?.suspicions[0]?.other.id, fresh.id);
    assert.equal(item?.suspicions[0]?.decision, null);
    const metrics = await harness.review.metrics();
    assert.deepEqual(metrics.reviewCoverage, { rate: 1, reviewed: 1, total: 1 });
  });
});

describe("blind review decisions", () => {
  it("records blind: true on a decision about a blind request, without a suggestion", async () => {
    const { backlog, fresh, harness } = await suspectedNewRequest(1);

    const decision = await harness.review.decide(
      {
        canonicalId: backlog.id,
        decision: "duplicate",
        featureRequestId: fresh.id,
        otherId: backlog.id,
      },
      staff,
    );

    assert.equal(decision.blind, true);
    assert.equal(decision.suggestionId, null);
    const row = await harness.repo.getFeatureRequest(fresh.id);
    assert.equal(row?.duplicateOfId, backlog.id);
    const [event] = await harness.repo.eventsOfType(harness.workspaceId, "review_decided", "demo");
    assert.equal(payloadOf(event).blind, true);
    const [history] = await harness.repo.listReviewDecisions({ featureRequestIds: [fresh.id] });
    assert.equal(history?.blind, true);
  });

  it("records blind on a none decision", async () => {
    const { fresh, harness } = await suspectedNewRequest(1);

    const decision = await harness.review.decide(
      { decision: "none", featureRequestId: fresh.id },
      staff,
    );

    assert.equal(decision.blind, true);
  });

  it("refuses a suggestionId on a blind request: none was shown", async () => {
    const { backlog, fresh, harness, suspicion } = await suspectedNewRequest(1);

    await assert.rejects(
      harness.review.decide(
        {
          decision: "distinct",
          featureRequestId: fresh.id,
          otherId: backlog.id,
          suggestionId: suspicion.id,
        },
        staff,
      ),
      { code: "invalid_decision", status: 422 },
    );
  });

  it("records blind: false and answers the suggestion as before when not blind", async () => {
    const { backlog, fresh, harness, suspicion } = await suspectedNewRequest(0);

    const decision = await harness.review.decide(
      { decision: "distinct", featureRequestId: fresh.id, otherId: backlog.id },
      staff,
    );

    assert.equal(decision.blind, false);
    assert.equal(decision.suggestionId, suspicion.id);
    const [event] = await harness.repo.eventsOfType(harness.workspaceId, "review_decided", "demo");
    assert.equal(payloadOf(event).blind, false);
  });
});

/** A blind-eligible new request with the AI's Related Need link to the backlog request. */
const withAiLink = async (blindShare: number) => {
  const setup = await suspectedNewRequest(blindShare);
  await setup.harness.repo.insertRelatedLink({
    a: setup.fresh.id,
    b: setup.backlog.id,
    reason: "AI related reason",
    sharedDimension: "manager approval",
    source: "check",
  });
  return setup;
};

describe("blind request detail (get_feature_request, REST detail, detail page)", () => {
  it("withholds the AI's restated need and Related Need links until the blind decision", async () => {
    const { backlog, fresh, harness } = await withAiLink(1);

    const detail = await harness.service.get(fresh.id);

    assert.equal(detail.underlyingNeed, null);
    assert.deepEqual(detail.relatedLinks, []);
    assert.doesNotMatch(
      JSON.stringify(detail),
      /AI restated need|AI related reason|same approval/u,
    );
    // Everything else stays.
    assert.equal(detail.title, "Approve shift trades");
    assert.equal(detail.description, "Approve shift trades description");
    assert.deepEqual(detail.reviewHistory, []);
    // The backlog side does not reveal the AI's link to the blind request either.
    const other = await harness.service.get(backlog.id);
    assert.equal(other.underlyingNeed, "Approvals");
    assert.deepEqual(other.relatedLinks, []);
  });

  it("shows them again once the blind request has its own decision", async () => {
    const { backlog, fresh, harness } = await withAiLink(1);
    await harness.review.decide({ decision: "none", featureRequestId: fresh.id }, staff);

    const detail = await harness.service.get(fresh.id);

    assert.equal(detail.underlyingNeed, "AI restated need");
    assert.equal(detail.relatedLinks[0]?.reason, "AI related reason");
    const other = await harness.service.get(backlog.id);
    assert.equal(other.relatedLinks[0]?.featureRequestId, fresh.id);
  });

  it("withholds the restated need from search results until the blind decision", async () => {
    const { backlog, fresh, harness } = await withAiLink(1);

    const hidden = await harness.service.search({});
    const needs = new Map(hidden.items.map((item) => [item.id, item.underlyingNeed]));
    assert.equal(needs.get(fresh.id), null);
    assert.equal(needs.get(backlog.id), "Approvals");

    await harness.review.decide({ decision: "none", featureRequestId: fresh.id }, staff);
    const shown = await harness.service.search({});
    const after = shown.items.find((item) => item.id === fresh.id);
    assert.equal(after?.underlyingNeed, "AI restated need");
  });

  it("keeps the detail unchanged when nothing is blind (the Crewday demo)", async () => {
    const { backlog, fresh, harness } = await withAiLink(0);

    const detail = await harness.service.get(fresh.id);

    assert.equal(detail.underlyingNeed, "AI restated need");
    assert.equal(detail.relatedLinks[0]?.featureRequestId, backlog.id);
    const page = await harness.service.search({});
    assert.equal(
      page.items.find((item) => item.id === fresh.id)?.underlyingNeed,
      "AI restated need",
    );
  });
});
