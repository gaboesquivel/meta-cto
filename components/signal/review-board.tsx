"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/button";
import type {
  ReviewDecision,
  ReviewMetrics,
  ReviewQueue,
  ScanResult,
} from "@/lib/signal/contracts";

import { callApi } from "./api";
import { ErrorNotice } from "./error-notice";
import { OperatorSignIn } from "./operator-sign-in";
import { BlindReviewItem } from "./review-blind-item";
import { DecisionLine, ReviewItem } from "./review-item";
import type { ReviewActions } from "./review-item";
import { ReviewMetricsPanel } from "./review-metrics";
import { describeDecision } from "./review-view";
import type { DecisionBody } from "./review-view";
import { TextField } from "./text-field";
import { useStaffName } from "./use-staff-name";
import type { ApiError } from "./view";

const QUEUE_KEY = ["signal", "review-queue"] as const;
const METRICS_KEY = ["signal", "metrics"] as const;
const SCAN_LIMIT = 25;

class ApiFailureError extends Error {
  readonly apiError: ApiError;
  constructor(apiError: ApiError) {
    super(apiError.message);
    this.name = "ApiFailureError";
    this.apiError = apiError;
  }
}

const fetchJson = async <T,>(path: string): Promise<T> => {
  const result = await callApi<T>(path);
  if (!result.ok) throw new ApiFailureError(result.error);
  return result.data;
};

const apiErrorOf = (error: unknown): ApiError | null =>
  error instanceof ApiFailureError ? error.apiError : null;

const ScanPanel = ({ onScanned }: { onScanned: () => void }) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  const scan = async () => {
    setPending(true);
    setError(null);
    const response = await callApi<ScanResult>("/api/review/scan", {
      body: { limit: SCAN_LIMIT },
      method: "POST",
    });
    setPending(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    setResult(response.data);
    onScanned();
  };

  return (
    <div className="bg-muted/40 flex flex-col gap-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={pending} onClick={scan} variant="outline">
          {pending ? "Scanning…" : result && result.remaining > 0 ? "Scan more" : "Scan backlog"}
        </Button>
        <span className="text-muted-foreground text-xs">
          Operator only. Judges up to {SCAN_LIMIT} unscanned backlog Feature Requests with the AI,
          which spends model tokens; results vary between runs.
        </span>
      </div>
      {result ? (
        <output className="text-sm">
          Scanned {result.scanned} · {result.pairsFound} new Suspected{" "}
          {result.pairsFound === 1 ? "Duplicate" : "Duplicates"} · {result.remaining} left to scan
        </output>
      ) : null}
      <ErrorNotice error={error} />
    </div>
  );
};

