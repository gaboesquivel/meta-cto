import type {
  AccountView,
  CommentView,
  DuplicateEvidence,
  EvidenceVia,
  FeatureRequestDetail,
  FeatureRequestSummary,
  RelatedLinkView,
  SupportView,
} from "../contracts";
import type {
  AccountRow,
  CommentRow,
  FeatureRequestListRow,
  FeatureRequestRow,
  RelatedLinkRow,
  ReviewDecisionRow,
  SupportRow,
} from "../repository";
import { toReviewDecision } from "../repository";
import type { ServiceContext } from "./context";
import { actorOf } from "./context";

const toAccountView = (account: AccountRow | undefined): AccountView => ({
  name: account?.name ?? "Unknown account",
  plan: account?.plan ?? null,
  segment: account?.segment ?? null,
  size: account?.size ?? null,
});

export const toSupportView = (row: SupportRow, account: AccountRow | undefined): SupportView => ({
  account: toAccountView(account),
  actor: actorOf(row),
  createdAt: row.createdAt.toISOString(),
  id: row.id,
  quote: row.quote,
  requester: row.requesterName,
});

export const toCommentView = (row: CommentRow, account: AccountRow | null): CommentView => ({
  account: account?.name ?? null,
  actor: actorOf(row),
  body: row.body,
  createdAt: row.createdAt.toISOString(),
  id: row.id,
});

export const summarize = async (
  context: Pick<ServiceContext, "repo">,
  rows: Pick<FeatureRequestRow, "createdAt" | "description" | "id" | "title" | "underlyingNeed">[],
): Promise<FeatureRequestSummary[]> => {
  const counts = await context.repo.supportCounts(rows.map((row) => row.id));
  return rows.map((row) => ({
    accountCount: counts.get(row.id)?.accounts ?? 0,
    createdAt: row.createdAt.toISOString(),
    description: row.description,
    id: row.id,
    supportCount: counts.get(row.id)?.supports ?? 0,
    title: row.title,
    underlyingNeed: row.underlyingNeed,
  }));
};

const otherSide = (link: RelatedLinkRow, id: string) =>
  link.featureRequestAId === id ? link.featureRequestBId : link.featureRequestAId;

const decisionOther = (decision: ReviewDecisionRow, id: string) =>
  decision.featureRequestId === id ? decision.otherId : decision.featureRequestId;

/**
 * Stored Related Links plus one per active Related decision, so Undo removes the review's link
 * while a link recorded by a Check stays.
 */
const relatedLinkViews = async (
  context: Pick<ServiceContext, "repo">,
  id: string,
  decisions: ReviewDecisionRow[],
): Promise<RelatedLinkView[]> => {
  const links = await context.repo.listRelatedLinks(id);
  const stored = links.map((link) => ({
    featureRequestId: otherSide(link, id),
    reason: link.reason,
    sharedDimension: link.sharedDimension,
  }));
  const linked = new Set(stored.map((link) => link.featureRequestId));
  const reviewed = decisions
    .filter((decision) => decision.decision === "related" && !decision.undoneAt)
    .map((decision) => ({
      featureRequestId: decisionOther(decision, id) ?? "",
      reason: `Decided Related in review by ${decision.actorName}.`,
      sharedDimension: decision.sharedDimension ?? "",
    }))
    .filter((link) => link.featureRequestId && !linked.has(link.featureRequestId));
  const all = [...stored, ...reviewed];
  const others = await context.repo.getFeatureRequests(all.map((link) => link.featureRequestId));
  const titles = new Map(others.map((row) => [row.id, row.title]));
  return all.map((link) => ({ ...link, title: titles.get(link.featureRequestId) ?? "" }));
};

const accountMap = async (context: Pick<ServiceContext, "repo">, ids: (string | null)[]) => {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const rows = await context.repo.getAccounts(unique);
  return new Map(rows.map((row) => [row.id, row]));
};

const byCreatedAt = (a: { createdAt: Date }, b: { createdAt: Date }) =>
  a.createdAt.getTime() - b.createdAt.getTime();

const viaOf = (row: { viaFeatureRequestId: string; viaTitle: string }): EvidenceVia => ({
  featureRequestId: row.viaFeatureRequestId,
  title: row.viaTitle,
});

/**
 * This Feature Request's Supports and Comments plus its confirmed duplicates', with provenance,
 * and the Accounts they and `originAccountIds` (duplicates' on-behalf-of Accounts) refer to.
 */
