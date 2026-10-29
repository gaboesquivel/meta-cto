import type { MetricsInput, Origin, ReviewMetrics, SuggestionMetrics } from "../contracts";
import { metricsInputSchema, rateOf } from "../contracts";
import type { SignalRepository } from "../repository";
import { parseInput } from "./context";

/** Metrics read only the database: events and review state, for the caller's own Origin by default. */
export interface MetricsContext {
  origin: Origin;
  repo: SignalRepository;
  workspaceId: string;
}

/** The context narrowed to the one Origin every count reads; a metric never mixes Origins. */
interface OriginScope {
  origin: Origin;
  repo: SignalRepository;
  workspaceId: string;
}

const payloadsOf = async (context: OriginScope, type: string) => {
  const rows = await context.repo.eventsOfType(context.workspaceId, type, context.origin);
  return rows.map((row) => row.payload as Record<string, unknown>);
};

/** Suggestion Acceptance: Checks with a Same Need candidate that end in a Support or Comment. */
const suggestionMetrics = async (context: OriginScope): Promise<SuggestionMetrics> => {
  const checked = await payloadsOf(context, "draft_checked");
  const created = await payloadsOf(context, "feature_request_created");
  const engaged = [
    ...(await payloadsOf(context, "feature_request_supported")),
    ...(await payloadsOf(context, "comment_added")),
  ];
  const sameNeedChecks = new Set(
    checked
      .filter((payload) => typeof payload.sameNeed === "number" && payload.sameNeed > 0)
      .map((payload) => payload.checkId),
  );
  const accepted = new Set(
    engaged.map((payload) => payload.checkId).filter((checkId) => sameNeedChecks.has(checkId)),
  );
  return {
    checks: checked.length,
    checksWithSameNeed: sameNeedChecks.size,
    createsAfterSameNeed: created.filter((payload) => payload.hadSameNeed === true).length,
    suggestionAcceptance: rateOf(accepted.size, sameNeedChecks.size),
  };
};

const duplicateRate = (group: { duplicates: number; reviewed: number }) => ({
  duplicates: group.duplicates,
  rate: rateOf(group.duplicates, group.reviewed),
  reviewed: group.reviewed,
});

/** Decision 0002 measures, each with its counts, alongside spec 001's Suggestion Acceptance. */
export const runMetrics = async (
  context: MetricsContext,
  raw: MetricsInput = {},
): Promise<ReviewMetrics> => {
  const input = parseInput(metricsInputSchema, raw);
  const scope: OriginScope = { ...context, origin: input.origin ?? context.origin };
  const suggestion = await suggestionMetrics(scope);
  const counts = await context.repo.reviewMetricCounts(context.workspaceId, scope.origin);
  const { duplicateDecisions, open } = counts;
  return {
    ...suggestion,
    backlogBaseline: duplicateRate(counts.backlog),
    intakeDuplicateRate: duplicateRate(counts.new),
    origin: scope.origin,
    reviewCoverage: {
      rate: rateOf(counts.new.reviewed, counts.new.total),
      reviewed: counts.new.reviewed,
      total: counts.new.total,
    },
    suspectedDuplication: {
      open: open.suspected,
      rate: rateOf(open.suspected, open.total),
      total: open.total,
    },
    undoRate: {
      decisions: duplicateDecisions.total,
      rate: rateOf(duplicateDecisions.undone, duplicateDecisions.total),
      undone: duplicateDecisions.undone,
    },
  };
};
