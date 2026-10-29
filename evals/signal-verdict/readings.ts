import {
  MIN_SAME_NEED_POSITIVES,
  precisionReading,
  RELATED_NEED_BAR,
  SAME_NEED_BAR,
  verdictFor,
} from "@/lib/signal/proof/bars";
import type { BarVerdict, PrecisionReading } from "@/lib/signal/proof/bars";

import type { EvalMetrics } from "./metrics";

/**
 * Held-Out Set v2 readings for eval runs (spec 003, decision 0003). The bars and the interval
 * and verdict rules live in `lib/signal/proof/bars.ts`; they are re-exported here for the eval
 * CLI and tests. Keep this module free of I/O.
 */

export {
  MIN_SAME_NEED_POSITIVES,
  precisionReading,
  RELATED_NEED_BAR,
  SAME_NEED_BAR,
  verdictFor,
  wilsonInterval,
  Z_95,
} from "@/lib/signal/proof/bars";
export type { BarVerdict, Interval, PrecisionReading } from "@/lib/signal/proof/bars";

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
