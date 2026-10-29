import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { draftHash } from "./context";
import type { Harness } from "./test-fixtures";
import {
  addNewRequest,
  addRequest,
  cedar,
  createHarness,
  payloadOf,
  staff,
  unit,
} from "./test-fixtures";

const MISSING = "44444444-4444-4444-8444-444444444444";

const suspect = async (harness: Harness, a: string, b: string, reason = "same approval flow") =>
  await harness.repo.upsertSuspectedDuplicate({
    a,
    b,
    model: "judge-v1",
    reason,
    source: "scan",
    workspaceId: harness.workspaceId,
  });

/** Two backlog Feature Requests the AI suspects are the same need. */
const backlogPair = async () => {
  const harness = await createHarness({});
  const canonical = await addRequest(harness, "Manager approval for swaps", unit(0));
  const duplicate = await addRequest(harness, "Approve shift trades", unit(1));
  const suspicion = await suspect(harness, canonical.id, duplicate.id);
  return { canonical, duplicate, harness, suspicion };
};

const markDuplicate = async (harness: Harness, duplicateId: string, canonicalId: string) =>
  await harness.review.decide(
    { canonicalId, decision: "duplicate", featureRequestId: duplicateId, otherId: canonicalId },
    staff,
  );

const duplicateOfId = async (harness: Harness, id: string) => {
  const row = await harness.repo.getFeatureRequest(id);
  return row?.duplicateOfId ?? null;
};

const reviewMetrics = async (harness: Harness) => await harness.review.metrics();

describe("review queue", () => {
  it("lists new unreviewed requests and backlog requests with undecided suspicions", async () => {
    const { canonical, duplicate, harness, suspicion } = await backlogPair();
    await addRequest(harness, "Unsuspected backlog", unit(2));
    const fresh = await addNewRequest(harness, "Brand new request", unit(3));

    const queue = await harness.review.queue();

    assert.deepEqual(queue.counts, { backlog: 2, new: 1 });
    const ids = queue.items.map((item) => item.featureRequest.id).toSorted();
    assert.deepEqual(ids, [canonical.id, duplicate.id, fresh.id].toSorted());
    const item = queue.items.find((entry) => entry.featureRequest.id === duplicate.id);
    assert.equal(item?.isNew, false);
    assert.equal(item?.suspicions.length, 1);
    const [view] = item?.suspicions ?? [];
    assert.equal(view?.suggestionId, suspicion.id);
    assert.equal(view?.reason, "same approval flow");
    assert.equal(view?.source, "scan");
    assert.equal(view?.model, "judge-v1");
    assert.equal(view?.decision, null);
    assert.equal(view?.other.id, canonical.id);
    assert.equal(view?.other.title, "Manager approval for swaps");
    const freshItem = queue.items.find((entry) => entry.featureRequest.id === fresh.id);
    assert.equal(freshItem?.isNew, true);
    assert.deepEqual(freshItem?.suspicions, []);
  });

  it("drops requests once they are reviewed as a whole", async () => {
    const { canonical, duplicate, harness } = await backlogPair();
    const fresh = await addNewRequest(harness, "Brand new request", unit(3));

    await harness.review.decide({ decision: "none", featureRequestId: fresh.id }, staff);
    await harness.review.decide(
      { decision: "distinct", featureRequestId: duplicate.id, otherId: canonical.id },
      staff,
    );

    assert.deepEqual(await harness.review.queue(), { counts: { backlog: 0, new: 0 }, items: [] });
  });

  it("shows the decision state of each suspicion on a request still under review", async () => {
    const harness = await createHarness({});
    const hub = await addRequest(harness, "Hub", unit(0));
    const left = await addRequest(harness, "Left", unit(1));
    const right = await addRequest(harness, "Right", unit(2));
    await suspect(harness, hub.id, left.id);
    await suspect(harness, hub.id, right.id);

    const decided = await harness.review.decide(
      { decision: "distinct", featureRequestId: hub.id, otherId: left.id },
      staff,
    );

    const queue = await harness.review.queue();
    const item = queue.items.find((entry) => entry.featureRequest.id === hub.id);
    const states = new Map(
      item?.suspicions.map((view) => [view.other.id, view.decision?.id ?? null]),
    );
    assert.equal(states.get(left.id), decided.id);
    assert.equal(states.get(right.id), null);
  });
});

