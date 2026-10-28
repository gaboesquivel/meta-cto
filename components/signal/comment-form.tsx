"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/button";
import type { CommentView, OnBehalfOf } from "@/lib/signal/contracts";

import { callApi } from "./api";
import { ErrorNotice } from "./error-notice";
import { TextField } from "./text-field";
import { useStaffName } from "./use-staff-name";
import type { ApiError } from "./view";

interface CommentFormProps {
  featureRequestId: string;
  initialBody?: string;
  onBehalfOf?: OnBehalfOf;
  /** Called after the Comment is added; defaults to refreshing the page. */
  onDone?: (comment: CommentView) => void;
}

/** Adds a Comment to a Feature Request as the Staff Actor. */
export const CommentForm = ({
  featureRequestId,
  initialBody = "",
  onBehalfOf,
  onDone,
}: CommentFormProps) => {
  const router = useRouter();
  const [staffName] = useStaffName();
  const [body, setBody] = useState(initialBody);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!staffName.trim()) {
      setError({
        code: "invalid_input",
        message: "Your name is required.",
        resolution: "Add your name above, then Comment.",
      });
      return;
    }
    setPending(true);
    setError(null);
    const result = await callApi<{ comment: CommentView }>(
      `/api/feature-requests/${encodeURIComponent(featureRequestId)}/comments`,
      {
        body: { actor: { name: staffName.trim(), type: "staff" }, body, onBehalfOf },
        method: "POST",
      },
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBody("");
    if (onDone) onDone(result.data.comment);
    else router.refresh();
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <TextField
        id={`comment-${featureRequestId}`}
        label="Comment"
        maxLength={2000}
        multiline
        onChange={setBody}
        placeholder="Add context, a workaround, or the customer's words."
        required
        value={body}
      />
      <ErrorNotice error={error} />
      <Button
        className="self-start"
        disabled={pending || !body.trim()}
        type="submit"
        variant="outline"
      >
        {pending ? "Adding Comment…" : "Add Comment"}
      </Button>
    </form>
  );
};
