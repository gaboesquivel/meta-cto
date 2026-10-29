import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { decideInputSchema, decisionRuleViolation, isReviewMetrics, rateOf } from "./contracts";
import type { DecideInput } from "./contracts";

const a = "00000000-0000-4000-8000-0000000000a1";
const b = "00000000-0000-4000-8000-0000000000b2";

const violation = (input: Omit<DecideInput, "featureRequestId">) =>
  decisionRuleViolation({ featureRequestId: a, ...input });

describe("review contracts", () => {
  it("accepts well-formed decisions", () => {
    assert.equal(violation({ canonicalId: b, decision: "duplicate", otherId: b }), null);
    assert.equal(violation({ decision: "related", otherId: b, sharedDimension: "Trades" }), null);
    assert.equal(violation({ decision: "distinct", otherId: b }), null);
    assert.equal(violation({ decision: "none" }), null);
  });

  it("refuses decisions that break the association rules", () => {
    assert.match(String(violation({ decision: "duplicate", otherId: b })), /canonicalId/u);
    assert.match(String(violation({ decision: "related", otherId: b })), /Shared Dimension/u);
    assert.match(String(violation({ decision: "distinct", otherId: a })), /itself/u);
    assert.match(String(violation({ decision: "distinct" })), /otherId/u);
    assert.match(String(violation({ decision: "none", otherId: b })), /none/u);
    assert.match(
      String(violation({ canonicalId: b, decision: "distinct", otherId: b })),
      /Only a Duplicate/u,
    );
    assert.match(
      String(violation({ decision: "distinct", otherId: b, sharedDimension: "x" })),
      /Only Related/u,
    );
  });

  it("leaves rule checks to the service so they return invalid_decision", () => {
    const parsed = decideInputSchema.safeParse({
      decision: "related",
      featureRequestId: a,
      otherId: b,
    });
    assert.equal(parsed.success, true);
    assert.equal(
      decideInputSchema.safeParse({ decision: "merge", featureRequestId: a }).success,
      false,
    );
  });

  it("reports a null rate for an empty denominator", () => {
    assert.equal(rateOf(0, 0), null);
    assert.equal(rateOf(1, 4), 0.25);
  });

  it("tells spec 002 metrics from the spec 001 placeholder", () => {
    const base = {
      checks: 0,
      checksWithSameNeed: 0,
      createsAfterSameNeed: 0,
      suggestionAcceptance: null,
    };
    assert.equal(isReviewMetrics({ ...base, fragmentationRate: null, reviewCoverage: 0 }), false);
    const counts = { duplicates: 0, rate: null, reviewed: 0 };
    assert.equal(
      isReviewMetrics({
        ...base,
        backlogBaseline: counts,
        intakeDuplicateRate: counts,
        reviewCoverage: { rate: null, reviewed: 0, total: 0 },
        suspectedDuplication: { open: 0, rate: null, total: 0 },
        undoRate: { decisions: 0, rate: null, undone: 0 },
      }),
      true,
    );
  });
});