describe("review decide", () => {
  it("marks a duplicate: association on the non-canonical side, answered suggestion, event", async () => {
    const { canonical, duplicate, harness, suspicion } = await backlogPair();

    const decision = await markDuplicate(harness, duplicate.id, canonical.id);

    assert.equal(decision.decision, "duplicate");
    assert.equal(decision.canonicalId, canonical.id);
    assert.equal(decision.suggestionId, suspicion.id);
    assert.deepEqual(decision.actor, staff);
    assert.equal(decision.undoneAt, null);
    assert.equal(await duplicateOfId(harness, duplicate.id), canonical.id);
    assert.equal(await duplicateOfId(harness, canonical.id), null);
    const [event] = await harness.repo.eventsOfType(harness.workspaceId, "review_decided", "demo");
    assert.equal(event?.subjectId, duplicate.id);
    assert.equal(payloadOf(event).decisionId, decision.id);
    assert.equal(payloadOf(event).decision, "duplicate");
  });

  it("accepts the canonical on either side of the pair", async () => {
    const { canonical, duplicate, harness } = await backlogPair();

    await harness.review.decide(
      {
        canonicalId: canonical.id,
        decision: "duplicate",
        featureRequestId: canonical.id,
        otherId: duplicate.id,
      },
      staff,
    );

    assert.equal(await duplicateOfId(harness, duplicate.id), canonical.id);
  });

  it("refuses a self-reference", async () => {
    const { canonical, harness } = await backlogPair();

    await assert.rejects(markDuplicate(harness, canonical.id, canonical.id), {
      code: "invalid_decision",
      status: 422,
    });
  });

  it("refuses chains in both directions", async () => {
    const { canonical, duplicate, harness } = await backlogPair();
    const third = await addRequest(harness, "Third", unit(2));
    await markDuplicate(harness, duplicate.id, canonical.id);

    // Canonical that is itself a duplicate.
    await assert.rejects(markDuplicate(harness, third.id, duplicate.id), {
      code: "invalid_decision",
      status: 422,
    });
    // Marking a canonical that has duplicates as a duplicate of something else.
    await assert.rejects(markDuplicate(harness, canonical.id, third.id), {
      code: "invalid_decision",
      status: 422,
    });
    const active = await harness.repo.listReviewDecisions({
      activeOnly: true,
      featureRequestIds: [third.id],
    });
    assert.equal(active.length, 0);
    assert.equal(await duplicateOfId(harness, third.id), null);
  });

  it("withdraws the decision when storage refuses the association", async () => {
    const harness = await createHarness({
      reviewRepo: (repo) => ({
        ...repo,
        setDuplicateOf: async () => {
          await Promise.resolve();
          throw new Error("canonical feature request is itself a duplicate");
        },
      }),
    });
    const canonical = await addRequest(harness, "Canonical", unit(0));
    const duplicate = await addRequest(harness, "Duplicate", unit(1));

    await assert.rejects(markDuplicate(harness, duplicate.id, canonical.id), {
      code: "invalid_decision",
      status: 422,
    });

    // Withdrawn, not undone: no history entry, no Undo by the reviewer, no event.
    assert.deepEqual(
      await harness.repo.listReviewDecisions({ featureRequestIds: [duplicate.id] }),
      [],
    );
    const detail = await harness.service.get(duplicate.id);
    assert.deepEqual(detail.reviewHistory, []);
    const metrics = await reviewMetrics(harness);
    assert.deepEqual(metrics.undoRate, { decisions: 0, rate: null, undone: 0 });
    assert.deepEqual(
      await harness.repo.eventsOfType(harness.workspaceId, "review_decided", "demo"),
      [],
    );
  });

  it("refuses and withdraws when the request became a duplicate meanwhile", async () => {
    const race = { canonical: "", duplicate: "" };
    const harness = await createHarness({
      reviewRepo: (repo) => ({
        ...repo,
        // A concurrent decision lands between this decision's insert and its association.
        insertReviewDecision: async (input) => {
          const row = await repo.insertReviewDecision(input);
          await repo.setDuplicateOf(race.duplicate, race.canonical);
          return row;
        },
      }),
    });
    const canonical = await addRequest(harness, "Canonical", unit(0));
    const duplicate = await addRequest(harness, "Duplicate", unit(1));
    const elsewhere = await addRequest(harness, "Elsewhere", unit(2));
    Object.assign(race, { canonical: elsewhere.id, duplicate: duplicate.id });

    await assert.rejects(markDuplicate(harness, duplicate.id, canonical.id), (error: Error) => {
      assert.equal((error as Error & { code?: string }).code, "invalid_decision");
      assert.match(error.message, /already a duplicate/u);
      return true;
    });

    assert.equal(await duplicateOfId(harness, duplicate.id), elsewhere.id);
    assert.deepEqual(
      await harness.repo.listReviewDecisions({ featureRequestIds: [duplicate.id] }),
      [],
    );
  });

  it("refuses Related without a Shared Dimension and records it with one", async () => {
    const { canonical, duplicate, harness } = await backlogPair();

    await assert.rejects(
      harness.review.decide(
        { decision: "related", featureRequestId: duplicate.id, otherId: canonical.id },
        staff,
      ),
      { code: "invalid_decision", status: 422 },
    );

    const decision = await harness.review.decide(
      {
        decision: "related",
        featureRequestId: duplicate.id,
        otherId: canonical.id,
        sharedDimension: "manager approval",
      },
      staff,
    );

    assert.equal(decision.sharedDimension, "manager approval");
    const detail = await harness.service.get(canonical.id);
    assert.deepEqual(
      detail.relatedLinks.map((link) => [link.featureRequestId, link.sharedDimension, link.title]),
      [[duplicate.id, "manager approval", "Approve shift trades"]],
    );
    const other = await harness.service.get(duplicate.id);
    assert.equal(other.relatedLinks[0]?.featureRequestId, canonical.id);
  });

  it("shows the Product Manager's Shared Dimension over a stored Related Link", async () => {
    const { canonical, duplicate, harness } = await backlogPair();
    await harness.repo.insertRelatedLink({
      a: canonical.id,
      b: duplicate.id,
      reason: "both about approvals",
      sharedDimension: "approvals",
      source: "check",
    });

    const decision = await harness.review.decide(
      {
        decision: "related",
        featureRequestId: duplicate.id,
        otherId: canonical.id,
        sharedDimension: "manager approval",
      },
      staff,
    );

    const linksOf = async () => {
      const detail = await harness.service.get(canonical.id);
      return detail.relatedLinks.map((link) => [
        link.featureRequestId,
        link.sharedDimension,
        link.source,
      ]);
    };
    assert.deepEqual(await linksOf(), [[duplicate.id, "manager approval", "review"]]);
    await harness.review.undo(decision.id, staff);
    assert.deepEqual(await linksOf(), [[duplicate.id, "approvals", "check"]]);
  });

  it("records Distinct without touching the association", async () => {
    const { canonical, duplicate, harness } = await backlogPair();

    const decision = await harness.review.decide(
      { decision: "distinct", featureRequestId: duplicate.id, otherId: canonical.id },
      staff,
    );

    assert.equal(decision.decision, "distinct");
    assert.equal(await duplicateOfId(harness, duplicate.id), null);
  });

  it("refuses a second active decision on the same pair until undone", async () => {
    const { canonical, duplicate, harness } = await backlogPair();
    const first = await harness.review.decide(
      { decision: "distinct", featureRequestId: duplicate.id, otherId: canonical.id },
      staff,
    );

    await assert.rejects(markDuplicate(harness, canonical.id, duplicate.id), (error: unknown) => {
      const { code, message } = error as { code: string; message: string };
      assert.equal(code, "invalid_decision");
      assert.match(message, /undo/iu);
      return true;
    });

    await harness.review.undo(first.id, staff);
    await markDuplicate(harness, canonical.id, duplicate.id);
    assert.equal(await duplicateOfId(harness, canonical.id), duplicate.id);
  });

  it("refuses rule violations, unknown ids and invalid input", async () => {
    const { canonical, duplicate, harness } = await backlogPair();

    await assert.rejects(
      harness.review.decide(
        { decision: "duplicate", featureRequestId: duplicate.id, otherId: canonical.id },
        staff,
      ),
      { code: "invalid_decision", status: 422 },
    );
    await assert.rejects(
      harness.review.decide(
        { decision: "distinct", featureRequestId: duplicate.id, otherId: MISSING },
        staff,
      ),
      { code: "not_found", status: 404 },
    );
    await assert.rejects(
      harness.review.decide(
        { decision: "distinct", featureRequestId: MISSING, otherId: canonical.id },
        staff,
      ),
      { code: "not_found", status: 404 },
    );
    await assert.rejects(
      harness.review.decide(
        {
          decision: "distinct",
          featureRequestId: duplicate.id,
          otherId: canonical.id,
          suggestionId: MISSING,
        },
        staff,
      ),
      { code: "not_found", status: 404 },
    );
    await assert.rejects(
      harness.review.decide({ decision: "maybe", featureRequestId: "bogus" } as never, staff),
      { code: "invalid_input", status: 400 },
    );
  });
});

