"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/button";
import type { CheckResult, FeatureRequestDetail, OnBehalfOf } from "@/lib/signal/contracts";
import { MAX_DESCRIPTION, MAX_TITLE } from "@/lib/signal/contracts";

import { callApi } from "./api";
import { ErrorNotice } from "./error-notice";
import { StaffNameField } from "./staff-name-field";
import { TextField } from "./text-field";
import { useStaffName } from "./use-staff-name";
import { VerdictCard } from "./verdict-card";
import type { ApiError } from "./view";
import { buildOnBehalfOf, isSkipReasonRequired, splitCandidates } from "./view";

interface CheckOutcomeProps {
  draftText: string;
  onBehalfOf?: OnBehalfOf;
  quote: string;
  result: CheckResult;
}

const CheckOutcome = ({ draftText, onBehalfOf, quote, result }: CheckOutcomeProps) => {
  const { related, same, unknown } = splitCandidates(result);
  const cardProps = { checkId: result.checkId, draftText, onBehalfOf, quote };
  return (
    <section aria-labelledby="check-heading" className="flex flex-col gap-4">
      <h2 className="sr-only" id="check-heading">
        Check
      </h2>
      <div className="bg-foreground text-background rounded-2xl p-5">
        <p className="text-xs font-semibold tracking-widest uppercase opacity-70">
          Underlying Need
        </p>
        <p className="mt-2 text-xl leading-snug font-semibold text-balance sm:text-2xl">
          {result.underlyingNeed ?? "Signal could not state the Underlying Need for this Draft."}
        </p>
        <p className="mt-3 text-xs opacity-70">
          Compared with {result.consideredCount} existing Feature Requests.
        </p>
      </div>
      {result.degraded ? (
        <output className="block rounded-xl border border-amber-500/50 bg-amber-50 p-4 text-sm dark:bg-amber-950/40">
          <span className="block font-semibold">Verdicts are unavailable right now.</span>
          <span className="text-muted-foreground mt-1 block">
            The model step failed, so these candidates have no Verdict. Read them before you create.
          </span>
        </output>
      ) : null}
      {same.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">This need already exists. Support it instead.</h3>
          {same.map((candidate) => (
            <VerdictCard candidate={candidate} key={candidate.featureRequestId} {...cardProps} />
          ))}
        </div>
      ) : null}
      {related.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">
            Related Needs, kept distinct and linked on create
          </h3>
          {related.map((candidate) => (
            <VerdictCard candidate={candidate} key={candidate.featureRequestId} {...cardProps} />
          ))}
        </div>
      ) : null}
      {unknown.map((candidate) => (
        <VerdictCard candidate={candidate} key={candidate.featureRequestId} {...cardProps} />
      ))}
      {result.candidates.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No existing Feature Request has the Same Need or a Related Need. File it.
        </p>
      ) : null}
    </section>
  );
};

interface CreatePanelProps {
  error: ApiError | null;
  onCreate: () => void;
  onSkipReasonChange: (value: string) => void;
  pending: boolean;
  result: CheckResult;
  skipReason: string;
}

const CreatePanel = ({
  error,
  onCreate,
  onSkipReasonChange,
  pending,
  result,
  skipReason,
}: CreatePanelProps) => {
  const needsSkipReason = isSkipReasonRequired(result);
  const hasRelated = result.candidates.some((candidate) => candidate.verdict === "related_need");
  const blocked = needsSkipReason && skipReason.trim().length < 3;
  let label = "Create Feature Request";
  if (pending) label = "Creating…";
  else if (needsSkipReason) label = "Create anyway";
  return (
    <section className="flex flex-col gap-3 border-t pt-5" aria-labelledby="create-heading">
      <h2 className="text-base font-semibold" id="create-heading">
        Create
      </h2>
      {needsSkipReason ? (
        <TextField
          hint="Required: say why the Same Need suggestion does not fit this customer."
          id="skip-reason"
          label="Skip Reason"
          maxLength={500}
          multiline
          onChange={onSkipReasonChange}
          required
          value={skipReason}
        />
      ) : null}
      {hasRelated ? (
        <p className="text-muted-foreground text-sm">
          The new Feature Request gets a Related Link to each Related Need above.
        </p>
      ) : null}
      <ErrorNotice error={error} />
      <Button
        className="self-start"
        disabled={pending || blocked}
        onClick={onCreate}
        size="lg"
        variant={needsSkipReason ? "outline" : "default"}
      >
        {label}
      </Button>
    </section>
  );
};

