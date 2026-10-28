import type { Verdict } from "@/lib/signal/contracts";

/** Same-Need Precision below this on the Held-Out Set triggers the kill criterion (PRODUCT.md). */
export const KILL_LINE = 0.85;

export type ExpectedVerdict = Exclude<Verdict, "unknown">;
/** The Check's verdict for the target, or "absent" when the target was not among the candidates. */
export type PredictedVerdict = Verdict | "absent";

/** The service drops "different" candidates, so an absent target is correct when "different" was expected. */
export const isCorrect = (pair: { expected: Verdict; predicted: PredictedVerdict }): boolean =>
  pair.expected === pair.predicted ||
  (pair.expected === "different" && pair.predicted === "absent");

export const EXPECTED_VERDICTS: ExpectedVerdict[] = ["same_need", "related_need", "different"];
export const PREDICTED_VERDICTS: PredictedVerdict[] = [
  "same_need",
  "related_need",
  "different",
  "unknown",
  "absent",
];

export interface ScoredPair {
  expected: ExpectedVerdict;
  predicted: PredictedVerdict;
}

export interface ClassMetrics {
  expected: number;
  precision: number | null;
  predicted: number;
  recall: number | null;
  truePositives: number;
}

export interface EvalMetrics {
  absent: number;
  belowKillLine: boolean | null;
  confusion: Record<ExpectedVerdict, Record<PredictedVerdict, number>>;
  exactMatches: number;
  relatedNeed: ClassMetrics;
  sameNeed: ClassMetrics;
  total: number;
  unknown: number;
}

const ratio = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

const classMetrics = (pairs: ScoredPair[], verdict: ExpectedVerdict): ClassMetrics => {
  const expected = pairs.filter((p) => p.expected === verdict).length;
  const predicted = pairs.filter((p) => p.predicted === verdict).length;
  const truePositives = pairs.filter(
    (p) => p.expected === verdict && p.predicted === verdict,
  ).length;
  return {
    expected,
    precision: ratio(truePositives, predicted),
    predicted,
    recall: ratio(truePositives, expected),
    truePositives,
  };
};

const emptyRow = (): Record<PredictedVerdict, number> => ({
  absent: 0,
  different: 0,
  related_need: 0,
  same_need: 0,
  unknown: 0,
});

/** Pure scoring of an Eval Set run: one entry per Draft–Feature Request pair. */
export const computeMetrics = (pairs: ScoredPair[]): EvalMetrics => {
  const confusion: EvalMetrics["confusion"] = {
    different: emptyRow(),
    related_need: emptyRow(),
    same_need: emptyRow(),
  };
  for (const p of pairs) confusion[p.expected][p.predicted] += 1;
  const sameNeed = classMetrics(pairs, "same_need");
  return {
    absent: pairs.filter((p) => p.predicted === "absent").length,
    belowKillLine: sameNeed.precision === null ? null : sameNeed.precision < KILL_LINE,
    confusion,
    exactMatches: pairs.filter((p) => isCorrect(p)).length,
    relatedNeed: classMetrics(pairs, "related_need"),
    sameNeed,
    total: pairs.length,
    unknown: pairs.filter((p) => p.predicted === "unknown").length,
  };
};

export const formatRate = (value: number | null): string =>
  value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