describe("review undo", () => {
  it("restores evidence and metrics and keeps the history", async () => {
    const { canonical, duplicate, harness } = await backlogPair();
    await harness.service.support(duplicate.id, { actor: staff, onBehalfOf: cedar });
    const before = await reviewMetrics(harness);
    const decision = await markDuplicate(harness, duplicate.id, canonical.id);
    assert.notDeepEqual(await reviewMetrics(harness), before);
    const merged = await harness.service.get(canonical.id);
    assert.equal(merged.supports.length, 1);

    const undone = await harness.review.undo(decision.id, staff);

    assert.equal(undone.id, decision.id);
    assert.ok(undone.undoneAt);
    assert.deepEqual(undone.undoneBy, staff);
    assert.equal(await duplicateOfId(harness, duplicate.id), null);
    const detail = await harness.service.get(canonical.id);
    assert.deepEqual(detail.supports, []);
    assert.deepEqual(detail.duplicates, []);
    assert.deepEqual(
      detail.reviewHistory?.map((entry) => [entry.id, Boolean(entry.undoneAt)]),
      [[decision.id, true]],
    );
    const after = await reviewMetrics(harness);
    assert.deepEqual(
      { ...after, undoRate: before.undoRate },
      { ...before, undoRate: before.undoRate },
    );
    assert.deepEqual(after.undoRate, { decisions: 1, rate: 1, undone: 1 });
    const [event] = await harness.repo.eventsOfType(harness.workspaceId, "review_undone", "demo");
    assert.equal(payloadOf(event).decisionId, decision.id);
    const queue = await harness.review.queue();
    assert.equal(queue.counts.backlog, 2);
  });

  it("refuses an already-undone decision and unknown ids", async () => {
    const { canonical, duplicate, harness } = await backlogPair();
    const decision = await markDuplicate(harness, duplicate.id, canonical.id);
    await harness.review.undo(decision.id, staff);

    await assert.rejects(harness.review.undo(decision.id, staff), {
      code: "already_undone",
      status: 409,
    });
    await assert.rejects(harness.review.undo(MISSING, staff), { code: "not_found", status: 404 });
    await assert.rejects(harness.review.undo("bogus", staff), { code: "not_found", status: 404 });
  });

  it("removes the Related Link a Related decision created", async () => {
    const { canonical, duplicate, harness } = await backlogPair();
    const decision = await harness.review.decide(
      {
        decision: "related",
        featureRequestId: duplicate.id,
        otherId: canonical.id,
        sharedDimension: "manager approval",
      },
      staff,
    );

    await harness.review.undo(decision.id, staff);

    const detail = await harness.service.get(canonical.id);
    assert.deepEqual(detail.relatedLinks, []);
  });
});

