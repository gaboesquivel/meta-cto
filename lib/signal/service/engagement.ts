import type { CommentInput, CommentView, SupportInput, SupportView } from "../contracts";
import { commentInputSchema, supportInputSchema } from "../contracts";
import type { ServiceContext } from "./context";
import { parseInput, requireFeatureRequest, upsertOnBehalfOf } from "./context";
import { buildDetail, toCommentView, toSupportView } from "./views";

/** One Support per Account; a repeat returns the existing Support with `created: false`. */
export const runSupport = async (context: ServiceContext, id: string, raw: SupportInput) => {
  const input = parseInput(supportInputSchema, raw);
  const row = await requireFeatureRequest(context, id);
  const account = await upsertOnBehalfOf(context, input.onBehalfOf);
  if (!account) throw new Error("support requires an account");
  const inserted = await context.repo.insertSupport({
    accountId: account.id,
    actorName: input.actor.name,
    actorType: input.actor.type,
    checkId: input.checkId ?? null,
    featureRequestId: row.id,
    isDemo: context.markDemo,
    quote: input.quote ?? null,
    requesterName: input.onBehalfOf.requester?.name ?? null,
    requesterRole: input.onBehalfOf.requester?.role ?? null,
  });
  if (inserted.created) {
    await context.repo.insertEvent({
      origin: context.origin,
      payload: {
        accountId: account.id,
        actor: input.actor,
        checkId: input.checkId ?? null,
        supportId: inserted.support.id,
      },
      subjectId: row.id,
      type: "feature_request_supported",
      workspaceId: context.workspaceId,
    });
  }
  const support: SupportView = toSupportView(inserted.support, account);
  return { created: inserted.created, featureRequest: await buildDetail(context, row), support };
};

export const runComment = async (
  context: ServiceContext,
  id: string,
  raw: CommentInput,
): Promise<CommentView> => {
  const input = parseInput(commentInputSchema, raw);
  const row = await requireFeatureRequest(context, id);
  const account = await upsertOnBehalfOf(context, input.onBehalfOf);
  const comment = await context.repo.insertComment({
    accountId: account?.id ?? null,
    actorName: input.actor.name,
    actorType: input.actor.type,
    body: input.body,
    featureRequestId: row.id,
    isDemo: context.markDemo,
  });
  await context.repo.insertEvent({
    origin: context.origin,
    payload: {
      accountId: account?.id ?? null,
      actor: input.actor,
      checkId: input.checkId ?? null,
      commentId: comment.id,
    },
    subjectId: row.id,
    type: "comment_added",
    workspaceId: context.workspaceId,
  });
  return toCommentView(comment, account);
};
