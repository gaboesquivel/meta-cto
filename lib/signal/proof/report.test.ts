import { describe, expect, it } from "vitest";

import type { ReviewMetrics } from "@/lib/signal/contracts";
import type { AnswerKeyScores } from "@/lib/signal/service/answer-key";

import { DEFAULT_MIN_PILOT_FILINGS } from "./bars";
import { buildProofReport } from "./report";
import type { HeldOutV2State, PilotFilesState, ProofBarKey, ProofInputs, V2Run } from "./report";

const metrics = (overrides: Partial<ReviewMetrics> = {}): ReviewMetrics => ({
  // Baseline 80/200 = 40% (95% interval about 33.5–46.9%), so half of it is about 16.7–23.4%.
  backlogBaseline: { duplicates: 80, rate: 0.4, reviewed: 200 },
  checks: 220,
  checksWithSameNeed: 90,
  createsAfterSameNeed: 9,
  // 8/160 = 5% (upper bound about 9.6%): wholly under half the baseline.
  intakeDuplicateRate: { duplicates: 8, rate: 0.05, reviewed: 160 },
  origin: "pilot",
  reviewCoverage: { rate: 160 / 180, reviewed: 160, total: 180 },
  suggestionAcceptance: 0.9,
  suspectedDuplication: { open: 3, rate: 0.01, total: 300 },
  undoRate: { decisions: 90, rate: 0.02, undone: 2 },
  ...overrides,
});

const intake = (duplicates: number, reviewed: number) => ({
  duplicates,
  rate: duplicates / reviewed,
  reviewed,
});

const pilotFiles = (overrides: Partial<Extract<PilotFilesState, { readable: true }>> = {}) =>
  ({
    backlogRequests: 220,
    changed: false,
    expectedBacklogDuplicateRate: 0.38,
    feedback: 210,
    frozen: true,
    frozenAt: "2026-10-30T09:00:00.000Z",
    frozenFeedback: 210,
    loaded: true,
    loadedAt: "2026-10-30T10:00:00.000Z",
    messages: [],
    readable: true,
    ready: true,
    unconfirmed: 0,
    ...overrides,
  }) satisfies PilotFilesState;

const heldOutV2 = (overrides: Partial<Extract<HeldOutV2State, { readable: true }>> = {}) =>
  ({
    changed: false,
    frozen: true,
    frozenAt: "2026-10-30T09:00:00.000Z",
    message: null,
    pairs: 160,
    readable: true,
    sameNeedPositives: 70,
    ...overrides,
  }) satisfies HeldOutV2State;

const PROMPT = "pv-current00000";

const run = (overrides: Partial<V2Run> = {}): V2Run => ({
  at: "2026-10-31T10:00:00.000Z",
  failures: 0,
  promptVersion: PROMPT,
  // 90/100: interval about 82.6–94.5%, wholly above 75%.
  relatedNeed: { predicted: 100, truePositives: 90 },
  // 97/100: interval about 91.5–99.0%, wholly above 85%.
  sameNeed: { predicted: 100, truePositives: 97 },
  sameNeedPositives: 70,
  status: "completed",
  ...overrides,
});

const scores: AnswerKeyScores = {
  agentCorrectness: {
    actions: 210,
    correct: 180,
    excludedUnconfirmed: 0,
    harm: 6,
    miss: 14,
    rate: 0.9,
    scored: 200,
    unlinked: 10,
    unmatched: 0,
    unresolved: 0,
  },
  pmAgreement: {
    blind: {
      agree: 45,
      decided: 50,
      disagree: 5,
      excludedUnconfirmed: 0,
      rate: 0.9,
      unlinked: 0,
      unmatched: 0,
      unresolved: 0,
    },
    nonBlind: {
      agree: 100,
      decided: 110,
      disagree: 10,
      excludedUnconfirmed: 0,
      rate: 100 / 110,
      unlinked: 0,
      unmatched: 0,
      unresolved: 0,
    },
  },
};

