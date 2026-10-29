import type { ReviewMetrics } from "@/lib/signal/contracts";
import type {
  AgentCorrectness,
  AnswerKeyScores,
  PmAgreement,
} from "@/lib/signal/service/answer-key";

import {
  BASELINE_SHARE,
  MIN_SAME_NEED_POSITIVES,
  minPilotFilings,
  precisionReading,
  RELATED_NEED_BAR,
  REVIEW_COVERAGE_BAR,
  SAME_NEED_BAR,
  verdictFor,
  wilsonInterval,
} from "./bars";
import type { BarVerdict, Interval, PrecisionReading } from "./bars";

/**
 * The Proof Report (spec 003, decision 0003): every preset bar with its value, counts, 95%
 * interval where it applies, and pass, fail or inconclusive, plus what follows from them. Pure:
 * `sources.ts` reads the pilot metrics, Answer Key scores, frozen files and eval run log.
 *
 * Verdict rules: a bar passes only when its whole 95% interval clears the bar and its minimums are
 * met; it fails only when the interval is wholly on the wrong side; anything else is inconclusive,
 * with the reasons listed. Bars, interval math and the precision rules live in `bars.ts`.
 */

export type { BarVerdict, Interval } from "./bars";
/** `MIN_PILOT_FILINGS`: the filings minimum when the frozen feedback count is unknown. */
export {
  BASELINE_SHARE,
  DEFAULT_MIN_PILOT_FILINGS as MIN_PILOT_FILINGS,
  REVIEW_COVERAGE_BAR,
} from "./bars";

export type PilotFilesState =
  | { message: string; readable: false }
  | {
      backlogRequests: number;
      changed: boolean;
      /** Stated before the run (the lock's when frozen, else the manifest's). */
      expectedBacklogDuplicateRate: number | null;
      feedback: number;
      frozen: boolean;
      frozenAt: string | null;
      /** Feedback items in the pilot lock (the filings minimum); null or absent when not frozen. */
      frozenFeedback?: number | null;
      messages: string[];
      readable: true;
      ready: boolean;
      unconfirmed: number;
    };

export type HeldOutV2State =
  | { message: string; readable: false }
  | {
      changed: boolean;
      frozen: boolean;
      frozenAt: string | null;
      /** The readiness gate's message when the set is not ready to run, else null. */
      message: string | null;
      pairs: number;
      readable: true;
      sameNeedPositives: number;
      unconfirmed: number;
    };

interface PrecisionCounts {
  predicted: number;
  truePositives: number;
}

/** One logged Held-Out Set v2 run, as the report needs it. */
export interface V2Run {
  at: string;
  failures: number;
  promptVersion: string;
  /** Null when the run logged no readings (e.g. it failed before scoring). */
  relatedNeed: PrecisionCounts | null;
  sameNeed: PrecisionCounts | null;
  sameNeedPositives: number;
  status: "completed" | "failed";
}

export interface ProofInputs {
  answerKeyScores: AnswerKeyScores | null;
  generatedAt: string;
  heldOutV2: HeldOutV2State;
  pilotFiles: PilotFilesState;
  /** Metrics for Origin `pilot` in the Pilot Workspace; null when unavailable. */
  pilotMetrics: ReviewMetrics | null;
  /** Why `pilotMetrics` is null. */
  pilotMetricsError: string | null;
  /** The judge's current prompt version; null when it could not be computed. */
  promptVersion: string | null;
  /** Latest v2 reading (non-repeat, frozen fingerprint) for any prompt version. */
  v2LatestReading: V2Run | null;
  /** Latest v2 reading for the current prompt version. */
  v2Reading: V2Run | null;
}

export type ProofBarKey =
  | "intakeDuplicateRate"
  | "relatedNeedPrecision"
  | "reviewCoverage"
  | "sameNeedPrecision";

export interface ProofBaseline {
  /** Backlog Feature Requests in the frozen pilot files; null when unknown. */
  backlogRequests: number | null;
  /** Reviewed ÷ backlog Feature Requests; null when unknown. */
  coverage: number | null;
  duplicates: number;
  expectedRate: number | null;
  interval: Interval | null;
  rate: number | null;
  reviewed: number;
}

