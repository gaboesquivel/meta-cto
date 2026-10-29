import type {
  CommentView,
  FeatureRequestDetail,
  FeatureRequestSummary,
  RelatedLinkView,
  SupportView,
} from "../contracts";
import type {
  AccountRow,
  CommentRow,
  FeatureRequestRow,
  RelatedLinkRow,
  SupportRow,
} from "../repository";
import type { ServiceContext } from "./context";
import { actorOf } from "./context";

export const toSupportView = (row: SupportRow, account: AccountRow | undefined): SupportView => ({
  account: {
    name: account?.name ?? "Unknown account",
    plan: account?.plan ?? null,
    segment: account?.segment ?? null,
    size: account?.size ?? null,
  },
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
  context: ServiceContext,
  rows: FeatureRequestRow[],
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

const relatedLinkViews = async (
  context: ServiceContext,
  id: string,
): Promise<RelatedLinkView[]> => {
  const links = await context.repo.listRelatedLinks(id);
  const others = await context.repo.getFeatureRequests(links.map((link) => otherSide(link, id)));
  const titles = new Map(others.map((row) => [row.id, row.title]));
  return links.map((link) => {
    const featureRequestId = otherSide(link, id);
    return {
      featureRequestId,
      reason: link.reason,
      sharedDimension: link.sharedDimension,
      title: titles.get(featureRequestId) ?? "",
    };
  });
};

const accountMap = async (context: ServiceContext, ids: (string | null)[]) => {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const rows = await context.repo.getAccounts(unique);
  return new Map(rows.map((row) => [row.id, row]));
};

export const buildDetail = async (
  context: ServiceContext,
  row: FeatureRequestRow,
): Promise<FeatureRequestDetail> => {
  const supports = await context.repo.listSupports(row.id);
  const comments = await context.repo.listComments(row.id);
  const accounts = await accountMap(context, [
    row.onBehalfOfAccountId,
    ...supports.map((support) => support.accountId),
    ...comments.map((comment) => comment.accountId),
  ]);
  const [summary] = await summarize(context, [row]);
  const accountOf = (id: string | null) => (id ? (accounts.get(id) ?? null) : null);
  return {
    ...(summary as FeatureRequestSummary),
    comments: comments.map((comment) => toCommentView(comment, accountOf(comment.accountId))),
    createdBy: actorOf({ actorName: row.createdByActorName, actorType: row.createdByActorType }),
    onBehalfOf: {
      account: accountOf(row.onBehalfOfAccountId)?.name ?? null,
      requester: row.requesterName,
    },
    relatedLinks: await relatedLinkViews(context, row.id),
    skipReason: row.skipReason,
    supports: supports.map((support) => toSupportView(support, accounts.get(support.accountId))),
  };
};
