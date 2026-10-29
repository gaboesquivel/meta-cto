import Link from "next/link";

import type {
  CommentView,
  DuplicateEvidence,
  EvidenceVia,
  FeatureRequestDetail,
  FeatureRequestRef,
} from "@/lib/signal/contracts";
import { cn } from "cn";

import {
  DECISION_LABELS,
  describeDecision,
  duplicateOriginLabel,
  groupEvidenceByAccount,
} from "./review-view";
import { describeAccount } from "./view";

const detailHref = (id: string) => `/requests/${encodeURIComponent(id)}`;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

/** "via <title>" label for evidence recorded on a confirmed duplicate. */
export const ViaLabel = ({ via }: { via: EvidenceVia }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[0.7rem] font-medium text-violet-900 dark:bg-violet-950 dark:text-violet-200">
    via{" "}
    <Link className="underline underline-offset-2" href={detailHref(via.featureRequestId)}>
      {via.title}
    </Link>
  </span>
);

/** Banner on a confirmed duplicate pointing to its canonical Feature Request. */
export const DuplicateOfBanner = ({ canonical }: { canonical: FeatureRequestRef }) => (
  <aside className="rounded-xl border border-violet-500/40 bg-violet-50 p-4 text-sm dark:bg-violet-950/30">
    <p className="font-semibold">This Feature Request is a confirmed Duplicate.</p>
    <p className="mt-1">
      Its Supports and Comments also appear on the canonical Feature Request:{" "}
      <Link className="font-medium underline underline-offset-4" href={detailHref(canonical.id)}>
        {canonical.title}
      </Link>
      . Add new evidence there.
    </p>
  </aside>
);

/** "Filed as <title> · via duplicate" label for a duplicate's own originating evidence. */
const OriginLabel = ({ duplicate }: { duplicate: DuplicateEvidence }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[0.7rem] font-medium text-violet-900 dark:bg-violet-950 dark:text-violet-200">
    <Link className="underline underline-offset-2" href={detailHref(duplicate.id)}>
      {duplicateOriginLabel(duplicate)}
    </Link>
  </span>
);

/** A duplicate's original words with who filed it, for whom, and when. */
const DuplicateOrigin = ({
  duplicate,
  showAccount,
}: {
  duplicate: DuplicateEvidence;
  showAccount: boolean;
}) => (
  <div className="text-sm">
    <blockquote className="border-l-2 pl-3 whitespace-pre-line italic">
      “{duplicate.description}”
    </blockquote>
    <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span>
        {showAccount && duplicate.account ? `${duplicate.account.name} · ` : ""}
        {duplicate.requester ? `${duplicate.requester}, via ` : "Via "}
        {duplicate.createdBy.name} · {formatDate(duplicate.createdAt)}
      </span>
      <OriginLabel duplicate={duplicate} />
    </p>
  </div>
);

/** Confirmed duplicates of a canonical Feature Request, each with its customer's original words. */
export const DuplicatesList = ({ duplicates }: { duplicates: DuplicateEvidence[] }) => (
  <ul className="flex flex-col gap-2">
    {duplicates.map((duplicate) => (
      <li className="flex flex-col gap-2 rounded-xl border p-3 text-sm" key={duplicate.id}>
        <Link
          className="font-medium underline-offset-4 hover:underline"
          href={detailHref(duplicate.id)}
        >
          {duplicate.title}
        </Link>
        <DuplicateOrigin duplicate={duplicate} showAccount />
      </li>
    ))}
  </ul>
);

/**
 * Supports, and duplicates' originating evidence, grouped by Account: each Account once, with the
 * customer's own words and provenance.
 */
export const SupportsByAccount = ({ request }: { request: FeatureRequestDetail }) => {
  const groups = groupEvidenceByAccount(request.supports, request.duplicates);
  if (groups.length === 0) return <p className="text-muted-foreground text-sm">No Supports yet.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {groups.map((group) => (
        <li className="rounded-xl border p-4" key={group.account.name}>
          <p className="font-medium">{group.account.name}</p>
          {describeAccount(group.account) ? (
            <p className="text-muted-foreground text-xs">{describeAccount(group.account)}</p>
          ) : null}
          <ul className="mt-3 flex flex-col gap-3">
            {group.supports.map((support) => (
              <li className="text-sm" key={support.id}>
                {support.quote ? (
                  <blockquote className="border-l-2 pl-3 italic">“{support.quote}”</blockquote>
                ) : null}
                <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span>
                    {support.requester ? `${support.requester}, via ` : "Via "}
                    {support.actor.name} · {formatDate(support.createdAt)}
                  </span>
                  {support.via ? <ViaLabel via={support.via} /> : null}
                </p>
              </li>
            ))}
            {group.origins.map((duplicate) => (
              <li key={`origin-${duplicate.id}`}>
                <DuplicateOrigin duplicate={duplicate} showAccount={false} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
};

export const CommentsList = ({ comments }: { comments: CommentView[] }) => {
  if (comments.length === 0)
    return <p className="text-muted-foreground text-sm">No Comments yet.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {comments.map((comment) => (
        <li className="rounded-xl border p-4 text-sm" key={comment.id}>
          <p className="whitespace-pre-line">{comment.body}</p>
          <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span>
              {comment.actor.name}
              {comment.account ? ` for ${comment.account}` : ""} · {formatDate(comment.createdAt)}
            </span>
            {comment.via ? <ViaLabel via={comment.via} /> : null}
          </p>
        </li>
      ))}
    </ul>
  );
};

const titleMap = (request: FeatureRequestDetail): Map<string, string> => {
  const map = new Map<string, string>([[request.id, request.title]]);
  for (const ref of request.duplicates ?? []) map.set(ref.id, ref.title);
  if (request.duplicateOf) map.set(request.duplicateOf.id, request.duplicateOf.title);
  for (const link of request.relatedLinks) map.set(link.featureRequestId, link.title);
  for (const item of [...request.supports, ...request.comments]) {
    if (item.via) map.set(item.via.featureRequestId, item.via.title);
  }
  return map;
};

/** Review Decisions involving this Feature Request, newest first, undone ones included. */
export const ReviewHistory = ({ request }: { request: FeatureRequestDetail }) => {
  const history = [...(request.reviewHistory ?? [])].toSorted((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  if (history.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No Review Decisions yet.{" "}
        <Link className="underline underline-offset-4" href="/review">
          Open the Review Queue
        </Link>
      </p>
    );
  }
  const titles = titleMap(request);
  return (
    <ol className="flex flex-col gap-2">
      {history.map((decision) => {
        const undone = decision.undoneAt !== null;
        return (
          <li className="rounded-xl border p-3 text-sm" key={decision.id}>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-5 items-center rounded-full px-2 text-[0.65rem] font-semibold tracking-wide uppercase",
                  undone
                    ? "bg-muted text-muted-foreground line-through"
                    : "bg-foreground text-background",
                )}
              >
                {DECISION_LABELS[decision.decision]}
              </span>
              <span className={cn(undone && "text-muted-foreground")}>
                {describeDecision(decision, titles)}
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {decision.actor.name} · {formatDate(decision.createdAt)}
              {decision.undoneAt
                ? ` · Undone${decision.undoneBy ? ` by ${decision.undoneBy.name}` : ""} ${formatDate(decision.undoneAt)}`
                : ""}
            </p>
          </li>
        );
      })}
    </ol>
  );
};
