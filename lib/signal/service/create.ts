import type { Candidate, CheckResult, CreateInput, FeatureRequestDetail } from "../contracts";
import { SignalError, createInputSchema } from "../contracts";
import type { CheckRow } from "../repository";
import type { ServiceContext } from "./context";
import { draftHash, draftText, parseInput, upsertOnBehalfOf } from "./context";
import { buildDetail } from "./views";

const CHECK_FIRST = "Call check_feature_request with this Draft and pass the returned checkId.";

/** Loads the Check for a create and enforces existence, Draft match, expiry and Skip Reason. */
const requireValidCheck = async (
  context: ServiceContext,
  input: CreateInput,
): Promise<{ check: CheckRow; result: CheckResult }> => {
  const check = await context.repo.getCheck(input.checkId);
  if (!check || check.workspaceId !== context.workspaceId) {
    throw new SignalError({
      code: "check_required",
      message: "Creating a Feature Request requires a recent Check of the same Draft.",
      resolution: CHECK_FIRST,
      status: 409,
    });
  }
  if (check.draftHash !== draftHash(input.draft)) {
    throw new SignalError({
      code: "check_mismatch",
      message: "The Draft differs from the one that was checked.",
      resolution: `${CHECK_FIRST} Check again after editing the Draft.`,
      status: 409,
    });
  }
  if (check.expiresAt.getTime() <= context.now().getTime()) {
    throw new SignalError({
      code: "check_expired",
      message: "The Check has expired.",
      resolution: `${CHECK_FIRST} Checks are valid for 30 minutes.`,
      status: 410,
    });
  }
  const result = check.result as CheckResult;
  const hadSameNeed = result.candidates.some((candidate) => candidate.verdict === "same_need");
  if (hadSameNeed && !input.skipReason) {
    throw new SignalError({
      code: "skip_reason_required",
      details: { candidates: result.candidates.filter((c) => c.verdict === "same_need") },
      message: "The Check found a Feature Request with the same need.",
      resolution:
        "Support or comment on the Same Need Feature Request, or retry with a skipReason explaining why it differs.",
      status: 422,
    });
  }
  return { check, result };
};

const embedOrNull = async (context: ServiceContext, text: string) => {
  try {
    return await context.embedder.embed(text);
  } catch {
    // The seed backfills missing embeddings; a create should not fail on retrieval.
    return null;
  }
};

const addRelatedLink = async (
  context: ServiceContext,
  id: string,
  checkId: string,
  candidate: Candidate,
) => {
  const sharedDimension = candidate.sharedDimension ?? "";
  await context.repo.insertRelatedLink({
    a: id,
    b: candidate.featureRequestId,
    reason: candidate.reason ?? "",
    sharedDimension,
    source: "check",
  });
  await context.repo.insertEvent({
    payload: { checkId, featureRequestId: candidate.featureRequestId, sharedDimension },
    subjectId: id,
    type: "related_link_added",
    workspaceId: context.workspaceId,
  });
};

/** Links the new Feature Request to each Related Need candidate from its Check. */
const addRelatedLinks = async (context: ServiceContext, id: string, result: CheckResult) => {
  const related = result.candidates.filter((candidate) => candidate.verdict === "related_need");
  await Promise.all(
    related.map(async (candidate) => await addRelatedLink(context, id, result.checkId, candidate)),
  );
};

export const runCreate = async (
  context: ServiceContext,
  raw: CreateInput,
): Promise<FeatureRequestDetail> => {
  const input = parseInput(createInputSchema, raw);
  const { result } = await requireValidCheck(context, input);
  const account = await upsertOnBehalfOf(context, input.onBehalfOf);
  const row = await context.repo.insertFeatureRequest({
    checkId: input.checkId,
    createdByActorName: input.actor.name,
    createdByActorType: input.actor.type,
    description: input.draft.description,
    embedding: await embedOrNull(context, draftText(input.draft)),
    onBehalfOfAccountId: account?.id ?? null,
    requesterName: input.onBehalfOf?.requester?.name ?? null,
    requesterRole: input.onBehalfOf?.requester?.role ?? null,
    skipReason: input.skipReason ?? null,
    title: input.draft.title,
    underlyingNeed: result.underlyingNeed,
    workspaceId: context.workspaceId,
  });
  await context.repo.insertEvent({
    payload: {
      actor: input.actor,
      checkId: input.checkId,
      hadSameNeed: result.candidates.some((candidate) => candidate.verdict === "same_need"),
      skipReason: input.skipReason ?? null,
    },
    subjectId: row.id,
    type: "feature_request_created",
    workspaceId: context.workspaceId,
  });
  await addRelatedLinks(context, row.id, result);
  return await buildDetail(context, row);
};