describe("canonical evidence", () => {
  it("shows duplicates' Supports and Comments with provenance, each Account once", async () => {
    const { canonical, duplicate, harness } = await backlogPair();
    await harness.service.support(canonical.id, { actor: staff, onBehalfOf: cedar });
    await harness.service.support(duplicate.id, {
      actor: staff,
      onBehalfOf: cedar,
      quote: "Managers must approve",
    });
    await harness.service.support(duplicate.id, {
      actor: staff,
      onBehalfOf: { account: { name: "Birch Cafe" } },
    });
    await harness.service.comment(duplicate.id, { actor: staff, body: "Same at Birch" });
    const decision = await markDuplicate(harness, duplicate.id, canonical.id);

    const detail = await harness.service.get(canonical.id);

    const via = { featureRequestId: duplicate.id, title: "Approve shift trades" };
    assert.equal(detail.supports.length, 3);
    assert.equal(detail.supportCount, 3);
    assert.equal(detail.accountCount, 2);
    const viaSupports = detail.supports.filter((support) => support.via);
    assert.deepEqual(
      viaSupports.map((support) => [support.account.name, support.quote, support.via]).toSorted(),
      [
        ["Birch Cafe", null, via],
        ["Cedar Market", "Managers must approve", via],
      ],
    );
    assert.deepEqual(
      detail.comments.map((comment) => [comment.body, comment.via]),
      [["Same at Birch", via]],
    );
    assert.deepEqual(
      detail.duplicates?.map((entry) => [entry.id, entry.title]),
      [[via.featureRequestId, via.title]],
    );
    assert.equal(detail.duplicateOf, null);
    assert.deepEqual(
      detail.reviewHistory?.map((entry) => entry.id),
      [decision.id],
    );

    const page = await harness.service.get(duplicate.id);
    assert.deepEqual(page.duplicateOf, { id: canonical.id, title: "Manager approval for swaps" });
    assert.deepEqual(page.duplicates, []);
    assert.equal(
      page.supports.every((support) => !support.via),
      true,
    );
  });

  it("shows each duplicate's original words, Account and requester, each Account once", async () => {
    const harness = await createHarness({});
    const canonical = await addRequest(harness, "ADP payroll integration", unit(0));
    const saffron = await harness.repo.upsertAccount({
      name: "Saffron & Sage",
      plan: "Pro",
      segment: "restaurant",
      size: "3 locations",
      workspaceId: harness.workspaceId,
    });
    const gusto = await harness.repo.insertFeatureRequest({
      createdByActorName: "Ana",
      createdByActorType: "staff",
      description: "We use Gusto. Can Crewday send hours there automatically?",
      embedding: unit(1),
      onBehalfOfAccountId: saffron.id,
      origin: "demo",
      requesterName: "Omar",
      title: "Gusto integration for hours",
      underlyingNeed: null,
      workspaceId: harness.workspaceId,
    });
    await markDuplicate(harness, gusto.id, canonical.id);

    const detail = await harness.service.get(canonical.id);

    assert.equal(detail.accountCount, 1);
    assert.deepEqual(detail.duplicates, [
      {
        account: {
          name: "Saffron & Sage",
          plan: "Pro",
          segment: "restaurant",
          size: "3 locations",
        },
        createdAt: gusto.createdAt.toISOString(),
        createdBy: { name: "Ana", type: "staff" },
        description: "We use Gusto. Can Crewday send hours there automatically?",
        id: gusto.id,
        requester: "Omar",
        title: "Gusto integration for hours",
      },
    ]);

    // The originating Account also supporting the canonical still counts once.
    await harness.service.support(canonical.id, {
      actor: staff,
      onBehalfOf: { account: { name: "Saffron & Sage" } },
    });
    await harness.service.support(canonical.id, { actor: staff, onBehalfOf: cedar });
    const supported = await harness.service.get(canonical.id);
    assert.equal(supported.accountCount, 2);

    // A duplicate filed without an Account adds none.
    const bare = await addRequest(harness, "Payroll export", unit(2));
    await markDuplicate(harness, bare.id, canonical.id);
    const withBare = await harness.service.get(canonical.id);
    assert.equal(withBare.accountCount, 2);
    const bareView = withBare.duplicates?.find((duplicate) => duplicate.id === bare.id);
    assert.equal(bareView?.account, null);
    assert.equal(bareView?.requester, null);
    assert.equal(bareView?.description, "Payroll export description");
  });

  it("fills empty review fields on a request never reviewed", async () => {
    const harness = await createHarness({});
    const row = await addRequest(harness, "Lonely", unit(0));

    const detail = await harness.service.get(row.id);

    assert.deepEqual(detail.duplicates, []);
    assert.equal(detail.duplicateOf, null);
    assert.deepEqual(detail.reviewHistory, []);
  });
});