const inputs = (overrides: Partial<ProofInputs> = {}): ProofInputs => ({
  answerKeyScores: scores,
  generatedAt: "2026-11-01T00:00:00.000Z",
  heldOutV2: heldOutV2(),
  pilotFiles: pilotFiles(),
  pilotMetrics: metrics(),
  pilotMetricsError: null,
  promptVersion: PROMPT,
  v2LatestReading: run(),
  v2Reading: run(),
  ...overrides,
});

const barOf = (report: ReturnType<typeof buildProofReport>, key: ProofBarKey) => {
  const bar = report.bars.find((b) => b.key === key);
  if (!bar) throw new Error(`no bar ${key}`);
  return bar;
};

const reasonsOf = (overrides: Partial<ProofInputs>, key: ProofBarKey) => {
  const bar = barOf(buildProofReport(inputs(overrides)), key);
  expect(bar.verdict).toBe("inconclusive");
  return bar.reasons.join(" ");
};

describe("buildProofReport: every bar passes", () => {
  const report = buildProofReport(inputs());

  it("lists the four preset bars in order, each with value, counts and a verdict", () => {
    expect(report.bars.map((b) => b.key)).toEqual([
      "intakeDuplicateRate",
      "reviewCoverage",
      "sameNeedPrecision",
      "relatedNeedPrecision",
    ]);
    for (const bar of report.bars) {
      expect(bar.verdict).toBe("pass");
      expect(bar.value).toEqual(expect.any(Number));
      expect(Object.keys(bar.counts).length).toBeGreaterThan(0);
      expect(bar.reasons).toEqual([]);
      expect(bar.consequence).toBeNull();
    }
  });

  it("states slice 3 may start", () => {
    expect(report.verdict).toBe("pass");
    expect(report.slice3).toBe("may_start");
    expect(report.killCriterionTriggered).toBe(false);
    expect(report.narrowToTwoWay).toBe(false);
    expect(report.consequences.join(" ")).toMatch(/slice 3 may start/iu);
  });

  it("shows the intake rate beside the baseline, both with 95% intervals", () => {
    const bar = barOf(report, "intakeDuplicateRate");
    expect(bar.value).toBeCloseTo(0.05);
    expect(bar.threshold).toBeCloseTo(0.2);
    expect(bar.interval?.upper).toBeLessThan(0.1);
    expect(bar.counts).toEqual({ duplicates: 8, filings: 220, reviewed: 160 });
    expect(bar.baseline).toMatchObject({
      backlogRequests: 220,
      coverage: 200 / 220,
      duplicates: 80,
      expectedRate: 0.38,
      rate: 0.4,
      reviewed: 200,
    });
    expect(bar.baseline?.interval?.lower).toBeGreaterThan(0.33);
  });

  it("shows precision readings with intervals, the bar and the reading's prompt version", () => {
    const same = barOf(report, "sameNeedPrecision");
    expect(same.threshold).toBe(0.85);
    expect(same.value).toBeCloseTo(0.97);
    expect(same.interval?.lower).toBeGreaterThan(0.85);
    expect(same.counts).toEqual({ predicted: 100, sameNeedPositives: 70, truePositives: 97 });
    expect(same.reading).toEqual({ at: run().at, current: true, promptVersion: PROMPT });
    expect(barOf(report, "relatedNeedPrecision").threshold).toBe(0.75);
  });
});

