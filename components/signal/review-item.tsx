"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/button";
import type {
  FeatureRequestRef,
  FeatureRequestSummary,
  ReviewDecision,
  ReviewDecisionKind,
  ReviewQueueItem,
  ReviewSuspicionView,
} from "@/lib/signal/contracts";
import { MAX_SHARED_DIMENSION } from "@/lib/signal/contracts";
import { cn } from "cn";

import { ErrorNotice } from "./error-notice";
import { OperatorSignIn } from "./operator-sign-in";
import { buildDecisionBody, DECISION_LABELS, reviewActionState } from "./review-view";
import type { CanonicalSide, DecisionBody } from "./review-view";
import { TextField } from "./text-field";
import type { ApiError } from "./view";

export interface ReviewActions {
  actorName: string;
  decide: (body: DecisionBody) => Promise<ApiError | null>;
  operator: boolean;
  undo: (decision: ReviewDecision) => Promise<ApiError | null>;
}

const detailHref = (id: string) => `/requests/${encodeURIComponent(id)}`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export const OriginBadge = ({ isNew }: { isNew: boolean }) => (
  <span
    className={cn(
      "inline-flex h-5 w-fit items-center rounded-full px-2 text-[0.65rem] font-semibold tracking-wide uppercase",
      isNew
        ? "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200"
        : "bg-muted text-muted-foreground",
    )}
  >
    {isNew ? "New" : "Backlog"}
  </span>
);

const RequestPanel = ({
  label,
  request,
}: {
  label: React.ReactNode;
  request: FeatureRequestSummary;
}) => (
  <div className="bg-card flex min-w-0 flex-col gap-2 rounded-xl border p-3">
    <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">{label}</div>
    <Link
      className="font-semibold text-balance underline-offset-4 hover:underline"
      href={detailHref(request.id)}
    >
      {request.title}
    </Link>
    {request.underlyingNeed ? (
      <p className="text-sm">
        <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
          Underlying Need{" "}
        </span>
        {request.underlyingNeed}
      </p>
    ) : (
      <p className="text-muted-foreground line-clamp-3 text-sm">{request.description}</p>
    )}
    <p className="text-muted-foreground mt-auto text-xs">
      {plural(request.accountCount, "Account")} · {plural(request.supportCount, "Support")}
    </p>
  </div>
);

/** Explains why actions are off: sign-in link, missing name, or nothing. */
export const ActionGate = ({
  actions,
  children,
}: {
  actions: ReviewActions;
  children: React.ReactNode;
}) => {
  const state = reviewActionState({
    actorName: actions.actorName,
    operator: actions.operator,
    pending: false,
  });
  if (state.reason === "sign_in") return <OperatorSignIn compact />;
  if (state.reason === "name") {
    return (
      <p className="text-muted-foreground text-sm">
        Add your name at the top of the Review Queue to record a Review Decision.
      </p>
    );
  }
  return children;
};

type Mode = "duplicate" | "related" | null;

/** One side of a pair; Blind Review choices carry only id and title. */
export type PairSide = FeatureRequestRef &
  Partial<Pick<FeatureRequestSummary, "accountCount" | "supportCount">>;

const sideCounts = (side: PairSide) =>
  side.accountCount === undefined || side.supportCount === undefined
    ? null
    : `${plural(side.accountCount, "Account")} · ${plural(side.supportCount, "Support")}`;

