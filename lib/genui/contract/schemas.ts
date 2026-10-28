import { z } from "zod";

import { compositeNames } from "../registry/composites";

export const compositeSchema = z.enum(compositeNames);

export const answerPropsSchema = z.object({
  body: z.string(),
  sourceIds: z.array(z.string()).default([]),
});

export const collectionGridPropsSchema = z.object({
  composite: compositeSchema.default("grid-cards"),
  entityIds: z.array(z.string()),
});

export const searchResultsPropsSchema = z.object({
  composite: compositeSchema.default("results-with-filters"),
  entityIds: z.array(z.string()),
  query: z.string(),
});

export const comparisonViewPropsSchema = z.object({
  composite: compositeSchema.default("side-by-side"),
  dimension: z.string().default(""),
  entityIds: z.array(z.string()).min(2),
});

export const timelineViewPropsSchema = z.object({
  composite: compositeSchema.default("timeline-vertical"),
  orderedIds: z.array(z.string()),
});

export const detailViewPropsSchema = z.object({
  composite: compositeSchema.default("detail-hero"),
  sourceId: z.string(),
});

export const dataExplorerPropsSchema = z.object({
  composite: compositeSchema.default("metrics-dashboard"),
  metricIds: z.array(z.string()),
});

export const documentationBlockPropsSchema = z.object({
  composite: compositeSchema.default("code-and-prose"),
  documentId: z.string(),
});

export const interactiveFormPropsSchema = z.object({
  composite: compositeSchema.default("form-single"),
  formId: z.string(),
});

export const filePreviewPropsSchema = z.object({
  composite: compositeSchema.default("file-embedded"),
  mediaId: z.string(),
});

export const statusMessagePropsSchema = z.object({
  message: z.string(),
  variant: z.enum(["loading", "empty", "warning", "error"]),
});

export const sectionStackPropsSchema = z.object({
  children: z.array(z.unknown()).default([]),
});

export const evidenceQuotePropsSchema = z.object({
  documentId: z.string(),
});

export const rankedSignalListPropsSchema = z.object({
  entityIds: z.array(z.string()),
  reviewHref: z.string().optional(),
});

export const componentPropsByName = {
  Answer: answerPropsSchema,
  CollectionGrid: collectionGridPropsSchema,
  ComparisonView: comparisonViewPropsSchema,
  DataExplorer: dataExplorerPropsSchema,
  DetailView: detailViewPropsSchema,
  DocumentationBlock: documentationBlockPropsSchema,
  EvidenceQuote: evidenceQuotePropsSchema,
  FilePreview: filePreviewPropsSchema,
  InteractiveForm: interactiveFormPropsSchema,
  RankedSignalList: rankedSignalListPropsSchema,
  SearchResults: searchResultsPropsSchema,
  SectionStack: sectionStackPropsSchema,
  StatusMessage: statusMessagePropsSchema,
  TimelineView: timelineViewPropsSchema,
} as const;
