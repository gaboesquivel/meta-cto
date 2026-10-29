import { describe, expect, it } from "vitest";

import type {
  CommentView,
  DuplicateEvidence,
  ReviewDecision,
  ReviewMetrics,
  SupportView,
} from "@/lib/signal/contracts";

import {
  buildDecisionBody,
  canonicalIdFor,
  describeDecision,
  duplicateOriginLabel,
  formatRate,
  groupEvidenceByAccount,
  metricCards,
  reviewActionState,
  splitCommentsByVia,
} from "./review-view";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const S = "33333333-3333-4333-8333-333333333333";

const reviewMetrics = (overrides: Partial<ReviewMetrics> = {}): ReviewMetrics => ({
  backlogBaseline: { duplicates: 3, rate: 0.25, reviewed: 12 },
  checks: 10,
  checksWithSameNeed: 4,
  createsAfterSameNeed: 1,
  intakeDuplicateRate: { duplicates: 1, rate: 0.1, reviewed: 10 },
  reviewCoverage: { rate: 0.5, reviewed: 10, total: 20 },
  suggestionAcceptance: 0.75,
  suspectedDuplication: { open: 2, rate: 2 / 30, total: 30 },
  undoRate: { decisions: 4, rate: 0.25, undone: 1 },
  ...overrides,
});

const support = (
  id: string,
  account: string,
  via?: { featureRequestId: string; title: string },
): SupportView => ({
  account: { name: account, plan: null, segment: null, size: null },
  actor: { name: "Ana", type: "staff" },
  createdAt: "2026-10-28T00:00:00.000Z",
  id,
  quote: `quote ${id}`,
  requester: null,
  ...(via ? { via } : {}),
});

const decision = (overrides: Partial<ReviewDecision> = {}): ReviewDecision => ({
  actor: { name: "Priya", type: "staff" },
  canonicalId: null,
  createdAt: "2026-10-28T00:00:00.000Z",
  decision: "distinct",
  featureRequestId: A,
  id: "d1",
  otherId: B,
  sharedDimension: null,
  suggestionId: S,
  undoneAt: null,
  undoneBy: null,
  ...overrides,
});

describe("formatRate", () => {
  it("shows a dash when there is no rate", () => {
    expect(formatRate(null)).toBe("—");
  });

  it("shows zero as 0%, not a dash", () => {
    expect(formatRate(0)).toBe("0%");
  });

  it("rounds to whole percents, with one decimal below 10%", () => {
    expect(formatRate(0.25)).toBe("25%");
    expect(formatRate(1 / 3)).toBe("33%");
    expect(formatRate(2 / 30)).toBe("6.7%");
    expect(formatRate(1)).toBe("100%");
  });
});

describe("metricCards", () => {
  it("formats each headline metric with numerator and denominator", () => {
    const cards = metricCards(reviewMetrics());
    expect(cards.map((card) => card.key)).toEqual([
      "intakeDuplicateRate",
      "reviewCoverage",
      "suspectedDuplication",
    ]);
    const [intake, coverage, suspected] = cards;
    expect(intake?.value).toBe("10%");
    expect(intake?.counts).toBe("1 of 10 reviewed new Feature Requests confirmed Duplicate");
    expect(intake?.comparison).toEqual({
      counts: "3 of 12 reviewed",
      label: "Backlog baseline",
      value: "25%",
    });
    expect(coverage?.value).toBe("50%");
    expect(coverage?.counts).toBe("10 of 20 new Feature Requests reviewed");
    expect(suspected?.value).toBe("6.7%");
    expect(suspected?.counts).toBe("2 of 30 open Feature Requests");
    expect(suspected?.aiSuspected).toBe(true);
  });

  it("shows a dash with zero counts when nothing is reviewed yet", () => {
    const cards = metricCards(
      reviewMetrics({
        backlogBaseline: { duplicates: 0, rate: null, reviewed: 0 },
        intakeDuplicateRate: { duplicates: 0, rate: null, reviewed: 0 },
        reviewCoverage: { rate: null, reviewed: 0, total: 0 },
        suspectedDuplication: { open: 0, rate: 0, total: 5 },
      }),
    );
    expect(cards[0]?.value).toBe("—");
    expect(cards[0]?.counts).toBe("0 of 0 reviewed new Feature Requests confirmed Duplicate");
    expect(cards[0]?.comparison?.value).toBe("—");
    expect(cards[1]?.value).toBe("—");
    expect(cards[2]?.value).toBe("0%");
  });

  it("shows dashes without counts while there is no data", () => {
    const cards = metricCards(null);
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card.value).toBe("—");
      expect(card.counts).toBe("No data yet");
    }
    expect(cards[0]?.comparison?.value).toBe("—");
  });
});