export interface ProofBar {
  /** The bar in words, e.g. "≥ 85% on Held-Out Set v2". */
  bar: string;
  /** Intake Duplicate Rate only: the backlog baseline it is compared with. */
  baseline: ProofBaseline | null;
  /** What follows when the bar fails; null otherwise. */
  consequence: string | null;
  counts: Record<string, number>;
  interval: Interval | null;
  key: ProofBarKey;
  label: string;
  /** Precision bars only: the run the value comes from. */
  reading: { at: string; current: boolean; promptVersion: string } | null;
  /** Why the verdict is inconclusive (or failed); empty on a pass. */
  reasons: string[];
  /** The bar's number: a rate (Intake: half the baseline rate); null when it cannot be stated. */
  threshold: number | null;
  value: number | null;
  verdict: BarVerdict;
}

type WithInterval<T> = T & { interval: Interval | null };

export interface ProofReport {
  bars: ProofBar[];
  /** Plain statements of what the bars mean for the product. */
  consequences: string[];
  generatedAt: string;
  /** Same-Need Precision failed: drop suggest-before-submit, PM-only grouping. */
  killCriterionTriggered: boolean;
  /** Related-Need Precision failed: submitters get a two-way verdict. */
  narrowToTwoWay: boolean;
  readiness: {
    heldOutV2: HeldOutV2State;
    pilotFiles: PilotFilesState;
    promptVersion: { current: string | null; reading: string | null };
    /** Frozen inputs that changed after freeze: earlier readings no longer apply. */
    readingResets: string[];
  };
  slice3: "may_start" | "not_yet";
  supporting: {
    agentCorrectness: WithInterval<AgentCorrectness> | null;
    notes: string[];
    pmAgreement: { blind: WithInterval<PmAgreement>; nonBlind: WithInterval<PmAgreement> } | null;
    suggestionAcceptance: {
      checks: number;
      checksWithSameNeed: number;
      createsAfterSameNeed: number;
      evidence: false;
      note: string;
      rate: number | null;
    } | null;
  };
  /** Pass when every bar passes, fail when any fails, else inconclusive. */
  verdict: BarVerdict;
}

const pct = (value: number) => `${Number((value * 100).toFixed(1))}%`;
const range = (interval: Interval) => `${pct(interval.lower)}–${pct(interval.upper)}`;

const PILOT_CHANGED = "Pilot files changed after freeze: reading reset.";
const V2_CHANGED = "Held-Out Set v2 changed after freeze: reading reset.";

const CONSEQUENCES = {
  intakeDuplicateRate:
    "The pilot did not halve the backlog duplicate rate: the check before create is not shown to prevent duplicates, so slice 3 does not start.",
  relatedNeedPrecision:
    "Related-Need Precision is below 75%: narrow the three-way verdict to two-way (Same Need or Different) for submitters; Related becomes a Product Manager-only decision, recorded as a direction change.",
  reviewCoverage:
    "Review Coverage is under 80%: keep reviewing new Feature Requests; the Intake Duplicate Rate is not judged until coverage reaches 80%.",
  sameNeedPrecision:
    "Kill criterion triggered: Same-Need Precision is below 85% on Held-Out Set v2. Drop suggest-before-submit and fall back to Product Manager-only grouping.",
} satisfies Record<ProofBarKey, string>;

const LABELS = {
  intakeDuplicateRate: "Intake Duplicate Rate",
  relatedNeedPrecision: "Related-Need Precision",
  reviewCoverage: "Review Coverage",
  sameNeedPrecision: "Same-Need Precision",
} satisfies Record<ProofBarKey, string>;

const finish = (bar: Omit<ProofBar, "consequence" | "verdict">, verdict: BarVerdict): ProofBar => ({
  ...bar,
  consequence: verdict === "fail" ? CONSEQUENCES[bar.key] : null,
  verdict: bar.reasons.length > 0 && verdict === "pass" ? "inconclusive" : verdict,
});

/** One filing per frozen pilot feedback item; about 200 when the frozen count is unknown. */
const filingsMinimum = (files: PilotFilesState): number =>
  minPilotFilings(files.readable ? (files.frozenFeedback ?? null) : null);