const loadEvidence = async (
  context: Pick<ServiceContext, "repo">,
  row: FeatureRequestRow,
  originAccountIds: (string | null)[],
) => {
  const own = {
    comments: await context.repo.listComments(row.id),
    supports: await context.repo.listSupports(row.id),
  };
  const fromDuplicates = await context.repo.duplicateEvidence(row.id);
  const supports = [
    ...own.supports.map((support) => ({ row: support, via: undefined })),
    ...fromDuplicates.supports.map((support) => ({ row: support, via: viaOf(support) })),
  ].toSorted((a, b) => byCreatedAt(a.row, b.row));
  const comments = [
    ...own.comments.map((comment) => ({ row: comment, via: undefined })),
    ...fromDuplicates.comments.map((comment) => ({ row: comment, via: viaOf(comment) })),
  ].toSorted((a, b) => byCreatedAt(a.row, b.row));
  const accounts = await accountMap(context, [
    row.onBehalfOfAccountId,
    ...originAccountIds,
    ...supports.map((support) => support.row.accountId),
    ...comments.map((comment) => comment.row.accountId),
  ]);
  return { accounts, comments, supports };
};

const withVia = <T extends object>(view: T, via: EvidenceVia | undefined): T =>
  via ? { ...view, via } : view;

/** Confirmed duplicates, the canonical when this is a duplicate, and every decision touching it. */
const loadReview = async (context: Pick<ServiceContext, "repo">, row: FeatureRequestRow) => {
  const duplicates = await context.repo.listDuplicates(row.id);
  const canonical = row.duplicateOfId
    ? await context.repo.getFeatureRequest(row.duplicateOfId)
    : null;
  const decisions = await context.repo.listReviewDecisions({ featureRequestIds: [row.id] });
  return {
    decisions,
    duplicateOf: canonical ? { id: canonical.id, title: canonical.title } : null,
    duplicates,
  };
};

const toDuplicateEvidence = (
  row: FeatureRequestListRow,
  account: AccountRow | undefined,
): DuplicateEvidence => ({
  account: account ? toAccountView(account) : null,
  createdAt: row.createdAt.toISOString(),
  createdBy: actorOf({ actorName: row.createdByActorName, actorType: row.createdByActorType }),
  description: row.description,
  id: row.id,
  requester: row.requesterName,
  title: row.title,
});

export const buildDetail = async (
  context: Pick<ServiceContext, "repo">,
  row: FeatureRequestRow,
): Promise<FeatureRequestDetail> => {
  const review = await loadReview(context, row);
  const originAccountIds = review.duplicates.map((duplicate) => duplicate.onBehalfOfAccountId);
  const evidence = await loadEvidence(context, row, originAccountIds);
  const [summary] = await summarize(context, [row]);
  const accountOf = (id: string | null) => (id ? (evidence.accounts.get(id) ?? null) : null);
  // Each Account counts once across Supports (here and on duplicates) and duplicates' origins.
  const countedAccounts = new Set([
    ...evidence.supports.map((support) => support.row.accountId),
    ...originAccountIds.filter((id): id is string => Boolean(id)),
  ]);
  return {
    ...(summary as FeatureRequestSummary),
    accountCount: countedAccounts.size,
    comments: evidence.comments.map(({ row: comment, via }) =>
      withVia(toCommentView(comment, accountOf(comment.accountId)), via),
    ),
    createdBy: actorOf({ actorName: row.createdByActorName, actorType: row.createdByActorType }),
    duplicateOf: review.duplicateOf,
    duplicates: review.duplicates.map((duplicate) =>
      toDuplicateEvidence(
        duplicate,
        duplicate.onBehalfOfAccountId
          ? evidence.accounts.get(duplicate.onBehalfOfAccountId)
          : undefined,
      ),
    ),
    onBehalfOf: {
      account: accountOf(row.onBehalfOfAccountId)?.name ?? null,
      requester: row.requesterName,
    },
    relatedLinks: await relatedLinkViews(context, row.id, review.decisions),
    reviewHistory: review.decisions.map(toReviewDecision),
    skipReason: row.skipReason,
    supportCount: evidence.supports.length,
    supports: evidence.supports.map(({ row: support, via }) =>
      withVia(toSupportView(support, evidence.accounts.get(support.accountId)), via),
    ),
  };
};
