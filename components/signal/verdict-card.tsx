"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/button";
import type { Candidate, OnBehalfOf, SupportView } from "@/lib/signal/contracts";
import { cn } from "cn";

import { callApi } from "./api";
import { CommentForm } from "./comment-form";
import { ErrorNotice } from "./error-notice";
import { useStaffName } from "./use-staff-name";
import { VerdictBadge } from "./verdict-badge";
import type { ApiError } from "./view";

interface VerdictCardProps {
  candidate: Candidate;
  checkId: string;
  draftText: string;
  onBehalfOf?: OnBehalfOf;
  quote: string;
}

const detailHref = (id: string) => `/requests/${encodeURIComponent(id)}`;

const SameNeedActions = ({
  candidate,
  checkId,
  draftText,
  onBehalfOf,
  quote,
}: VerdictCardProps) => {
  const router = useRouter();
  const [staffName] = useStaffName();
  const [commenting, setCommenting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const support = async () => {
    if (!staffName.trim() || !onBehalfOf) {
      setError({
        code: "invalid_input",
        message: "A Support needs your name and the Account it is on behalf of.",
        resolution: "Fill in Your name and On behalf of, then choose Support this.",
      });
      return;
    }
    setPending(true);
    setError(null);
    const result = await callApi<{ support: SupportView }>(
      `/api/feature-requests/${encodeURIComponent(candidate.featureRequestId)}/supports`,
      {
        body: {
          actor: { name: staffName.trim(), type: "staff" },
          checkId,
          onBehalfOf,
          quote: quote.trim() || undefined,
        },
        method: "POST",
      },
    );
    setPending(false);
    if (result.ok || result.error.code === "already_supported") {
      router.push(detailHref(candidate.featureRequestId));
      return;
    }
    setError(result.error);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={support} size="lg">
          {pending ? "Adding Support…" : "Support this"}
        </Button>
        <Button
          aria-expanded={commenting}
          onClick={() => setCommenting((open) => !open)}
          size="lg"
          variant="outline"
        >
          Comment
        </Button>
      </div>
      <ErrorNotice error={error} />
      {commenting ? (
        <CommentForm
          checkId={checkId}
          featureRequestId={candidate.featureRequestId}
          initialBody={draftText}
          onBehalfOf={onBehalfOf}
          onDone={() => router.push(detailHref(candidate.featureRequestId))}
        />
      ) : null}
    </div>
  );
};

/** One Verdict on an existing Feature Request, with its Reason and next action. */
export const VerdictCard = (props: VerdictCardProps) => {
  const { candidate } = props;
  const isSame = candidate.verdict === "same_need";
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4",
        isSame
          ? "border-emerald-600/60 bg-emerald-50 ring-2 ring-emerald-600/30 dark:border-emerald-500/50 dark:bg-emerald-950/40"
          : "bg-card",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <VerdictBadge verdict={candidate.verdict} />
        {candidate.sharedDimension ? (
          <span className="text-muted-foreground text-xs">
            Shared Dimension:{" "}
            <span className="text-foreground font-medium">{candidate.sharedDimension}</span>
          </span>
        ) : null}
      </div>
      <h3 className={cn("font-semibold text-balance", isSame ? "text-lg" : "text-base")}>
        <Link
          className="underline-offset-4 hover:underline"
          href={detailHref(candidate.featureRequestId)}
        >
          {candidate.title}
        </Link>
      </h3>
      {candidate.reason ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Reason: </span>
          {candidate.reason}
        </p>
      ) : null}
      {isSame ? <SameNeedActions {...props} /> : null}
    </article>
  );
};