const metricsReasons = (input: ProofInputs): string[] => {
  const metrics = input.pilotMetrics;
  if (!metrics) {
    return [`Pilot metrics are unavailable: ${input.pilotMetricsError ?? "not read."}`];
  }
  const minimum = filingsMinimum(input.pilotFiles);
  return metrics.checks < minimum ? [`${metrics.checks} of about ${minimum} filings so far.`] : [];
};

const pilotFilesReasons = (files: PilotFilesState): string[] => {
  if (!files.readable) return [`The pilot files could not be read: ${files.message}`];
  if (files.changed) return [PILOT_CHANGED];
  if (!files.frozen)
    return [
      "The pilot files are not frozen: the backlog and its expected rate must be fixed before the run.",
    ];
  return [];
};

const intakeBar = (input: ProofInputs): ProofBar => {
  const metrics = input.pilotMetrics;
  const files = input.pilotFiles;
  const backlogRequests = files.readable ? files.backlogRequests : null;
  const reasons = [...pilotFilesReasons(files), ...metricsReasons(input)];
  const base = {
    bar: "≤ ½ the backlog baseline",
    key: "intakeDuplicateRate" as const,
    label: LABELS.intakeDuplicateRate,
    reading: null,
  };
  if (!metrics) {
    return finish(
      {
        ...base,
        baseline: null,
        counts: {},
        interval: null,
        reasons,
        threshold: null,
        value: null,
      },
      "inconclusive",
    );
  }
  const { backlogBaseline: baseline, intakeDuplicateRate: intake, reviewCoverage } = metrics;
  const baselineInterval = wilsonInterval(baseline.duplicates, baseline.reviewed);
  const intakeInterval = wilsonInterval(intake.duplicates, intake.reviewed);
  const baselineCoverage =
    backlogRequests && backlogRequests > 0 ? baseline.reviewed / backlogRequests : null;

  if (reviewCoverage.rate === null || reviewCoverage.rate < REVIEW_COVERAGE_BAR) {
    reasons.push(
      `Review Coverage is ${reviewCoverage.rate === null ? "not measurable yet" : pct(reviewCoverage.rate)}, under 80%.`,
    );
  }
  if (baseline.reviewed === 0) {
    reasons.push("The backlog baseline has no reviewed Feature Requests yet.");
  } else if (baselineCoverage !== null && baselineCoverage < REVIEW_COVERAGE_BAR) {
    reasons.push(
      `The backlog review covers ${pct(baselineCoverage)} (${baseline.reviewed} of ${backlogRequests} backlog Feature Requests), under 80%.`,
    );
  }

  let verdict: BarVerdict = "inconclusive";
  if (reasons.length === 0 && intakeInterval && baselineInterval) {
    const halfLower = baselineInterval.lower * BASELINE_SHARE;
    const halfUpper = baselineInterval.upper * BASELINE_SHARE;
    if (intakeInterval.upper <= halfLower) verdict = "pass";
    else if (intakeInterval.lower > halfUpper) verdict = "fail";
    else
      reasons.push(
        `The intake 95% interval (${range(intakeInterval)}) overlaps half the baseline's interval (${pct(halfLower)}–${pct(halfUpper)}).`,
      );
  }

  return finish(
    {
      ...base,
      baseline: {
        backlogRequests,
        coverage: baselineCoverage,
        duplicates: baseline.duplicates,
        expectedRate: files.readable ? files.expectedBacklogDuplicateRate : null,
        interval: baselineInterval,
        rate: baseline.rate,
        reviewed: baseline.reviewed,
      },
      counts: { duplicates: intake.duplicates, filings: metrics.checks, reviewed: intake.reviewed },
      interval: intakeInterval,
      reasons,
      threshold: baseline.rate === null ? null : baseline.rate * BASELINE_SHARE,
      value: intake.rate,
    },
    verdict,
  );
};

