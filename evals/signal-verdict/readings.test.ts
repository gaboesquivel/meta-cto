import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { computeMetrics } from "./metrics";
import type { ScoredPair } from "./metrics";
import {
  MIN_SAME_NEED_POSITIVES,
  precisionReading,
  RELATED_NEED_BAR,
  SAME_NEED_BAR,
  v2Readings,
  verdictFor,
  wilsonInterval,
} from "./readings";

const close = (actual: number | undefined, expected: number) =>
  assert.ok(actual !== undefined && Math.abs(actual - expected) < 1e-4, `${actual} != ${expected}`);

const reading = (truePositives: number, predicted: number) =>
  precisionReading({ predicted, truePositives });

const pairs = (n: number, pair: ScoredPair): ScoredPair[] => Array.from({ length: n }, () => pair);

describe("wilsonInterval", () => {
  test("matches the textbook 95% interval", () => {
    const interval = wilsonInterval(8, 10);
    close(interval?.lower, 0.4902);
    close(interval?.upper, 0.9433);
  });

  test("stays inside [0, 1] at the edges", () => {
    const all = wilsonInterval(10, 10);
    close(all?.lower, 0.7225);
    assert.equal(all?.upper, 1);
    const none = wilsonInterval(0, 10);
    assert.equal(none?.lower, 0);
    close(none?.upper, 0.2775);
  });

  test("narrows as the count grows", () => {
    const small = wilsonInterval(17, 20);
    const large = wilsonInterval(170, 200);
    assert.ok(small && large);
    assert.ok(large.upper - large.lower < small.upper - small.lower);
  });

  test("is null when there is nothing to divide by", () => {
    assert.equal(wilsonInterval(0, 0), null);
  });

  test("rejects impossible counts", () => {
    assert.throws(() => wilsonInterval(3, 2));
    assert.throws(() => wilsonInterval(-1, 2));
    assert.throws(() => wilsonInterval(1.5, 2));
  });
});

describe("verdictFor", () => {
  test("passes when the whole interval is at or above the bar", () => {
    assert.equal(
      verdictFor({ bar: SAME_NEED_BAR, enoughPositives: true, reading: reading(98, 100) }),
      "pass",
    );
  });

  test("fails when the whole interval is below the bar", () => {
    assert.equal(
      verdictFor({ bar: SAME_NEED_BAR, enoughPositives: true, reading: reading(50, 100) }),
      "fail",
    );
  });

  test("is inconclusive when the interval straddles the bar", () => {
    assert.equal(
      verdictFor({ bar: SAME_NEED_BAR, enoughPositives: true, reading: reading(17, 20) }),
      "inconclusive",
    );
  });

  test("is inconclusive below the minimum positives, however good the point", () => {
    assert.equal(
      verdictFor({ bar: SAME_NEED_BAR, enoughPositives: false, reading: reading(98, 100) }),
      "inconclusive",
    );
  });

  test("is inconclusive with no predictions", () => {
    assert.equal(
      verdictFor({ bar: RELATED_NEED_BAR, enoughPositives: true, reading: reading(0, 0) }),
      "inconclusive",
    );
  });

  test("uses the preset bars", () => {
    assert.equal(SAME_NEED_BAR, 0.85);
    assert.equal(RELATED_NEED_BAR, 0.75);
    assert.equal(MIN_SAME_NEED_POSITIVES, 60);
  });
});

describe("precisionReading", () => {
  test("carries the point estimate, interval and counts", () => {
    const r = precisionReading({ predicted: 10, truePositives: 8 });
    assert.equal(r.point, 0.8);
    assert.equal(r.truePositives, 8);
    assert.equal(r.predicted, 10);
    close(r.interval?.lower, 0.4902);
  });

  test("has a null point and interval with no predictions", () => {
    const r = precisionReading({ predicted: 0, truePositives: 0 });
    assert.equal(r.point, null);
    assert.equal(r.interval, null);
  });
});

describe("v2Readings", () => {
  test("reads same-need and related-need precision with positives and verdicts", () => {
    const metrics = computeMetrics([
      ...pairs(70, { expected: "same_need", predicted: "same_need" }),
      ...pairs(40, { expected: "related_need", predicted: "related_need" }),
      ...pairs(30, { expected: "different", predicted: "related_need" }),
    ]);
    const r = v2Readings({ failures: 0, metrics });
    assert.equal(r.sameNeedPositives, 70);
    assert.equal(r.enoughPositives, true);
    assert.equal(r.sameNeed.point, 1);
    assert.equal(r.sameNeed.verdict, "pass");
    assert.equal(r.relatedNeed.predicted, 70);
    assert.equal(r.relatedNeed.truePositives, 40);
    assert.equal(r.relatedNeed.verdict, "fail");
  });

  test("is inconclusive below 60 same-need positives", () => {
    const metrics = computeMetrics(pairs(59, { expected: "same_need", predicted: "same_need" }));
    const r = v2Readings({ failures: 0, metrics });
    assert.equal(r.enoughPositives, false);
    assert.equal(r.sameNeed.verdict, "inconclusive");
    assert.equal(r.relatedNeed.verdict, "inconclusive");
  });

  test("is inconclusive when any pair failed to run", () => {
    const metrics = computeMetrics(pairs(100, { expected: "same_need", predicted: "same_need" }));
    const r = v2Readings({ failures: 1, metrics });
    assert.equal(r.sameNeed.verdict, "inconclusive");
  });
});
