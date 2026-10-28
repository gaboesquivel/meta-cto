import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CommentForm } from "@/components/signal/comment-form";
import { SignalHeader } from "@/components/signal/signal-header";
import { StaffNameField } from "@/components/signal/staff-name-field";
import { SupportForm } from "@/components/signal/support-form";
import { describeAccount, groupSupportsByAccount } from "@/components/signal/view";
import type { FeatureRequestDetail } from "@/lib/signal/contracts";
import { SignalError } from "@/lib/signal/contracts";
import { getSignalService } from "@/lib/signal/runtime";

export const metadata: Metadata = {
  description: "A Feature Request with its Underlying Need, Supports, Comments and Related Links.",
  title: "Feature Request · Signal",
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

const Section = ({ children, title }: { children: React.ReactNode; title: string }) => (
  <section className="flex flex-col gap-3">
    <h2 className="text-base font-semibold">{title}</h2>
    {children}
  </section>
);

const Supports = ({ request }: { request: FeatureRequestDetail }) => {
  const groups = groupSupportsByAccount(request.supports);
  if (groups.length === 0) return <p className="text-muted-foreground text-sm">No Supports yet.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {groups.map((group) => (
        <li className="rounded-xl border p-4" key={group.account.name}>
          <p className="font-medium">{group.account.name}</p>
          {describeAccount(group.account) ? (
            <p className="text-muted-foreground text-xs">{describeAccount(group.account)}</p>
          ) : null}
          <ul className="mt-3 flex flex-col gap-2">
            {group.supports.map((support) => (
              <li className="text-sm" key={support.id}>
                {support.quote ? (
                  <blockquote className="border-l-2 pl-3 italic">“{support.quote}”</blockquote>
                ) : null}
                <p className="text-muted-foreground mt-1 text-xs">
                  {support.requester ? `${support.requester}, via ` : "Via "}
                  {support.actor.name} · {formatDate(support.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
};

const RelatedLinks = ({ request }: { request: FeatureRequestDetail }) => {
  if (request.relatedLinks.length === 0) {
    return <p className="text-muted-foreground text-sm">No Related Links.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {request.relatedLinks.map((link) => (
        <li className="rounded-xl border p-4" key={link.featureRequestId}>
          <Link
            className="font-medium underline-offset-4 hover:underline"
            href={`/requests/${encodeURIComponent(link.featureRequestId)}`}
          >
            {link.title}
          </Link>
          <p className="text-muted-foreground mt-1 text-xs">
            Shared Dimension:{" "}
            <span className="text-foreground font-medium">{link.sharedDimension}</span>
          </p>
          <p className="mt-1 text-sm">
            <span className="text-muted-foreground">Reason: </span>
            {link.reason}
          </p>
        </li>
      ))}
    </ul>
  );
};

const Comments = ({ request }: { request: FeatureRequestDetail }) => {
  if (request.comments.length === 0)
    return <p className="text-muted-foreground text-sm">No Comments yet.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {request.comments.map((comment) => (
        <li className="rounded-xl border p-4 text-sm" key={comment.id}>
          <p className="whitespace-pre-line">{comment.body}</p>
          <p className="text-muted-foreground mt-2 text-xs">
            {comment.actor.name}
            {comment.account ? ` for ${comment.account}` : ""} · {formatDate(comment.createdAt)}
          </p>
        </li>
      ))}
    </ul>
  );
};

const loadRequest = async (id: string): Promise<FeatureRequestDetail | null> => {
  const service = getSignalService();
  if (!service) return null;
  try {
    return await service.get(id);
  } catch (error) {
    if (error instanceof SignalError && error.code === "not_found") notFound();
    throw error;
  }
};

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = await loadRequest(id);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-4 py-6 sm:px-8">
      <SignalHeader />
      {request ? (
        <>
          <header className="flex flex-col gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-balance">{request.title}</h1>
            <p className="text-muted-foreground text-xs">
              {request.supportCount} Supports · {request.accountCount} Accounts · filed by{" "}
              {request.createdBy.name}
              {request.onBehalfOf.account ? ` for ${request.onBehalfOf.account}` : ""} ·{" "}
              {formatDate(request.createdAt)}
            </p>
            {request.underlyingNeed ? (
              <div className="bg-foreground text-background rounded-2xl p-5">
                <p className="text-xs font-semibold tracking-widest uppercase opacity-70">
                  Underlying Need
                </p>
                <p className="mt-2 text-lg leading-snug font-semibold text-balance">
                  {request.underlyingNeed}
                </p>
              </div>
            ) : null}
            <p className="text-sm whitespace-pre-line">{request.description}</p>
            {request.skipReason ? (
              <p className="text-muted-foreground text-sm">
                <span className="font-medium">Skip Reason:</span> {request.skipReason}
              </p>
            ) : null}
          </header>
          <Section title="Supports by Account">
            <Supports request={request} />
          </Section>
          <Section title="Related Links">
            <RelatedLinks request={request} />
          </Section>
          <Section title="Comments">
            <Comments request={request} />
          </Section>
          <section className="bg-muted/40 flex flex-col gap-6 rounded-2xl border p-4 sm:p-5">
            <StaffNameField id="detail-staff-name" />
            <div className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">Add a Support</h2>
              <SupportForm featureRequestId={request.id} />
            </div>
            <div className="flex flex-col gap-3 border-t pt-5">
              <h2 className="text-base font-semibold">Add a Comment</h2>
              <CommentForm featureRequestId={request.id} />
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-xl border p-5">
          <h1 className="text-lg font-semibold">Signal is not configured</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            The database or AI keys are missing, so this Feature Request cannot be loaded. Set
            DATABASE_URL and the AI Gateway key, then reload.
          </p>
        </div>
      )}
    </main>
  );
}