describe("Intake Duplicate Rate bar", () => {
  it("fails when the intake interval is wholly above half the baseline", () => {
    const report = buildProofReport(
      inputs({ pilotMetrics: metrics({ intakeDuplicateRate: intake(60, 160) }) }),
    );
    const bar = barOf(report, "intakeDuplicateRate");
    expect(bar.verdict).toBe("fail");
    expect(bar.consequence).toMatch(/slice 3/iu);
    expect(report.verdict).toBe("fail");
    expect(report.slice3).toBe("not_yet");
  });

  it("is inconclusive when the intervals overlap half the baseline", () => {
    const text = reasonsOf(
      { pilotMetrics: metrics({ intakeDuplicateRate: intake(25, 160) }) },
      "intakeDuplicateRate",
    );
    expect(text).toMatch(/interval/iu);
  });

  it("is inconclusive under 80% Review Coverage", () => {
    const text = reasonsOf(
      { pilotMetrics: metrics({ reviewCoverage: { rate: 0.5, reviewed: 90, total: 180 } }) },
      "intakeDuplicateRate",
    );
    expect(text).toMatch(/Review Coverage is 50%/u);
  });

  it("is inconclusive under the frozen pilot feedback count", () => {
    const text = reasonsOf(
      { pilotFiles: pilotFiles({ frozenFeedback: 210 }), pilotMetrics: metrics({ checks: 205 }) },
      "intakeDuplicateRate",
    );
    expect(text).toMatch(/205 of about 210 filings/u);
  });

  it(`falls back to ${DEFAULT_MIN_PILOT_FILINGS} filings when the feedback count is unknown`, () => {
    const text = reasonsOf(
      {
        pilotFiles: { message: "missing", readable: false },
        pilotMetrics: metrics({ checks: 120 }),
      },
      "intakeDuplicateRate",
    );
    expect(text).toMatch(/120 of about 200 filings/u);
  });

  it("uses a smaller frozen pilot for the filings minimum", () => {
    const report = buildProofReport(
      inputs({
        pilotFiles: pilotFiles({ frozenFeedback: 100 }),
        pilotMetrics: metrics({ checks: 100 }),
      }),
    );
    expect(barOf(report, "intakeDuplicateRate").verdict).toBe("pass");
    const coverage = barOf(report, "reviewCoverage");
    expect(coverage.verdict).toBe("pass");
    expect(coverage.bar).toMatch(/about 100 filings/u);
  });

  it("is inconclusive when the backlog baseline is unreviewed", () => {
    const text = reasonsOf(
      {
        pilotMetrics: metrics({ backlogBaseline: { duplicates: 0, rate: null, reviewed: 0 } }),
      },
      "intakeDuplicateRate",
    );
    expect(text).toMatch(/baseline has no reviewed/iu);
  });

  it("is inconclusive when the backlog review is under 80%", () => {
    const text = reasonsOf(
      { pilotFiles: pilotFiles({ backlogRequests: 400 }) },
      "intakeDuplicateRate",
    );
    expect(text).toMatch(/backlog review covers 50%/iu);
  });

  it("is inconclusive and says reading reset when pilot files changed after freeze", () => {
    const overrides = { pilotFiles: pilotFiles({ changed: true, ready: false }) };
    expect(reasonsOf(overrides, "intakeDuplicateRate")).toMatch(/reading reset/iu);
    const report = buildProofReport(inputs(overrides));
    expect(report.readiness.readingResets.join(" ")).toMatch(
      /Pilot data changed after freeze: reading reset/u,
    );
    expect(report.supporting.notes.join(" ")).toMatch(/Answer Key changed after freeze/u);
  });

  it("is inconclusive when the pilot files are not frozen or unreadable", () => {
    expect(
      reasonsOf({ pilotFiles: pilotFiles({ frozen: false, ready: false }) }, "intakeDuplicateRate"),
    ).toMatch(/not frozen/iu);
    expect(
      reasonsOf({ pilotFiles: { message: "bad json", readable: false } }, "intakeDuplicateRate"),
    ).toMatch(/could not be read: bad json/iu);
  });

  it("is inconclusive with 'pilot data not loaded' when the database holds no pilot data", () => {
    const report = buildProofReport(
      inputs({
        answerKeyScores: null,
        pilotFiles: pilotFiles({ loaded: false, loadedAt: null, ready: false }),
      }),
    );
    const intakeBar = report.bars.find((bar) => bar.key === "intakeDuplicateRate");
    expect(intakeBar?.verdict).toBe("inconclusive");
    expect(intakeBar?.reasons.join(" ")).toMatch(/pilot data not loaded/iu);
    expect(report.verdict).toBe("inconclusive");
    expect(report.supporting.notes.join(" ")).toMatch(/pilot data not loaded/iu);
  });

  it("is inconclusive with null values when pilot metrics are unavailable", () => {
    const report = buildProofReport(
      inputs({ pilotMetrics: null, pilotMetricsError: "Database is not configured." }),
    );
    for (const key of ["intakeDuplicateRate", "reviewCoverage"] as const) {
      const bar = barOf(report, key);
      expect(bar.verdict).toBe("inconclusive");
      expect(bar.value).toBeNull();
      expect(bar.reasons.join(" ")).toMatch(/Database is not configured/u);
    }
    expect(report.supporting.suggestionAcceptance).toBeNull();
  });
});

