export const compositeNames = [
  "grid-dense",
  "grid-cards",
  "list-compact",
  "featured-row",
  "results-with-filters",
  "results-list",
  "side-by-side",
  "comparison-table",
  "timeline-vertical",
  "timeline-horizontal",
  "detail-hero",
  "detail-document",
  "metrics-dashboard",
  "chart-focus",
  "code-and-prose",
  "form-single",
  "form-wizard",
  "file-embedded",
  "status-inline",
] as const;

export type CompositeName = (typeof compositeNames)[number];

const compositeSet = new Set<string>(compositeNames);

export const isCompositeName = (value: string): value is CompositeName => compositeSet.has(value);

export const chooseCollectionComposite = ({
  entityIds,
}: {
  entityIds: string[];
}): CompositeName => {
  if (entityIds.length === 1) return "detail-hero";
  if (entityIds.length === 2) return "featured-row";
  if (entityIds.length <= 4) return "grid-cards";
  return "grid-dense";
};