/** Draft → Check → Verdicts → Support, Comment or Create. */
export const CheckFlow = () => {
  const router = useRouter();
  const [staffName] = useStaffName();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [accountName, setAccountName] = useState("");
  const [size, setSize] = useState("");
  const [segment, setSegment] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checkError, setCheckError] = useState<ApiError | null>(null);
  const [checking, setChecking] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [createError, setCreateError] = useState<ApiError | null>(null);
  const [creating, setCreating] = useState(false);

  const onBehalfOf = buildOnBehalfOf({ accountName, requesterName, segment, size });
  const draft = { description: description.trim(), title: title.trim() };
  const actor = { name: staffName.trim(), type: "staff" as const };

  const editDraft = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setResult(null);
    setCreateError(null);
  };

  const check = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!actor.name) {
      setCheckError({
        code: "invalid_input",
        message: "Your name is required.",
        resolution: "Add your name, then Check.",
      });
      return;
    }
    setChecking(true);
    setCheckError(null);
    setCreateError(null);
    setSkipReason("");
    const response = await callApi<CheckResult>("/api/checks", {
      body: { actor, draft, onBehalfOf },
      method: "POST",
    });
    setChecking(false);
    if (response.ok) setResult(response.data);
    else {
      setResult(null);
      setCheckError(response.error);
    }
  };

  const create = async () => {
    if (!result) return;
    setCreating(true);
    setCreateError(null);
    const response = await callApi<{ featureRequest: FeatureRequestDetail }>(
      "/api/feature-requests",
      {
        body: {
          actor,
          checkId: result.checkId,
          draft,
          onBehalfOf,
          skipReason: isSkipReasonRequired(result) ? skipReason.trim() : undefined,
        },
        method: "POST",
      },
    );
    setCreating(false);
    if (response.ok) {
      router.push(`/requests/${encodeURIComponent(response.data.featureRequest.id)}`);
      return;
    }
    setCreateError(response.error);
  };

  return (
    <div className="flex flex-col gap-8">
      <form className="flex flex-col gap-6" onSubmit={check}>
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-base font-semibold">Draft</legend>
          <TextField
            id="draft-title"
            label="Title"
            maxLength={MAX_TITLE}
            onChange={editDraft(setTitle)}
            placeholder="Traded shifts sometimes don't show on my schedule"
            required
            value={title}
          />
          <TextField
            id="draft-description"
            label="Description"
            maxLength={MAX_DESCRIPTION}
            multiline
            onChange={editDraft(setDescription)}
            placeholder="What the customer is trying to do and what gets in the way, in their words."
            required
            value={description}
          />
        </fieldset>
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-base font-semibold">On behalf of</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id="account-name"
              label="Account"
              maxLength={120}
              onChange={setAccountName}
              placeholder="Cedar Market"
              value={accountName}
            />
            <TextField
              id="requester-name"
              label="Requester"
              maxLength={80}
              onChange={setRequesterName}
              placeholder="Who asked"
              value={requesterName}
            />
            <TextField
              id="account-size"
              label="Size"
              maxLength={40}
              onChange={setSize}
              placeholder="24 stores"
              value={size}
            />
            <TextField
              id="account-segment"
              label="Segment"
              maxLength={40}
              onChange={setSegment}
              placeholder="retail"
              value={segment}
            />
          </div>
        </fieldset>
        <StaffNameField id="staff-name" />
        <ErrorNotice error={checkError} />
        <Button
          className="self-start"
          disabled={checking || draft.title.length < 3 || !draft.description}
          size="lg"
          type="submit"
        >
          {checking ? "Checking…" : "Check"}
        </Button>
      </form>
      {result ? (
        <>
          <CheckOutcome
            draftText={`${draft.title}\n\n${draft.description}`}
            onBehalfOf={onBehalfOf}
            quote={draft.description}
            result={result}
          />
          <CreatePanel
            error={createError}
            onCreate={create}
            onSkipReasonChange={setSkipReason}
            pending={creating}
            result={result}
            skipReason={skipReason}
          />
        </>
      ) : null}
    </div>
  );
};
