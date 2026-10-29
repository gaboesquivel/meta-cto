"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/button";
import type { SupportView } from "@/lib/signal/contracts";

import { callApi } from "./api";
import { ErrorNotice } from "./error-notice";
import { TextField } from "./text-field";
import { useStaffName } from "./use-staff-name";
import type { ApiError } from "./view";
import { buildOnBehalfOf } from "./view";

/** Adds a Support from an Account to a Feature Request. */
export const SupportForm = ({ featureRequestId }: { featureRequestId: string }) => {
  const router = useRouter();
  const [staffName] = useStaffName();
  const [accountName, setAccountName] = useState("");
  const [size, setSize] = useState("");
  const [segment, setSegment] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [quote, setQuote] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    const onBehalfOf = buildOnBehalfOf({ accountName, requesterName, segment, size });
    if (!staffName.trim() || !onBehalfOf) {
      setError({
        code: "invalid_input",
        message: "Your name and an Account are required.",
        resolution: "Fill in Your name and the Account name, then Support.",
      });
      return;
    }
    setPending(true);
    setError(null);
    const result = await callApi<{ support: SupportView }>(
      `/api/feature-requests/${encodeURIComponent(featureRequestId)}/supports`,
      {
        body: {
          actor: { name: staffName.trim(), type: "staff" },
          onBehalfOf,
          quote: quote.trim() || undefined,
        },
        method: "POST",
      },
    );
    setPending(false);
    if (!result.ok) {
      if (result.error.code === "already_supported") {
        setNotice(`${onBehalfOf.account.name} already supports this Feature Request.`);
      } else {
        setError(result.error);
      }
      return;
    }
    setAccountName("");
    setSize("");
    setSegment("");
    setRequesterName("");
    setQuote("");
    setNotice(`Support from ${result.data.support.account.name} added.`);
    router.refresh();
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          id="support-account"
          label="Account"
          maxLength={120}
          onChange={setAccountName}
          placeholder="Cedar Market"
          required
          value={accountName}
        />
        <TextField
          id="support-requester"
          label="Requester"
          maxLength={80}
          onChange={setRequesterName}
          placeholder="Who asked"
          value={requesterName}
        />
        <TextField
          id="support-size"
          label="Size"
          maxLength={40}
          onChange={setSize}
          placeholder="24 stores"
          value={size}
        />
        <TextField
          id="support-segment"
          label="Segment"
          maxLength={40}
          onChange={setSegment}
          placeholder="retail"
          value={segment}
        />
      </div>
      <TextField
        id="support-quote"
        label="Customer's words"
        maxLength={500}
        multiline
        onChange={setQuote}
        placeholder="What the customer said, in their words."
        value={quote}
      />
      <ErrorNotice error={error} />
      {notice ? <output className="block text-sm">{notice}</output> : null}
      <Button className="self-start" disabled={pending} type="submit">
        {pending ? "Adding Support…" : "Support"}
      </Button>
    </form>
  );
};