describe("canonicalIdFor", () => {
  it("picks the Feature Request on the chosen side", () => {
    expect(canonicalIdFor({ featureRequestId: A, otherId: B }, "this")).toBe(A);
    expect(canonicalIdFor({ featureRequestId: A, otherId: B }, "other")).toBe(B);
  });
});

describe("buildDecisionBody", () => {
  const actorName = " Priya ";

  it("builds a Duplicate with the chosen canonical and the suggestion it answers", () => {
    expect(
      buildDecisionBody({
        actorName,
        canonical: "other",
        decision: "duplicate",
        featureRequestId: A,
        otherId: B,
        suggestionId: S,
      }),
    ).toEqual({
      body: {
        actor: { name: "Priya", type: "staff" },
        canonicalId: B,
        decision: "duplicate",
        featureRequestId: A,
        otherId: B,
        suggestionId: S,
      },
      ok: true,
    });
  });

  it("requires a canonical for a Duplicate", () => {
    const result = buildDecisionBody({
      actorName,
      decision: "duplicate",
      featureRequestId: A,
      otherId: B,
    });
    expect(result.ok).toBe(false);
  });

  it("requires a Shared Dimension for Related and trims it", () => {
    expect(
      buildDecisionBody({
        actorName,
        decision: "related",
        featureRequestId: A,
        otherId: B,
        sharedDimension: "   ",
      }),
    ).toEqual({ message: "Related needs the Shared Dimension you see in both.", ok: false });
    const related = buildDecisionBody({
      actorName,
      decision: "related",
      featureRequestId: A,
      otherId: B,
      sharedDimension: " shift-change governance ",
    });
    expect(related.ok && related.body.sharedDimension).toBe("shift-change governance");
    expect(related.ok && related.body).not.toHaveProperty("canonicalId");
  });

  it("builds Distinct and none without extra fields", () => {
    const distinct = buildDecisionBody({
      actorName,
      decision: "distinct",
      featureRequestId: A,
      otherId: B,
      sharedDimension: "ignored",
    });
    expect(distinct.ok && distinct.body).toEqual({
      actor: { name: "Priya", type: "staff" },
      decision: "distinct",
      featureRequestId: A,
      otherId: B,
    });
    const none = buildDecisionBody({ actorName, decision: "none", featureRequestId: A });
    expect(none.ok && none.body).toEqual({
      actor: { name: "Priya", type: "staff" },
      decision: "none",
      featureRequestId: A,
    });
  });

  it("requires the reviewer's name", () => {
    expect(
      buildDecisionBody({ actorName: " ", decision: "none", featureRequestId: A }),
    ).toMatchObject({ ok: false });
  });
});

describe("reviewActionState", () => {
  it("asks for Operator sign-in first", () => {
    expect(reviewActionState({ actorName: "Priya", operator: false, pending: false })).toEqual({
      enabled: false,
      reason: "sign_in",
    });
  });

  it("asks for a name, then waits while pending", () => {
    expect(reviewActionState({ actorName: " ", operator: true, pending: false })).toEqual({
      enabled: false,
      reason: "name",
    });
    expect(reviewActionState({ actorName: "Priya", operator: true, pending: true })).toEqual({
      enabled: false,
      reason: "pending",
    });
    expect(reviewActionState({ actorName: "Priya", operator: true, pending: false })).toEqual({
      enabled: true,
      reason: null,
    });
  });
});