/** /review: headline metrics, the Review Queue, and recent Review Decisions with Undo. */
export const ReviewBoard = ({ operator }: { operator: boolean }) => {
  const queryClient = useQueryClient();
  const [actorName, setActorName] = useStaffName();
  const [recent, setRecent] = useState<ReviewDecision[]>([]);
  const [titles, setTitles] = useState<Map<string, string>>(() => new Map());

  const queue = useQuery({
    queryFn: () => fetchJson<ReviewQueue>("/api/review/queue"),
    queryKey: QUEUE_KEY,
    retry: 1,
  });
  const metrics = useQuery({
    queryFn: () => fetchJson<ReviewMetrics>("/api/metrics"),
    queryKey: METRICS_KEY,
    retry: 1,
  });

  const queueTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of queue.data?.items ?? []) {
      map.set(item.featureRequest.id, item.featureRequest.title);
      for (const suspicion of item.suspicions) map.set(suspicion.other.id, suspicion.other.title);
    }
    for (const choice of queue.data?.blindChoices ?? []) map.set(choice.id, choice.title);
    return map;
  }, [queue.data]);

  const allTitles = useMemo(() => new Map([...titles, ...queueTitles]), [titles, queueTitles]);
  const describe = useCallback(
    (decision: ReviewDecision) => describeDecision(decision, allTitles),
    [allTitles],
  );

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: QUEUE_KEY }),
      queryClient.invalidateQueries({ queryKey: METRICS_KEY }),
    ]);
  }, [queryClient]);

  const remember = useCallback((decision: ReviewDecision) => {
    setRecent((current) => [decision, ...current.filter((item) => item.id !== decision.id)]);
  }, []);

  const decide = useCallback(
    async (body: DecisionBody): Promise<ApiError | null> => {
      // Keep the titles: a decided item may leave the queue, but its line stays readable.
      setTitles((current) => new Map([...current, ...queueTitles]));
      const response = await callApi<{ decision: ReviewDecision }>("/api/review/decisions", {
        body,
        method: "POST",
      });
      if (!response.ok) return response.error;
      remember(response.data.decision);
      await refresh();
      return null;
    },
    [queueTitles, refresh, remember],
  );

  const undo = useCallback(
    async (decision: ReviewDecision): Promise<ApiError | null> => {
      const response = await callApi<{ decision: ReviewDecision }>(
        `/api/review/decisions/${encodeURIComponent(decision.id)}/undo`,
        { body: { actor: { name: actorName.trim(), type: "staff" } }, method: "POST" },
      );
      if (!response.ok) return response.error;
      remember(response.data.decision);
      await refresh();
      return null;
    },
    [actorName, refresh, remember],
  );

  const actions: ReviewActions = { actorName, decide, operator, undo };
  const items = queue.data?.items ?? [];
  const queueError = apiErrorOf(queue.error);
  const metricsError = apiErrorOf(metrics.error);

  return (
    <div className="flex flex-col gap-8">
      <ReviewMetricsPanel loading={metrics.isPending} metrics={metrics.data ?? null} />
      <ErrorNotice error={metricsError} />

      <section aria-labelledby="queue-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight" id="queue-heading">
            Review Queue
          </h2>
          <p className="text-muted-foreground text-sm">
            {queue.data
              ? `${queue.data.counts.new} new and ${queue.data.counts.backlog} backlog Feature Requests need a Review Decision.`
              : "New Feature Requests not yet reviewed, and backlog ones with an undecided Suspected Duplicate."}
          </p>
        </div>
        {operator ? (
          <div className="flex flex-col gap-3">
            <TextField
              hint="Recorded on each Review Decision and Undo. Remembered on this device."
              id="review-actor-name"
              label="Your name"
              maxLength={80}
              onChange={setActorName}
              placeholder="e.g. Priya, Product Manager"
              required
              value={actorName}
            />
            <ScanPanel onScanned={refresh} />
          </div>
        ) : (
          <OperatorSignIn />
        )}
        <ErrorNotice error={queueError} />
        {queue.isPending ? (
          <p className="text-muted-foreground text-sm">Loading the Review Queue…</p>
        ) : null}
        {queue.data && items.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-5 text-sm">
            Nothing to review.{" "}
            {operator ? "Scan the backlog to look for Suspected Duplicates." : ""}
          </p>
        ) : null}
        <div className="flex flex-col gap-4">
          {items.map((item) =>
            item.blind ? (
              <BlindReviewItem
                actions={actions}
                choices={queue.data?.blindChoices ?? []}
                item={item}
                key={item.featureRequest.id}
              />
            ) : (
              <ReviewItem
                actions={actions}
                describe={describe}
                item={item}
                key={item.featureRequest.id}
              />
            ),
          )}
        </div>
      </section>

      {recent.length > 0 ? (
        <section aria-labelledby="recent-heading" className="flex flex-col gap-3">
          <h2 className="text-base font-semibold" id="recent-heading">
            Your recent Review Decisions
          </h2>
          <ul className="flex flex-col gap-3">
            {recent.map((decision) => (
              <li className="rounded-xl border p-3" key={decision.id}>
                <DecisionLine actions={actions} decision={decision} text={describe(decision)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
};
