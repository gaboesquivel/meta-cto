import type { ComponentName } from "../registry/components";
import { componentNames } from "../registry/components";
import type { CompositeName } from "../registry/composites";

export const collectionComposites: readonly CompositeName[] = [
  "grid-dense",
  "grid-cards",
  "list-compact",
  "featured-row",
  "detail-hero",
];

export const searchComposites: readonly CompositeName[] = ["results-with-filters", "results-list"];

export const comparisonComposites: readonly CompositeName[] = ["side-by-side", "comparison-table"];

export const timelineComposites: readonly CompositeName[] = [
  "timeline-vertical",
  "timeline-horizontal",
];

export const detailComposites: readonly CompositeName[] = ["detail-hero", "detail-document"];

export const dataComposites: readonly CompositeName[] = ["metrics-dashboard", "chart-focus"];

export const componentCompositeAllowlist: Partial<Record<ComponentName, readonly CompositeName[]>> =
  {
    CollectionGrid: collectionComposites,
    ComparisonView: comparisonComposites,
    DataExplorer: dataComposites,
    DetailView: detailComposites,
    DocumentationBlock: ["code-and-prose"],
    FilePreview: ["file-embedded"],
    InteractiveForm: ["form-single", "form-wizard"],
    SearchResults: searchComposites,
    TimelineView: timelineComposites,
  };

export const supportedComponentSet = new Set<string>(componentNames);
