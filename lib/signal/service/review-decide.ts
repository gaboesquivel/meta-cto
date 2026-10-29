import type { Actor, DecideInput, ReviewDecision } from "../contracts";
import { SignalError, actorSchema, decideInputSchema, decisionRuleViolation } from "../contracts";
import type { FeatureRequestRow } from "../repository";
import { orderedPair, toReviewDecision } from "../repository";
import { UNIQUE_VIOLATION, databaseErrorCode, parseInput, requireFeatureRequest } from "./context";
import type { ReviewContext } from "./review-context";
import { actorColumns, invalidDecision } from "./review-context";

const CHECK_VIOLATION = "23514";

/** The Suspected Duplicate this decision answers: the one named, or the pair's own when unnamed. */
const resolveSuggestion = async (
  context: ReviewContext,
  input: DecideInput,
): Promise<string | null> => {
  if (!input.otherId) {
    if (input.suggestionId) throw invalidDecision("A none decision answers no suggestion.");
    return null;
  }
  const [first, second] = orderedPair(input.featureRequestId, input.otherId);
  const rows = await context.repo.listSuspectedDuplicates([input.featureRequestId]);
  const pair = rows.find(
    (row) => row.featureRequestAId === first && row.featureRequestBId === second,
  );
  if (input.suggestionId && pair?.id !== input.suggestionId) {
    throw new SignalError({
      code: "not_found",
      message: `Suspected Duplicate ${input.suggestionId} is not about this pair.`,
      resolution: "Use the suggestionId the Review Queue shows for this pair, or omit it.",
      status: 404,
    });
  }
  return pair?.id ?? null;
};

/** Duplicate rules the database also enforces, checked first for a clear message. */
const duplicateViolation = async (
  context: ReviewContext,
  canonical: FeatureRequestRow,
  duplicate: FeatureRequestRow,
): Promise<string | null> => {
  if (canonical.duplicateOfId) {
    return `"${canonical.title}" is itself a duplicate; mark against its canonical Feature Request.`;
  }
  if (duplicate.duplicateOfId) return `"${duplicate.title}" is already a confirmed duplicate.`;
  const children = await context.repo.listDuplicates(duplicate.id);
  return children.length > 0
    ? `"${duplicate.title}" has confirmed duplicates of its own; make it the canonical instead.`
    : null;
};

const insertDecision = async (
  context: ReviewContext,
  input: DecideInput,
  actor: Actor,
  suggestionId: string | null,
) => {
  try {
    return await context.repo.insertReviewDecision({
      ...actorColumns(actor),
      canonicalId: input.canonicalId ?? null,
      decision: input.decision,
      featureRequestId: input.featureRequestId,
      otherId: input.otherId ?? null,
      sharedDimension: input.sharedDimension ?? null,
      suggestionId,
      workspaceId: context.workspaceId,
    });
  } catch (error) {
    const code = databaseErrorCode(error);
    if (code === UNIQUE_VIOLATION)
      throw invalidDecision("This pair is already decided; undo first.");
    if (code === CHECK_VIOLATION) throw invalidDecision("The decision breaks a review rule.");
    throw error;
  }
};

/**
 * Mark Duplicate. If storage refuses the association, or another decision associated the
 * duplicate first, the decision is withdrawn: it never took effect, so it leaves no history and
 * no Undo by the reviewer.
 */
const associate = async (context: ReviewContext, decision: ReviewDecision, duplicateId: string) => {
  let associated: boolean;
  try {
    associated = await context.repo.setDuplicateOf(duplicateId, decision.canonicalId as string);
  } catch (error) {
    await context.repo.deleteReviewDecision(decision.id);
    throw invalidDecision(
      "The association was refused: a Duplicate can't point at itself or form a chain.",
      "Mark against the canonical Feature Request, or undo the decisions that form the chain.",
      error instanceof Error ? error.message : undefined,
    );
  }
  if (!associated) {
    await context.repo.deleteReviewDecision(decision.id);
    throw invalidDecision(
      "The Feature Request is already a duplicate of another one.",
      "Reload its review history; undo that Duplicate first if it was wrong.",
    );
  }
};

const loadSides = async (context: ReviewContext, input: DecideInput) => {
  const featureRequest = await requireFeatureRequest(context, input.featureRequestId);
  const other = input.otherId ? await requireFeatureRequest(context, input.otherId) : null;
  return { featureRequest, other };
};

/** Records a Review Decision; a Duplicate also associates the non-canonical side with the canonical. */
export const runDecide = async (
  context: ReviewContext,
  raw: DecideInput,
  rawActor: Actor,
): Promise<ReviewDecision> => {
  const input = parseInput(decideInputSchema, raw);
  const actor = parseInput(actorSchema, rawActor);
  const violation = decisionRuleViolation(input);
  if (violation) throw invalidDecision(violation, "Fix the decision fields and retry.");
  const { featureRequest, other } = await loadSides(context, input);
  const suggestionId = await resolveSuggestion(context, input);
  const sides = other && input.decision === "duplicate" ? [featureRequest, other] : [];
  const canonical = sides.find((row) => row.id === input.canonicalId);
  const duplicate = sides.find((row) => row.id !== input.canonicalId);
  if (canonical && duplicate) {
    const refused = await duplicateViolation(context, canonical, duplicate);
    if (refused) throw invalidDecision(refused, "Undo the decision that set it up, then retry.");
  }
  const decision = toReviewDecision(await insertDecision(context, input, actor, suggestionId));
  if (duplicate) await associate(context, decision, duplicate.id);
  await context.repo.insertEvent({
    origin: context.origin,
    payload: {
      actor,
      canonicalId: decision.canonicalId,
      decision: decision.decision,
      decisionId: decision.id,
      otherId: decision.otherId,
      sharedDimension: decision.sharedDimension,
      suggestionId: decision.suggestionId,
    },
    subjectId: decision.featureRequestId,
    type: "review_decided",
    workspaceId: context.workspaceId,
  });
  return decision;
};
