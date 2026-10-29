import type { FeatureRequestDetail } from "../contracts";
import type { FeatureRequestRow } from "../repository";
import type { ServiceContext } from "./context";
import { isBlind } from "./review-context";

type BlindScope = Pick<ServiceContext, "blindShare" | "repo" | "workspaceId">;

const hasOwnActiveDecision = (
  id: string,
  decisions: { featureRequestId: string; undoneAt: Date | string | null }[],
) => decisions.some((decision) => decision.featureRequestId === id && !decision.undoneAt);

/** Of `ids`, the new Feature Requests chosen for Blind Review that have no decision of their own. */
const pendingBlind = async (context: BlindScope, ids: string[]): Promise<Set<string>> => {
  const rows = await context.repo.getFeatureRequests([...new Set(ids)]);
  const blind = rows.filter((row) => isBlind(context, row)).map((row) => row.id);
  if (blind.length === 0) return new Set();
  const decisions = await context.repo.listReviewDecisions({
    activeOnly: true,
    featureRequestIds: blind,
  });
  return new Set(blind.filter((id) => !hasOwnActiveDecision(id, decisions)));
};

/**
 * Blind Review (spec 003) on the read side: while a new Feature Request chosen for Blind Review
 * has no decision of its own, its detail withholds the AI's restated need and the AI's Related
 * Need links (source `check`), and no other Feature Request's detail shows the AI's link to it.
 * Everything else on the detail stays. With no blind share (the Crewday demo) nothing changes.
 */
export const withholdForBlindReview = async (
  context: BlindScope,
  row: FeatureRequestRow,
  detail: FeatureRequestDetail,
): Promise<FeatureRequestDetail> => {
  if (!(context.blindShare > 0)) return detail;
  const self = isBlind(context, row) && !hasOwnActiveDecision(row.id, detail.reviewHistory);
  const aiLinks = detail.relatedLinks.filter((link) => link.source === "check");
  const hidden = self
    ? new Set(aiLinks.map((link) => link.featureRequestId))
    : await pendingBlind(
        context,
        aiLinks.map((link) => link.featureRequestId),
      );
  if (!self && hidden.size === 0) return detail;
  return {
    ...detail,
    relatedLinks: detail.relatedLinks.filter(
      (link) => !(link.source === "check" && hidden.has(link.featureRequestId)),
    ),
    underlyingNeed: self ? null : detail.underlyingNeed,
  };
};