describe("review metrics", () => {
  it("reports null rates with zero counts on an empty workspace", async () => {
    const harness = await createHarness({});

    assert.deepEqual(await harness.review.metrics(), {
      backlogBaseline: { duplicates: 0, rate: null, reviewed: 0 },
      checks: 0,
      checksWithSameNeed: 0,
      createsAfterSameNeed: 0,
      intakeDuplicateRate: { duplicates: 0, rate: null, reviewed: 0 },
      origin: "demo",
      reviewCoverage: { rate: null, reviewed: 0, total: 0 },
      suggestionAcceptance: null,
      suspectedDuplication: { open: 0, rate: null, total: 0 },
      undoRate: { decisions: 0, rate: null, undone: 0 },
    });
  });

  it("keeps rates null while nothing is reviewed and reports counts", async () => {
    const { harness } = await backlogPair();
    await addNewRequest(harness, "New one", unit(5));

    const metrics = await reviewMetrics(harness);

    assert.deepEqual(metrics.intakeDuplicateRate, { duplicates: 0, rate: null, reviewed: 0 });
    assert.deepEqual(metrics.reviewCoverage, { rate: 0, reviewed: 0, total: 1 });
    assert.deepEqual(metrics.suspectedDuplication, { open: 2, rate: 2 / 3, total: 3 });
    assert.deepEqual(metrics.backlogBaseline, { duplicates: 0, rate: null, reviewed: 0 });
  });

  it("splits new and backlog requests on small denominators", async () => {
    const { canonical, duplicate, harness } = await backlogPair();
    const freshDuplicate = await addNewRequest(harness, "New duplicate", unit(5));
    const freshDistinct = await addNewRequest(harness, "New distinct", unit(6));
    await addNewRequest(harness, "New unreviewed", unit(7));
    await markDuplicate(harness, duplicate.id, canonical.id);
    await markDuplicate(harness, freshDuplicate.id, canonical.id);
    await harness.review.decide({ decision: "none", featureRequestId: freshDistinct.id }, staff);

    const metrics = await reviewMetrics(harness);

    assert.deepEqual(metrics.intakeDuplicateRate, { duplicates: 1, rate: 0.5, reviewed: 2 });
    assert.deepEqual(metrics.reviewCoverage, { rate: 2 / 3, reviewed: 2, total: 3 });
    // Both reviewed backlog sides of the Duplicate pair count: they are the same need.
    assert.deepEqual(metrics.backlogBaseline, { duplicates: 2, rate: 1, reviewed: 2 });
    assert.deepEqual(metrics.suspectedDuplication, { open: 0, rate: 0, total: 3 });
    assert.deepEqual(metrics.undoRate, { decisions: 2, rate: 0, undone: 0 });
  });
});

