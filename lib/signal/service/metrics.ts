import type { ReviewMetrics, SuggestionMetrics } from "../contracts";
import { rateOf } from "../contracts";
import type { SignalRepository } from "../repository";

/** Metrics read only the database: events and review state. */
export interface MetricsContext {
  repo: SignalRepository;
  workspaceId: string;
}

const payloadsOf = async (context: MetricsContext, type: string) => {
  const rows = await context.repo.eventsOfType(context.workspaceId, type);
  return rows.map((row) => row.payload as Record<string, unknown>);
};

/** Suggestion Acceptance: Checks with a Same Need candidate that end in a Support or Comment. */
const suggestionMetrics = async (context: MetricsContext): Promise<SuggestionMetrics> => {
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
export const runMetrics = async (context: MetricsContext): Promise<ReviewMetrics> => {
  const suggestion = await suggestionMetrics(context);
  const counts = await context.repo.reviewMetricCounts(context.workspaceId);
  const { duplicateDecisions, open } = counts;
  return {
    ...suggestion,
    backlogBaseline: duplicateRate(counts.backlog),
    intakeDuplicateRate: duplicateRate(counts.new),
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
