import { KILL_LINE } from "./metrics";
import type { EvalMetrics } from "./metrics";

/**
 * Pure interval math and verdict rules for eval readings (spec 003, decision 0003).
 * The Proof Report imports these, so keep them free of I/O.
 */

/** Same-need precision on Held-Out Set v2 at or above this passes; below it, the kill criterion. */
export const SAME_NEED_BAR = KILL_LINE;
/** Related-need precision on Held-Out Set v2 at or above this keeps the three-way verdict. */
export const RELATED_NEED_BAR = 0.75;
/** Below this many same-need positives in the set, readings are inconclusive. */
export const MIN_SAME_NEED_POSITIVES = 60;
/** Two-sided 95% normal quantile. */
export const Z_95 = 1.959963984540054;

export interface Interval {
  lower: number;
  upper: number;
}

export type BarVerdict = "pass" | "fail" | "inconclusive";

export interface PrecisionReading {
  interval: Interval | null;
  point: number | null;
  /** Predictions of the class (the denominator). */
  predicted: number;
  /** Predictions the set also labels with the class (the numerator). */
  truePositives: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Wilson score interval for `successes` out of `n`; null when `n` is 0. */
export const wilsonInterval = (successes: number, n: number, z = Z_95): Interval | null => {
  if (!(Number.isInteger(successes) && Number.isInteger(n)) || successes < 0 || successes > n) {
    throw new Error(`Invalid counts for an interval: ${successes}/${n}.`);
  }
  if (n === 0) return null;
  const p = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  // At the edges the exact bound is 0 or 1; snap it so float error never shows as 99.99…%.
  return {
    lower: successes === 0 ? 0 : clamp01(center - half),
    upper: successes === n ? 1 : clamp01(center + half),
  };
};

export const precisionReading = (counts: {
  predicted: number;
  truePositives: number;
}): PrecisionReading => ({
  interval: wilsonInterval(counts.truePositives, counts.predicted),
  point: counts.predicted === 0 ? null : counts.truePositives / counts.predicted,
  predicted: counts.predicted,
  truePositives: counts.truePositives,
});

/**
 * Pass when the whole 95% interval is at or above the bar, fail when it is wholly below,
 * inconclusive when it straddles the bar, there are no predictions, or the set is short of
 * the minimum same-need positives.
 */
export const verdictFor = (input: {
  bar: number;
  enoughPositives: boolean;
  reading: PrecisionReading;
}): BarVerdict => {
  const { interval } = input.reading;
  if (!input.enoughPositives || interval === null) return "inconclusive";
  if (interval.lower >= input.bar) return "pass";
  if (interval.upper < input.bar) return "fail";
  return "inconclusive";
};

export interface BarReading extends PrecisionReading {
  bar: number;
  verdict: BarVerdict;
}

export interface V2Readings {
  enoughPositives: boolean;
  failures: number;
  minPositives: number;
  relatedNeed: BarReading;
  sameNeed: BarReading;
  /** Pairs the set labels same_need. */
  sameNeedPositives: number;
}

/**
 * Held-Out Set v2 readings from a run's metrics. A run with failed pairs is incomplete,
 * so its verdicts are inconclusive.
 */
export const v2Readings = (input: { failures: number; metrics: EvalMetrics }): V2Readings => {
  const sameNeedPositives = input.metrics.sameNeed.expected;
  const enoughPositives = sameNeedPositives >= MIN_SAME_NEED_POSITIVES;
  const usable = enoughPositives && input.failures === 0;
  const read = (counts: EvalMetrics["sameNeed"], bar: number): BarReading => {
    const reading = precisionReading(counts);
    return { ...reading, bar, verdict: verdictFor({ bar, enoughPositives: usable, reading }) };
  };
  return {
    enoughPositives,
    failures: input.failures,
    minPositives: MIN_SAME_NEED_POSITIVES,
    relatedNeed: read(input.metrics.relatedNeed, RELATED_NEED_BAR),
    sameNeed: read(input.metrics.sameNeed, SAME_NEED_BAR),
    sameNeedPositives,
  };
};