describe("review metrics are canonical-independent", () => {
  it("counts a new request as duplicate when the backlog side is marked its duplicate", async () => {
    const harness = await createHarness({});
    const n = await addNewRequest(harness, "New request", unit(0));
    const o = await addRequest(harness, "Old request", unit(1));
    // From the new request's side, the PM keeps N as canonical and marks backlog O its duplicate.
    await harness.review.decide(
      { canonicalId: n.id, decision: "duplicate", featureRequestId: n.id, otherId: o.id },
      staff,
    );
    assert.equal(await duplicateOfId(harness, o.id), n.id);

    let metrics = await reviewMetrics(harness);
    assert.deepEqual(metrics.intakeDuplicateRate, { duplicates: 1, rate: 1, reviewed: 1 });
    // O is only named as the other side, with no suspicion: not reviewed, so no baseline gain.
    assert.deepEqual(metrics.backlogBaseline, { duplicates: 0, rate: null, reviewed: 0 });

    const p = await addRequest(harness, "Unrelated backlog", unit(2));
    await harness.review.decide(
      { decision: "distinct", featureRequestId: o.id, otherId: p.id },
      staff,
    );
    metrics = await reviewMetrics(harness);
    assert.deepEqual(metrics.backlogBaseline, { duplicates: 1, rate: 1, reviewed: 1 });
  });
});