describe("Review Coverage bar", () => {
  it("is inconclusive under 80% (keep reviewing), never fail, and the overall verdict follows", () => {
    const report = buildProofReport(
      inputs({
        pilotMetrics: metrics({ reviewCoverage: { rate: 0.5, reviewed: 90, total: 180 } }),
      }),
    );
    const bar = barOf(report, "reviewCoverage");
    expect(bar.verdict).toBe("inconclusive");
    expect(bar.consequence).toBeNull();
    expect(bar.counts).toEqual({ filings: 220, reviewed: 90, total: 180 });
    expect(bar.reasons.join(" ")).toMatch(/Review Coverage is 50%, under 80%: keep reviewing/u);
    expect(report.verdict).toBe("inconclusive");
    expect(report.slice3).toBe("not_yet");
  });

  it("is inconclusive under the filing minimum, even at full coverage", () => {
    expect(reasonsOf({ pilotMetrics: metrics({ checks: 50 }) }, "reviewCoverage")).toMatch(
      /50 of about 210 filings/u,
    );
  });

  it("is inconclusive with no new Feature Requests", () => {
    expect(
      reasonsOf(
        { pilotMetrics: metrics({ reviewCoverage: { rate: null, reviewed: 0, total: 0 } }) },
        "reviewCoverage",
      ),
    ).toMatch(/no new Feature Requests/iu);
  });
});

describe("Same-Need Precision bar (kill line)", () => {
  it("fails below 85% and states the kill criterion is triggered", () => {
    const failing = run({ sameNeed: { predicted: 100, truePositives: 70 } });
    const report = buildProofReport(inputs({ v2LatestReading: failing, v2Reading: failing }));
    const bar = barOf(report, "sameNeedPrecision");
    expect(bar.verdict).toBe("fail");
    expect(bar.consequence).toMatch(/kill criterion triggered/iu);
    expect(report.killCriterionTriggered).toBe(true);
    expect(report.consequences.join(" ")).toMatch(
      /drop suggest-before-submit.*Product Manager-only grouping/iu,
    );
    expect(report.slice3).toBe("not_yet");
  });

  it("is inconclusive when the interval straddles 85%", () => {
    const straddle = run({ sameNeed: { predicted: 100, truePositives: 88 } });
    expect(
      reasonsOf({ v2LatestReading: straddle, v2Reading: straddle }, "sameNeedPrecision"),
    ).toMatch(/straddles the 85% bar/u);
  });

  it("is inconclusive under 60 same-need positives", () => {
    const small = run({ sameNeedPositives: 40 });
    expect(reasonsOf({ v2LatestReading: small, v2Reading: small }, "sameNeedPrecision")).toMatch(
      /40 same-need positives, under the minimum of 60/u,
    );
  });

  it("is inconclusive when a run had failed pairs", () => {
    const failed = run({ failures: 3, status: "failed" });
    expect(reasonsOf({ v2LatestReading: failed, v2Reading: failed }, "sameNeedPrecision")).toMatch(
      /3 failed pairs/u,
    );
  });

  it("is inconclusive when Held-Out Set v2 is not frozen", () => {
    expect(
      reasonsOf(
        { heldOutV2: heldOutV2({ frozen: false }), v2LatestReading: null, v2Reading: null },
        "sameNeedPrecision",
      ),
    ).toMatch(/not frozen/iu);
  });

  it("is inconclusive and says reading reset when v2 changed after freeze", () => {
    const overrides = { heldOutV2: heldOutV2({ changed: true }) };
    expect(reasonsOf(overrides, "relatedNeedPrecision")).toMatch(/reading reset/iu);
    const report = buildProofReport(inputs(overrides));
    expect(report.readiness.readingResets.join(" ")).toMatch(/Held-Out Set v2 changed/u);
  });

  it("shows a stale reading but is inconclusive without one for the current prompt version", () => {
    const stale = run({ promptVersion: "pv-older000000" });
    const report = buildProofReport(inputs({ v2LatestReading: stale, v2Reading: null }));
    const bar = barOf(report, "sameNeedPrecision");
    expect(bar.verdict).toBe("inconclusive");
    expect(bar.value).toBeCloseTo(0.97);
    expect(bar.reading).toMatchObject({ current: false, promptVersion: "pv-older000000" });
    expect(bar.reasons.join(" ")).toMatch(/not the current pv-current00000/u);
    expect(report.readiness.promptVersion).toEqual({
      current: PROMPT,
      reading: "pv-older000000",
    });
  });

  it("is inconclusive with no reading at all", () => {
    expect(reasonsOf({ v2LatestReading: null, v2Reading: null }, "sameNeedPrecision")).toMatch(
      /no v2 reading/iu,
    );
  });

  it("is inconclusive when nothing was labeled Same Need", () => {
    const none = run({ sameNeed: { predicted: 0, truePositives: 0 } });
    expect(reasonsOf({ v2LatestReading: none, v2Reading: none }, "sameNeedPrecision")).toMatch(
      /labeled no candidate/iu,
    );
  });
});

