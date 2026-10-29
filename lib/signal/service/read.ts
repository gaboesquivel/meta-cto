import type {
  FeatureRequestSummary,
  ReviewMetrics,
  SearchInput,
  SuggestionMetrics,
} from "../contracts";
import { rateOf, searchInputSchema } from "../contracts";
import type { ServiceContext } from "./context";
import { embedOrUnavailable, parseInput } from "./context";
import { summarize } from "./views";

const DEFAULT_LIMIT = 20;

const fetchPage = async (context: ServiceContext, input: SearchInput, take: number) => {
  const offset = input.cursor ?? 0;
  if (!input.q) {
    return await context.repo.listFeatureRequests({
      limit: take,
      offset,
      workspaceId: context.workspaceId,
    });
  }
  const embedding = await embedOrUnavailable(context, input.q);
  const rows = await context.repo.nearestFeatureRequests({
    embedding,
    limit: offset + take,
    workspaceId: context.workspaceId,
  });
  return rows.slice(offset);
};

/** Semantic search when `q` is given, otherwise newest first; the cursor is an offset. */
export const runSearch = async (
  context: ServiceContext,
  raw: SearchInput,
): Promise<{ items: FeatureRequestSummary[]; nextCursor: number | null }> => {
  const input = parseInput(searchInputSchema, raw);
  const limit = input.limit ?? DEFAULT_LIMIT;
  const rows = await fetchPage(context, input, limit + 1);
  const page = rows.slice(0, limit);
  return {
    items: await summarize(context, page),
    nextCursor: rows.length > limit ? (input.cursor ?? 0) + limit : null,
  };
};

const payloadsOf = async (context: ServiceContext, type: string) => {
  const rows = await context.repo.eventsOfType(context.workspaceId, type);
  return rows.map((row) => row.payload as Record<string, unknown>);
};

/** Suggestion Acceptance: Checks with a Same Need candidate that end in a Support or Comment. */
const suggestionMetrics = async (context: ServiceContext): Promise<SuggestionMetrics> => {
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
export const runMetrics = async (context: ServiceContext): Promise<ReviewMetrics> => {
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