describe("reviewed means covered as a whole", () => {
  it("does not review a request with no suspicions named only as another pair's other side", async () => {
    const harness = await createHarness({});
    const fresh = await addNewRequest(harness, "New request", unit(0));
    const backlog = await addRequest(harness, "Backlog", unit(1));

    await harness.review.decide(
      { decision: "distinct", featureRequestId: backlog.id, otherId: fresh.id },
      staff,
    );

    const queue = await harness.review.queue();
    assert.ok(queue.items.some((item) => item.featureRequest.id === fresh.id));
    const metrics = await reviewMetrics(harness);
    assert.deepEqual(metrics.reviewCoverage, { rate: 0, reviewed: 0, total: 1 });
  });

  it("reviews a request once a decision covers each of its suspected pairs", async () => {
    const harness = await createHarness({});
    const fresh = await addNewRequest(harness, "New request", unit(0));
    const backlog = await addRequest(harness, "Backlog", unit(1));
    await suspect(harness, fresh.id, backlog.id);

    await harness.review.decide(
      { decision: "distinct", featureRequestId: backlog.id, otherId: fresh.id },
      staff,
    );

    const queue = await harness.review.queue();
    assert.ok(!queue.items.some((item) => item.featureRequest.id === fresh.id));
    const metrics = await reviewMetrics(harness);
    assert.deepEqual(metrics.reviewCoverage, { rate: 1, reviewed: 1, total: 1 });
  });
});

const sameNeed = (ids: string[]) => ({
  judgments: ids.map((id) => ({
    featureRequestId: id,
    reason: "same approval flow",
    sharedDimension: null,
    verdict: "same_need" as const,
  })),
  underlyingNeed: "Control over schedule changes",
});

const sameNeedCandidate = (featureRequestId: string, reason: string) => ({
  featureRequestId,
  reason,
  sharedDimension: null,
  title: "t",
  verdict: "same_need" as const,
});