describe("groupEvidenceByAccount", () => {
  const via = { featureRequestId: B, title: "Swap sync" };

  it("counts each Account once across the canonical and its duplicates", () => {
    const groups = groupEvidenceByAccount([
      support("1", "Cedar Market"),
      support("2", "Harbor Bistro Group", via),
      support("3", "Cedar Market", via),
    ]);
    expect(groups.map((group) => group.account.name)).toEqual([
      "Cedar Market",
      "Harbor Bistro Group",
    ]);
    expect(groups[0]?.supports.map((item) => item.id)).toEqual(["1", "3"]);
    expect(groups[0]?.vias).toEqual([via]);
    expect(groups[1]?.vias).toEqual([via]);
  });

  it("lists each source Feature Request once per Account", () => {
    const other = { featureRequestId: A, title: "Trades missing" };
    const groups = groupEvidenceByAccount([
      support("1", "Cedar Market", via),
      support("2", "Cedar Market", via),
      support("3", "Cedar Market", other),
    ]);
    expect(groups[0]?.vias).toEqual([via, other]);
  });

  it("returns no groups without Supports", () => {
    expect(groupEvidenceByAccount([])).toEqual([]);
  });

  const gusto: DuplicateEvidence = {
    account: { name: "Saffron & Sage", plan: "Pro", segment: "restaurant", size: "3 locations" },
    createdAt: "2026-10-20T00:00:00.000Z",
    createdBy: { name: "Ana", type: "staff" },
    description: "We use Gusto. Can Crewday send hours there automatically?",
    id: B,
    requester: "Omar",
    title: "Gusto integration for hours",
  };

  it("adds each duplicate's originating Account once, with its original words", () => {
    const groups = groupEvidenceByAccount(
      [support("1", "Cedar Market"), support("2", "Saffron & Sage")],
      [gusto, { ...gusto, account: null, id: A, requester: null, title: "Payroll export" }],
    );
    expect(groups.map((group) => group.account.name)).toEqual(["Cedar Market", "Saffron & Sage"]);
    expect(groups[0]?.origins).toEqual([]);
    expect(groups[1]?.origins).toEqual([gusto]);
    expect(groups[1]?.supports.map((item) => item.id)).toEqual(["2"]);
    expect(groups[1]?.account.plan).toBeNull();
  });

  it("groups an originating Account that has no Support", () => {
    const groups = groupEvidenceByAccount([], [gusto]);
    expect(groups).toEqual([{ account: gusto.account, origins: [gusto], supports: [], vias: [] }]);
  });

  it("labels a duplicate's origin with its title", () => {
    expect(duplicateOriginLabel(gusto)).toBe(
      "Filed as Gusto integration for hours · via duplicate",
    );
  });
});

describe("splitCommentsByVia", () => {
  it("counts Comments recorded on duplicates", () => {
    const comment = (id: string, withVia: boolean): CommentView => ({
      account: null,
      actor: { name: "Ana", type: "staff" },
      body: "b",
      createdAt: "2026-10-28T00:00:00.000Z",
      id,
      ...(withVia ? { via: { featureRequestId: B, title: "Swap sync" } } : {}),
    });
    expect(splitCommentsByVia([comment("1", false), comment("2", true)])).toEqual({
      direct: 1,
      viaDuplicates: 1,
    });
  });
});

describe("describeDecision", () => {
  const titles = new Map([
    [A, "Trades missing"],
    [B, "Swap sync"],
  ]);

  it("names the canonical for a Duplicate", () => {
    expect(describeDecision(decision({ canonicalId: B, decision: "duplicate" }), titles)).toBe(
      "Duplicate: “Trades missing” → canonical “Swap sync”",
    );
  });

  it("states Related with its Shared Dimension, Distinct and none", () => {
    expect(
      describeDecision(decision({ decision: "related", sharedDimension: "approvals" }), titles),
    ).toBe("Related: “Trades missing” and “Swap sync” share approvals");
    expect(describeDecision(decision(), titles)).toBe("Distinct: “Trades missing” and “Swap sync”");
    expect(describeDecision(decision({ decision: "none", otherId: null }), titles)).toBe(
      "No duplicates: “Trades missing”",
    );
  });

  it("falls back when a title is unknown", () => {
    expect(describeDecision(decision(), new Map())).toBe(
      "Distinct: “a Feature Request” and “a Feature Request”",
    );
  });
});
