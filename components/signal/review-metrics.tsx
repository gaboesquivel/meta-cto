import { cn } from "cn";

import type { ReviewMetrics } from "@/lib/signal/contracts";

import { metricCards } from "./review-view";
import type { MetricCard } from "./review-view";

const Card = ({ card }: { card: MetricCard }) => {
  const isMain = card.key === "intakeDuplicateRate";
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border p-4",
        isMain ? "bg-foreground text-background sm:col-span-2" : "bg-card",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-semibold tracking-widest uppercase opacity-80">{card.label}</h3>
        {isMain ? (
          <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-emerald-950 uppercase">
            Main metric
          </span>
        ) : null}
        {card.aiSuspected ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-semibold tracking-wide text-amber-900 uppercase dark:bg-amber-950 dark:text-amber-200">
            AI-suspected
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div className="flex flex-col">
          <span className={cn("font-semibold tabular-nums", isMain ? "text-4xl" : "text-3xl")}>
            {card.value}
          </span>
          <span className={cn("text-xs", isMain ? "opacity-70" : "text-muted-foreground")}>
            {card.counts}
          </span>
        </div>
        {card.comparison ? (
          <div className="flex flex-col border-l border-current/20 pl-4">
            <span className="text-xs font-semibold tracking-wide uppercase opacity-70">
              {card.comparison.label}
            </span>
            <span className="text-2xl font-semibold tabular-nums">{card.comparison.value}</span>
            <span className="text-xs opacity-70">
              {card.comparison.counts} pre-Signal Feature Requests
            </span>
          </div>
        ) : null}
      </div>
      <p className={cn("text-xs", isMain ? "opacity-70" : "text-muted-foreground")}>
        {card.description}
      </p>
    </div>
  );
};

/** Headline review metrics with their counts; "—" when there is nothing to measure yet. */
export const ReviewMetricsPanel = ({
  loading,
  metrics,
}: {
  loading: boolean;
  metrics: ReviewMetrics | null;
}) => (
  <section aria-labelledby="metrics-heading" aria-busy={loading} className="flex flex-col gap-3">
    <h2 className="sr-only" id="metrics-heading">
      Metrics
    </h2>
    <div className="grid gap-3 sm:grid-cols-2">
      {metricCards(metrics).map((card) => (
        <Card card={card} key={card.key} />
      ))}
    </div>
    <p className="text-muted-foreground text-sm">
      Only a Product Manager&apos;s Review Decision confirms a Duplicate. The AI&apos;s Suspected
      Duplicates are prompts for review and never count as duplication.
      {metrics
        ? ` Checks and new requests count ${metrics.origin} activity only; the backlog baseline reads this Workspace's backlog.`
        : null}
    </p>
  </section>
);
