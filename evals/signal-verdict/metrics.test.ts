import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { computeMetrics, KILL_LINE } from "./metrics";
import type { ScoredPair } from "./metrics";

const pair = (
  expected: ScoredPair["expected"],
  predicted: ScoredPair["predicted"],
): ScoredPair => ({ expected, predicted });

describe("computeMetrics", () => {
  test("computes same-need precision and recall", () => {
    const metrics = computeMetrics([
      pair("same_need", "same_need"),
      pair("same_need", "same_need"),
      pair("same_need", "related_need"),
      pair("related_need", "same_need"),
      pair("different", "different"),
    ]);
    assert.equal(metrics.sameNeed.predicted, 3);
    assert.equal(metrics.sameNeed.truePositives, 2);
    assert.equal(metrics.sameNeed.expected, 3);
    assert.equal(metrics.sameNeed.precision, 2 / 3);
    assert.equal(metrics.sameNeed.recall, 2 / 3);
  });

  test("computes related-need precision", () => {
    const metrics = computeMetrics([
      pair("related_need", "related_need"),
      pair("different", "related_need"),
      pair("same_need", "related_need"),
      pair("related_need", "different"),
    ]);
    assert.equal(metrics.relatedNeed.predicted, 3);
    assert.equal(metrics.relatedNeed.truePositives, 1);
    assert.equal(metrics.relatedNeed.precision, 1 / 3);
    assert.equal(metrics.relatedNeed.recall, 1 / 2);
  });

  test("treats an absent target as a miss, never a positive", () => {
    const metrics = computeMetrics([pair("same_need", "absent"), pair("same_need", "same_need")]);
    assert.equal(metrics.absent, 1);
    assert.equal(metrics.sameNeed.precision, 1);
    assert.equal(metrics.sameNeed.recall, 1 / 2);
  });

  test("returns null rates when there is nothing to divide by", () => {
    const metrics = computeMetrics([pair("different", "different")]);
    assert.equal(metrics.sameNeed.precision, null);
    assert.equal(metrics.sameNeed.recall, null);
    assert.equal(metrics.relatedNeed.precision, null);
  });

  test("counts totals, exact matches and the confusion matrix", () => {
    const metrics = computeMetrics([
      pair("same_need", "same_need"),
      pair("related_need", "unknown"),
      pair("different", "absent"),
    ]);
    assert.equal(metrics.total, 3);
    assert.equal(metrics.exactMatches, 1);
    assert.equal(metrics.unknown, 1);
    assert.equal(metrics.confusion.same_need.same_need, 1);
    assert.equal(metrics.confusion.related_need.unknown, 1);
    assert.equal(metrics.confusion.different.absent, 1);
  });

  test("flags the kill line on same-need precision", () => {
    assert.equal(KILL_LINE, 0.85);
    const below = computeMetrics([pair("same_need", "same_need"), pair("different", "same_need")]);
    assert.equal(below.belowKillLine, true);
    const above = computeMetrics([pair("same_need", "same_need")]);
    assert.equal(above.belowKillLine, false);
    const empty = computeMetrics([]);
    assert.equal(empty.belowKillLine, null);
  });
});