/** Duplicate, Related and Distinct on a pair; `suggestionId` when it answers a Suspected Duplicate. */
export const PairActions = ({
  actions,
  formKey,
  other,
  self,
  suggestionId,
}: {
  actions: ReviewActions;
  formKey: string;
  other: PairSide;
  self: PairSide;
  suggestionId?: string;
}) => {
  const [mode, setMode] = useState<Mode>(null);
  const [canonical, setCanonical] = useState<CanonicalSide | null>(null);
  const [sharedDimension, setSharedDimension] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = async (decision: ReviewDecisionKind) => {
    const built = buildDecisionBody({
      actorName: actions.actorName,
      canonical: canonical ?? undefined,
      decision,
      featureRequestId: self.id,
      otherId: other.id,
      sharedDimension,
      suggestionId,
    });
    if (!built.ok) {
      setError({ code: "invalid_decision", message: built.message, resolution: null });
      return;
    }
    setPending(true);
    setError(null);
    const failure = await actions.decide(built.body);
    setPending(false);
    if (failure) setError(failure);
    else setMode(null);
  };

  const toggle = (next: Mode) => {
    setError(null);
    setMode((current) => (current === next ? null : next));
  };

  const canonicalOptions: { side: CanonicalSide; request: PairSide }[] = [
    { request: self, side: "this" },
    { request: other, side: "other" },
  ];

  return (
    <ActionGate actions={actions}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            aria-expanded={mode === "duplicate"}
            disabled={pending}
            onClick={() => toggle("duplicate")}
          >
            Mark Duplicate
          </Button>
          <Button
            aria-expanded={mode === "related"}
            disabled={pending}
            onClick={() => toggle("related")}
            variant="outline"
          >
            Related
          </Button>
          <Button disabled={pending} onClick={() => submit("distinct")} variant="outline">
            {pending && mode === null ? "Saving…" : "Distinct"}
          </Button>
        </div>
        {mode === "duplicate" ? (
          <fieldset className="bg-muted/40 flex flex-col gap-2 rounded-xl border p-3">
            <legend className="px-1 text-sm font-semibold">Which one is canonical?</legend>
            <p className="text-muted-foreground text-xs">
              The other becomes its Duplicate. No evidence moves: the canonical Feature Request
              shows both sets of Supports and Comments, and Undo ends the association.
            </p>
            {canonicalOptions.map((option) => (
              <label
                className="has-checked:border-foreground flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm"
                key={option.side}
              >
                <input
                  checked={canonical === option.side}
                  className="mt-1"
                  name={`canonical-${formKey}`}
                  onChange={() => setCanonical(option.side)}
                  type="radio"
                  value={option.side}
                />
                <span>
                  <span className="font-medium">{option.request.title}</span>
                  {sideCounts(option.request) ? (
                    <span className="text-muted-foreground block text-xs">
                      {sideCounts(option.request)}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
            <Button
              className="self-start"
              disabled={pending || canonical === null}
              onClick={() => submit("duplicate")}
            >
              {pending ? "Saving…" : "Confirm Duplicate"}
            </Button>
          </fieldset>
        ) : null}
        {mode === "related" ? (
          <div className="bg-muted/40 flex flex-col gap-2 rounded-xl border p-3">
            <TextField
              hint="The part of the need both Feature Requests share. They stay distinct and get a Related Link."
              id={`shared-dimension-${formKey}`}
              label="Shared Dimension"
              maxLength={MAX_SHARED_DIMENSION}
              onChange={setSharedDimension}
              placeholder="e.g. shift-change governance"
              required
              value={sharedDimension}
            />
            <Button
              className="self-start"
              disabled={pending || !sharedDimension.trim()}
              onClick={() => submit("related")}
            >
              {pending ? "Saving…" : "Confirm Related"}
            </Button>
          </div>
        ) : null}
        <ErrorNotice error={error} />
      </div>
    </ActionGate>
  );
};

/** An active decision on a pair, with Undo. */
export const DecisionLine = ({
  actions,
  decision,
  text,
}: {
  actions: ReviewActions;
  decision: ReviewDecision;
  text: string;
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const undone = decision.undoneAt !== null;
  const canUndo = !undone && actions.operator && actions.actorName.trim().length > 0;

  const undo = async () => {
    setPending(true);
    setError(null);
    const failure = await actions.undo(decision);
    setPending(false);
    if (failure) setError(failure);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className={cn(
            "inline-flex h-5 items-center rounded-full px-2 text-[0.65rem] font-semibold tracking-wide uppercase",
            undone
              ? "bg-muted text-muted-foreground line-through"
              : "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950",
          )}
        >
          {DECISION_LABELS[decision.decision]}
        </span>
        {decision.blind ? (
          <span className="bg-muted text-muted-foreground inline-flex h-5 items-center rounded-full px-2 text-[0.65rem] font-semibold tracking-wide uppercase">
            Blind
          </span>
        ) : null}
        <span className={cn("text-sm", undone && "text-muted-foreground")}>{text}</span>
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
        <span>
          {decision.actor.name} · {new Date(decision.createdAt).toLocaleString("en-US")}
          {undone && decision.undoneAt
            ? ` · Undone${decision.undoneBy ? ` by ${decision.undoneBy.name}` : ""} ${new Date(decision.undoneAt).toLocaleString("en-US")}`
            : ""}
        </span>
        {canUndo ? (
          <Button disabled={pending} onClick={undo} size="xs" variant="outline">
            {pending ? "Undoing…" : "Undo"}
          </Button>
        ) : null}
      </div>
      <ErrorNotice error={error} />
    </div>
  );
};

const SuspicionPair = ({
  actions,
  describe,
  item,
  suspicion,
}: {
  actions: ReviewActions;
  describe: (decision: ReviewDecision) => string;
  item: ReviewQueueItem;
  suspicion: ReviewSuspicionView;
}) => (
  <li className="flex flex-col gap-3 border-t pt-4 first:border-t-0 first:pt-0">
    <div className="grid gap-3 sm:grid-cols-2">
      <RequestPanel
        label={
          <>
            <span className="font-semibold tracking-wide uppercase">This Feature Request</span>
            <OriginBadge isNew={item.isNew} />
          </>
        }
        request={item.featureRequest}
      />
      <RequestPanel
        label={<span className="font-semibold tracking-wide uppercase">Suspected Duplicate</span>}
        request={suspicion.other}
      />
    </div>
    <div className="rounded-xl border border-amber-500/40 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
      <p className="text-xs font-semibold tracking-wide text-amber-900 uppercase dark:text-amber-200">
        AI Reason · suspected Same Need
      </p>
      <p className="mt-1">{suspicion.reason}</p>
      <p className="text-muted-foreground mt-1 text-xs">
        {suspicion.source === "check" ? "From the Check at create" : "From a backlog scan"}
        {suspicion.model ? ` · ${suspicion.model}` : ""}. The AI suggests; you decide.
      </p>
    </div>
    {suspicion.decision ? (
      <DecisionLine
        actions={actions}
        decision={suspicion.decision}
        text={describe(suspicion.decision)}
      />
    ) : (
      <PairActions
        actions={actions}
        formKey={suspicion.suggestionId}
        other={suspicion.other}
        self={item.featureRequest}
        suggestionId={suspicion.suggestionId}
      />
    )}
  </li>
);

export const NoDuplicatesAction = ({
  actions,
  item,
}: {
  actions: ReviewActions;
  item: ReviewQueueItem;
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const confirm = async () => {
    const built = buildDecisionBody({
      actorName: actions.actorName,
      decision: "none",
      featureRequestId: item.featureRequest.id,
    });
    if (!built.ok) {
      setError({ code: "invalid_decision", message: built.message, resolution: null });
      return;
    }
    setPending(true);
    setError(null);
    const failure = await actions.decide(built.body);
    setPending(false);
    if (failure) setError(failure);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        {item.blind
          ? "Or, if no Feature Request matches it, confirm this one has no duplicates."
          : "The AI suspects no duplicate for this new Feature Request. Confirm it to count it as reviewed."}
      </p>
      <ActionGate actions={actions}>
        <Button className="self-start" disabled={pending} onClick={confirm} variant="outline">
          {pending ? "Saving…" : "No duplicates"}
        </Button>
      </ActionGate>
      <ErrorNotice error={error} />
    </div>
  );
};

/** One Review Queue item: the Feature Request and each Suspected Duplicate side by side. */
export const ReviewItem = ({
  actions,
  describe,
  item,
}: {
  actions: ReviewActions;
  describe: (decision: ReviewDecision) => string;
  item: ReviewQueueItem;
}) => (
  <article className="flex flex-col gap-4 rounded-2xl border p-4 sm:p-5">
    <header className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <OriginBadge isNew={item.isNew} />
        <span className="text-muted-foreground text-xs">
          {item.suspicions.length === 0
            ? "No Suspected Duplicates"
            : plural(item.suspicions.length, "Suspected Duplicate")}
        </span>
      </div>
      <h3 className="text-lg font-semibold text-balance">
        <Link
          className="underline-offset-4 hover:underline"
          href={detailHref(item.featureRequest.id)}
        >
          {item.featureRequest.title}
        </Link>
      </h3>
    </header>
    {item.suspicions.length === 0 ? (
      item.isNew ? (
        <NoDuplicatesAction actions={actions} item={item} />
      ) : null
    ) : (
      <ul className="flex flex-col gap-4">
        {item.suspicions.map((suspicion) => (
          <SuspicionPair
            actions={actions}
            describe={describe}
            item={item}
            key={suspicion.suggestionId}
            suspicion={suspicion}
          />
        ))}
      </ul>
    )}
  </article>
);