const coverageBar = (input: ProofInputs): ProofBar => {
  const metrics = input.pilotMetrics;
  const reasons = metricsReasons(input);
  const base = {
    bar: `≥ ${pct(REVIEW_COVERAGE_BAR)} over about ${filingsMinimum(input.pilotFiles)} filings`,
    baseline: null,
    interval: null,
    key: "reviewCoverage" as const,
    label: LABELS.reviewCoverage,
    reading: null,
    threshold: REVIEW_COVERAGE_BAR,
  };
  if (!metrics) return finish({ ...base, counts: {}, reasons, value: null }, "inconclusive");
  const { rate, reviewed, total } = metrics.reviewCoverage;
  if (rate === null) reasons.push("There are no new Feature Requests to review yet.");
  // Review never "ends", so coverage under the bar is work in progress, not a failure.
  let verdict: BarVerdict = "inconclusive";
  if (reasons.length === 0 && rate !== null) {
    if (rate >= REVIEW_COVERAGE_BAR) verdict = "pass";
    else reasons.push(`Review Coverage is ${pct(rate)}, under 80%: keep reviewing.`);
  }
  return finish(
    { ...base, counts: { filings: metrics.checks, reviewed, total }, reasons, value: rate },
    verdict,
  );
};

const v2SetReasons = (set: HeldOutV2State): string[] => {
  if (!set.readable) return [`Held-Out Set v2 could not be read: ${set.message}`];
  if (set.changed) return [V2_CHANGED];
  if (!set.frozen) return ["Held-Out Set v2 is not frozen: freeze it before its first run."];
  return [];
};

/** Why a v2 run cannot decide a bar: missing, stale prompt version, failed pairs, too few positives. */
const runReasons = (input: ProofInputs, run: V2Run | null): string[] => {
  if (!run) return ["There is no Held-Out Set v2 reading yet: run the eval once."];
  const reasons: string[] = [];
  if (input.v2Reading === null) {
    reasons.push(
      `The latest reading (${run.at}) is for prompt version ${run.promptVersion}, not the current ${input.promptVersion ?? "(unknown)"}: run Held-Out Set v2 once for this prompt version.`,
    );
  }
  if (run.status === "failed" || run.failures > 0) {
    reasons.push(`The reading had ${run.failures} failed pairs, so it is incomplete.`);
  }
  if (run.sameNeedPositives < MIN_SAME_NEED_POSITIVES) {
    reasons.push(
      `The set has ${run.sameNeedPositives} same-need positives, under the minimum of ${MIN_SAME_NEED_POSITIVES}.`,
    );
  }
  return reasons;
};

const PRECISION_CLASS = { relatedNeedPrecision: "Related Need", sameNeedPrecision: "Same Need" };

/** The interval rule from the eval readings, with the reason when it cannot decide. */
const precisionVerdict = (
  key: keyof typeof PRECISION_CLASS,
  threshold: number,
  reading: PrecisionReading,
): { reason: string | null; verdict: BarVerdict } => {
  const verdict = verdictFor({ bar: threshold, enoughPositives: true, reading });
  if (reading.interval === null) {
    return {
      reason: `The judge labeled no candidate ${PRECISION_CLASS[key]}, so precision cannot be measured.`,
      verdict,
    };
  }
  if (verdict === "inconclusive") {
    return {
      reason: `The 95% interval (${range(reading.interval)}) straddles the ${pct(threshold)} bar.`,
      verdict,
    };
  }
  return { reason: null, verdict };
};

const precisionBar = (input: ProofInputs, key: keyof typeof PRECISION_CLASS): ProofBar => {
  const threshold = key === "sameNeedPrecision" ? SAME_NEED_BAR : RELATED_NEED_BAR;
  const run = input.v2Reading ?? input.v2LatestReading;
  const counts = run && (key === "sameNeedPrecision" ? run.sameNeed : run.relatedNeed);
  const reasons = [...v2SetReasons(input.heldOutV2), ...runReasons(input, run)];
  if (run && !counts) reasons.push("The reading logged no precision counts.");

  const reading = counts ? precisionReading(counts) : null;
  let verdict: BarVerdict = "inconclusive";
  if (reasons.length === 0 && reading) {
    const { reason, verdict: decided } = precisionVerdict(key, threshold, reading);
    verdict = decided;
    if (reason) reasons.push(reason);
  }

  return finish(
    {
      bar: `≥ ${pct(threshold)} on Held-Out Set v2`,
      baseline: null,
      counts:
        run && counts
          ? {
              predicted: counts.predicted,
              sameNeedPositives: run.sameNeedPositives,
              truePositives: counts.truePositives,
            }
          : {},
      interval: reading?.interval ?? null,
      key,
      label: LABELS[key],
      reading: run
        ? { at: run.at, current: input.v2Reading !== null, promptVersion: run.promptVersion }
        : null,
      reasons,
      threshold,
      value: reading?.point ?? null,
    },
    verdict,
  );
};

