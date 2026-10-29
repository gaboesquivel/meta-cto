"use client";

import { useState } from "react";

import type { FeatureRequestRef, ReviewQueueItem } from "@/lib/signal/contracts";

import { NoDuplicatesAction, OriginBadge, PairActions } from "./review-item";
import type { ReviewActions } from "./review-item";
import { filterBlindChoices } from "./review-view";
import { TextField } from "./text-field";

/**
 * A Review Queue item under Blind Review (spec 003): no AI suggestion, Reason or Underlying Need,
 * and no link to the detail page (which shows them). The Product Manager reads the request, finds
 * the other Feature Request by title (an unranked list), then decides as usual; the decision is
 * recorded as blind.
 */
export const BlindReviewItem = ({
  actions,
  choices,
  item,
}: {
  actions: ReviewActions;
  choices: FeatureRequestRef[];
  item: ReviewQueueItem;
}) => {
  const self = item.featureRequest;
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<FeatureRequestRef | null>(null);
  const matches = filterBlindChoices(choices, query, self.id);

  return (
    <article className="flex flex-col gap-4 rounded-2xl border p-4 sm:p-5">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <OriginBadge isNew={item.isNew} />
          <span className="bg-muted text-muted-foreground inline-flex h-5 items-center rounded-full px-2 text-[0.65rem] font-semibold tracking-wide uppercase">
            Blind Review
          </span>
        </div>
        <h3 className="text-lg font-semibold text-balance">{self.title}</h3>
        <p className="text-muted-foreground text-sm">{self.description}</p>
      </header>
      <p className="text-muted-foreground text-sm">
        The AI&apos;s suggestion is hidden for this request so your decision is your own. Find a
        Feature Request it duplicates or relates to by title.
      </p>
      <TextField
        hint="Matches by title, in title order. Nothing is ranked by the AI."
        id={`blind-search-${self.id}`}
        label="Find a Feature Request"
        maxLength={120}
        onChange={(value) => {
          setQuery(value);
          setPicked(null);
        }}
        placeholder="e.g. shift trade"
        value={query}
      />
      {query.trim() && matches.length === 0 ? (
        <p className="text-muted-foreground text-sm">No Feature Request title matches.</p>
      ) : null}
      {matches.length > 0 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Matching Feature Requests</legend>
          {matches.map((choice) => (
            <label
              className="has-checked:border-foreground flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm"
              key={choice.id}
            >
              <input
                checked={picked?.id === choice.id}
                className="mt-1"
                name={`blind-pick-${self.id}`}
                onChange={() => setPicked(choice)}
                type="radio"
                value={choice.id}
              />
              <span className="font-medium">{choice.title}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      {picked ? (
        <PairActions
          actions={actions}
          formKey={`${self.id}-${picked.id}`}
          key={picked.id}
          other={picked}
          self={self}
        />
      ) : null}
      {item.isNew ? <NoDuplicatesAction actions={actions} item={item} /> : null}
    </article>
  );
};