describe("Related-Need Precision bar", () => {
  it("fails below 75% and states the three-way verdict is to be narrowed", () => {
    const failing = run({ relatedNeed: { predicted: 100, truePositives: 50 } });
    const report = buildProofReport(inputs({ v2LatestReading: failing, v2Reading: failing }));
    const bar = barOf(report, "relatedNeedPrecision");
    expect(bar.verdict).toBe("fail");
    expect(report.narrowToTwoWay).toBe(true);
    expect(report.killCriterionTriggered).toBe(false);
    expect(bar.consequence).toMatch(/two-way/iu);
    expect(report.consequences.join(" ")).toMatch(/narrow the three-way verdict to two-way/iu);
  });
});

describe("overall verdict", () => {
  it("is inconclusive (not yet) when no bar fails but one is inconclusive", () => {
    const report = buildProofReport(inputs({ pilotMetrics: metrics({ checks: 120 }) }));
    expect(report.verdict).toBe("inconclusive");
    expect(report.slice3).toBe("not_yet");
    expect(report.consequences.join(" ")).toMatch(
      /Not yet.*Intake Duplicate Rate, Review Coverage/u,
    );
  });
});

describe("supporting metrics (no bar)", () => {
  const { supporting } = buildProofReport(inputs());

  it("reports Agent Correctness with harm, miss and an interval", () => {
    expect(supporting.agentCorrectness).toMatchObject({
      correct: 180,
      harm: 6,
      miss: 14,
      rate: 0.9,
      scored: 200,
    });
    expect(supporting.agentCorrectness?.interval?.lower).toBeGreaterThan(0.84);
  });

  it("reports Product Manager agreement blind and not blind", () => {
    expect(supporting.pmAgreement?.blind).toMatchObject({ agree: 45, disagree: 5, rate: 0.9 });
    expect(supporting.pmAgreement?.nonBlind.agree).toBe(100);
    expect(supporting.pmAgreement?.blind.interval).not.toBeNull();
  });

  it("labels Suggestion Acceptance as reported, not evidence", () => {
    expect(supporting.suggestionAcceptance).toMatchObject({
      checks: 220,
      evidence: false,
      rate: 0.9,
    });
    expect(supporting.suggestionAcceptance?.note).toMatch(/reported, not evidence/iu);
  });

  it("says when Answer Key scores are unavailable", () => {
    const report = buildProofReport(inputs({ answerKeyScores: null }));
    expect(report.supporting.agentCorrectness).toBeNull();
    expect(report.supporting.notes.join(" ")).toMatch(/Answer Key scores are unavailable/u);
  });
});