const overallVerdict = (bars: ProofBar[]): BarVerdict => {
  if (bars.some((bar) => bar.verdict === "fail")) return "fail";
  if (bars.every((bar) => bar.verdict === "pass")) return "pass";
  return "inconclusive";
};

const consequencesOf = (bars: ProofBar[], verdict: BarVerdict): string[] => {
  const consequences = bars.flatMap((bar) => (bar.consequence ? [bar.consequence] : []));
  if (verdict === "pass") return ["All bars pass: slice 3 may start."];
  const open = bars.filter((bar) => bar.verdict === "inconclusive").map((bar) => bar.label);
  consequences.push(
    open.length > 0
      ? `Not yet: slice 3 waits until every bar passes. Inconclusive: ${open.join(", ")}.`
      : "Not yet: slice 3 waits until every bar passes.",
  );
  return consequences;
};

const withAgreementInterval = (group: PmAgreement): WithInterval<PmAgreement> => ({
  ...group,
  interval: wilsonInterval(group.agree, group.agree + group.disagree),
});

const supportingOf = (input: ProofInputs): ProofReport["supporting"] => {
  const notes: string[] = [];
  const scores = input.answerKeyScores;
  const files = input.pilotFiles;
  if (!scores)
    notes.push("Answer Key scores are unavailable (no database or unreadable pilot files).");
  if (files.readable && files.changed) {
    notes.push(
      "Answer Key changed after freeze: reading reset; these scores read the changed key.",
    );
  } else if (files.readable && files.unconfirmed > 0) {
    notes.push(
      `${files.unconfirmed} Answer Key entries are unconfirmed and excluded from scoring.`,
    );
  }
  const metrics = input.pilotMetrics;
  return {
    agentCorrectness: scores
      ? {
          ...scores.agentCorrectness,
          interval: wilsonInterval(scores.agentCorrectness.correct, scores.agentCorrectness.scored),
        }
      : null,
    notes,
    pmAgreement: scores
      ? {
          blind: withAgreementInterval(scores.pmAgreement.blind),
          nonBlind: withAgreementInterval(scores.pmAgreement.nonBlind),
        }
      : null,
    suggestionAcceptance: metrics
      ? {
          checks: metrics.checks,
          checksWithSameNeed: metrics.checksWithSameNeed,
          createsAfterSameNeed: metrics.createsAfterSameNeed,
          evidence: false,
          note: "Reported, not evidence: agents follow the verdict by construction, so acceptance measures obedience.",
          rate: metrics.suggestionAcceptance,
        }
      : null,
  };
};

export const buildProofReport = (input: ProofInputs): ProofReport => {
  const bars = [
    intakeBar(input),
    coverageBar(input),
    precisionBar(input, "sameNeedPrecision"),
    precisionBar(input, "relatedNeedPrecision"),
  ];
  const verdict = overallVerdict(bars);
  const failed = (key: ProofBarKey) =>
    bars.some((bar) => bar.key === key && bar.verdict === "fail");
  const readingResets = [
    ...(input.pilotFiles.readable && input.pilotFiles.changed ? [PILOT_CHANGED] : []),
    ...(input.heldOutV2.readable && input.heldOutV2.changed ? [V2_CHANGED] : []),
  ];
  return {
    bars,
    consequences: consequencesOf(bars, verdict),
    generatedAt: input.generatedAt,
    killCriterionTriggered: failed("sameNeedPrecision"),
    narrowToTwoWay: failed("relatedNeedPrecision"),
    readiness: {
      heldOutV2: input.heldOutV2,
      pilotFiles: input.pilotFiles,
      promptVersion: {
        current: input.promptVersion,
        reading: (input.v2Reading ?? input.v2LatestReading)?.promptVersion ?? null,
      },
      readingResets,
    },
    slice3: verdict === "pass" ? "may_start" : "not_yet",
    supporting: supportingOf(input),
    verdict,
  };
};
