import type {
  Actor,
  FeatureRequestSummary,
  ReviewDecision,
  ReviewQueue,
  ReviewService,
  ReviewSuspicionView,
} from "../contracts";
import { SignalError, actorSchema } from "../contracts";
import type { SuspectedDuplicateRow } from "../repository";
import { orderedPair, toReviewDecision } from "../repository";
import { isUuid, parseInput } from "./context";
import { runMetrics } from "./metrics";
import { runDecide } from "./review-decide";
import type { ReviewContext, ReviewServiceDeps } from "./review-context";
import { actorColumns, decisionNotFound } from "./review-context";
import { summarize } from "./views";

export type { ReviewServiceDeps } from "./review-context";

const pairKey = (a: string, b: string) => orderedPair(a, b).join(":");

const otherOf = (row: SuspectedDuplicateRow, id: string) =>
  row.featureRequestAId === id ? row.featureRequestBId : row.featureRequestAId;

const toSuspicionView = (
  row: SuspectedDuplicateRow,
  other: FeatureRequestSummary,
  decision: ReviewDecision | null,
): ReviewSuspicionView => ({
  decision,
  judgedAt: row.judgedAt.toISOString(),
  model: row.model,
  other,
  reason: row.reason,
  source: row.source as ReviewSuspicionView["source"],
  suggestionId: row.id,
});

/** Active pair decisions keyed by unordered pair. */
const activeDecisionsByPair = async (context: ReviewContext, ids: string[]) => {
  const active = await context.repo.listReviewDecisions({
    activeOnly: true,
    featureRequestIds: ids,
  });
  const byPair = new Map<string, ReviewDecision>();
  for (const row of active) {
    if (row.otherId) byPair.set(pairKey(row.featureRequestId, row.otherId), toReviewDecision(row));
  }
  return byPair;
};

const summariesById = async (context: ReviewContext, ids: string[]) => {
  const rows = await context.repo.getFeatureRequests([...new Set(ids)]);
  const summaries = await summarize(context, rows);
  return new Map(summaries.map((row) => [row.id, row]));
};

/** New requests not yet reviewed and requests with undecided suspicions, each with every suspicion's state. */
const runQueue = async (context: ReviewContext): Promise<ReviewQueue> => {
  const rows = await context.repo.listReviewQueueRequests(context.workspaceId);
  const ids = rows.map((row) => row.id);
  const suspicions = await context.repo.listSuspectedDuplicates(ids);
  const decisions = await activeDecisionsByPair(context, ids);
  const others = await summariesById(
    context,
    suspicions.flatMap((row) => [row.featureRequestAId, row.featureRequestBId]),
  );
  const summaries = await summarize(context, rows);
  const items = summaries.map((featureRequest, index) => {
    const views = suspicions.flatMap((row) => {
      const otherId = otherOf(row, featureRequest.id);
      const other = others.get(otherId);
      const touches =
        otherId !== featureRequest.id &&
        (row.featureRequestAId === featureRequest.id ||
          row.featureRequestBId === featureRequest.id);
      if (!(touches && other)) return [];
      return [
        toSuspicionView(
          row,
          other,
          decisions.get(pairKey(row.featureRequestAId, row.featureRequestBId)) ?? null,
        ),
      ];
    });
    return { featureRequest, isNew: rows[index]?.createdViaCheck ?? false, suspicions: views };
  });
  const fresh = items.filter((item) => item.isNew).length;
  return { counts: { backlog: items.length - fresh, new: fresh }, items };
};

/** Undo keeps the decision as history; a Duplicate's association ends. */
const runUndo = async (
  context: ReviewContext,
  decisionId: string,
  rawActor: Actor,
): Promise<ReviewDecision> => {
  const actor = parseInput(actorSchema, rawActor);
  const existing = isUuid(decisionId) ? await context.repo.getReviewDecision(decisionId) : null;
  if (!existing || existing.workspaceId !== context.workspaceId) throw decisionNotFound(decisionId);
  const row = existing.undoneAt
    ? null
    : await context.repo.undoReviewDecision({ ...actorColumns(actor), id: decisionId });
  if (!row) {
    throw new SignalError({
      code: "already_undone",
      message: `Review Decision ${decisionId} was already undone.`,
      resolution: "Record a new decision instead; the undone one stays in the history.",
      status: 409,
    });
  }
  if (row.decision === "duplicate" && row.canonicalId) {
    const duplicateId =
      row.canonicalId === row.featureRequestId ? row.otherId : row.featureRequestId;
    const duplicate = duplicateId ? await context.repo.getFeatureRequest(duplicateId) : null;
    if (duplicate?.duplicateOfId === row.canonicalId)
      await context.repo.clearDuplicateOf(duplicate.id);
  }
  await context.repo.insertEvent({
    payload: { actor, decision: row.decision, decisionId: row.id },
    subjectId: row.featureRequestId,
    type: "review_undone",
    workspaceId: context.workspaceId,
  });
  return toReviewDecision(row);
};

/** The Product Manager's review behaviour; Operator access is checked by REST and MCP. */
export const createReviewService = (deps: ReviewServiceDeps): ReviewService => {
  const context: ReviewContext = {
    now: deps.now ?? (() => new Date()),
    repo: deps.repo,
    workspaceId: deps.workspaceId,
  };
  return {
    decide: async (input, actor) => await runDecide(context, input, actor),
    metrics: async () => await runMetrics(context),
    queue: async () => await runQueue(context),
    scan: async (options) => {
      if (!deps.scan) {
        throw new SignalError({
          code: "service_unavailable",
          message: "The backlog scan is not available.",
          resolution: "Retry later; the scan is not configured in this deployment.",
          status: 503,
        });
      }
      return await deps.scan(options);
    },
    undo: async (decisionId, actor) => await runUndo(context, decisionId, actor),
  };
};