describe("checks and creates respect review", () => {
  const draft = { description: "Managers sign off", title: "Managers approve swaps" };

  it("skips confirmed duplicates so the canonical is offered instead", async () => {
    const harness = await createHarness({ vectors: { Managers: unit(0) } });
    const canonical = await addRequest(harness, "Manager approval", unit(1));
    const duplicate = await addRequest(harness, "Approve trades", unit(0));
    await markDuplicate(harness, duplicate.id, canonical.id);
    harness.judge.state.behavior = { build: sameNeed, kind: "output" };

    const result = await harness.service.check({ actor: staff, draft });

    const offered = harness.judge.state.calls[0]?.candidates.map((c) => c.featureRequestId);
    assert.deepEqual(offered, [canonical.id]);
    assert.deepEqual(
      result.candidates.map((candidate) => candidate.featureRequestId),
      [canonical.id],
    );
  });

  it("records a Suspected Duplicate when a create skips a Same Need candidate", async () => {
    const harness = await createHarness({ vectors: { Managers: unit(0) } });
    const existing = await addRequest(harness, "Manager approval", unit(0));
    harness.judge.state.behavior = { build: sameNeed, kind: "output" };
    const check = await harness.service.check({ actor: staff, draft });

    const created = await harness.service.create({
      actor: staff,
      checkId: check.checkId,
      draft,
      skipReason: "Different team owns approvals",
    });

    const [row] = await harness.repo.listSuspectedDuplicates([created.id]);
    assert.equal(row?.source, "check");
    assert.equal(row?.reason, "same approval flow");
    assert.equal(row?.model, null);
    assert.deepEqual(
      [row?.featureRequestAId, row?.featureRequestBId].toSorted(),
      [created.id, existing.id].toSorted(),
    );
    const queue = await harness.review.queue();
    const item = queue.items.find((entry) => entry.featureRequest.id === created.id);
    assert.equal(item?.isNew, true);
    assert.equal(item?.suspicions[0]?.other.id, existing.id);
    assert.equal(item?.suspicions[0]?.source, "check");
  });

  it("skips Check candidates with a blank reason when recording suspicions", async () => {
    const harness = await createHarness({ vectors: { Managers: unit(0) } });
    const kept = await addRequest(harness, "Manager approval", unit(0));
    const blank = await addRequest(harness, "Approve swaps", unit(1));
    const checkId = crypto.randomUUID();
    await harness.repo.insertCheck({
      actorName: staff.name,
      actorType: staff.type,
      createdAt: harness.clock.now,
      draft,
      draftHash: draftHash(draft),
      expiresAt: new Date(harness.clock.now.getTime() + 60_000),
      id: checkId,
      origin: "demo",
      result: {
        candidates: [
          sameNeedCandidate(kept.id, "same approval flow"),
          sameNeedCandidate(blank.id, "   "),
        ],
        checkId,
        consideredCount: 2,
        degraded: false,
        expiresAt: new Date(harness.clock.now.getTime() + 60_000).toISOString(),
        nextAction: "support_or_comment",
        underlyingNeed: null,
      },
      workspaceId: harness.workspaceId,
    });

    const created = await harness.service.create({
      actor: staff,
      checkId,
      draft,
      skipReason: "Different team owns approvals",
    });

    const rows = await harness.repo.listSuspectedDuplicates([created.id]);
    assert.deepEqual(
      rows.map((row) => [row.featureRequestAId, row.featureRequestBId].toSorted()),
      [[created.id, kept.id].toSorted()],
    );
  });

  it("records no suspicion when the Check had no Same Need candidate", async () => {
    const harness = await createHarness({ vectors: { Managers: unit(0) } });
    await addRequest(harness, "Manager approval", unit(0));
    const check = await harness.service.check({ actor: staff, draft });

    const created = await harness.service.create({ actor: staff, checkId: check.checkId, draft });

    assert.deepEqual(await harness.repo.listSuspectedDuplicates([created.id]), []);
  });
});

describe("review scan", () => {
  it("delegates to the scan dependency", async () => {
    const calls: unknown[] = [];
    const harness = await createHarness({
      scan: async (options) => {
        calls.push(options);
        await Promise.resolve();
        return { pairsFound: 1, remaining: 0, scanned: 2 };
      },
    });

    assert.deepEqual(await harness.review.scan({ limit: 5 }), {
      pairsFound: 1,
      remaining: 0,
      scanned: 2,
    });
    assert.deepEqual(calls, [{ limit: 5 }]);
  });

  it("is unavailable when no scan is wired", async () => {
    const harness = await createHarness({});

    await assert.rejects(harness.review.scan(), { code: "service_unavailable", status: 503 });
  });
});
