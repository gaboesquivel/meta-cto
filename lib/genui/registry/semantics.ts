import type { GroundedRecord } from "../core/envelope";

export type CompositionRelationship =
  | "explanation-then-evidence"
  | "comparison-then-interpretation"
  | "primary-with-support"
  | "evidence-then-action"
  | "chronology"
  | "concise-fact"
  | "exploration";

export interface ComponentSemantic {
  avoid: string[];
  cardinality: { max: number; min: number };
  density: "concise" | "evidence" | "document" | "chronology" | "interactive";
  evidence: string;
  fallback: string;
  interactions: string[];
  purpose: string;
  recordKinds: GroundedRecord["kind"][];
  requiredFields: string[];
  suits: CompositionRelationship[];
}

export const componentSemantics: Record<string, ComponentSemantic> = {
  Answer: {
    avoid: [
      "Replacing requested charts, tables, or forms with prose alone.",
      "Treating one answer as proof every task is complete.",
    ],
    cardinality: { max: 1, min: 1 },
    density: "concise",
    evidence: "Source ids for factual sentences; label interpretations.",
    fallback: "State the evidence gap; do not broaden a filtered request.",
    interactions: ["open sources"],
    purpose: "Explain a supported fact or a specific evidence gap.",
    recordKinds: ["entity", "document", "metric"],
    requiredFields: ["body"],
    suits: [
      "concise-fact",
      "explanation-then-evidence",
      "comparison-then-interpretation",
      "primary-with-support",
    ],
  },
  CollectionGrid: {
    avoid: ["Card grids when a table or list is clearer.", "Decorative tiles without data."],
    cardinality: { max: 1, min: 1 },
    density: "evidence",
    evidence: "Entity records referenced by id.",
    fallback: "Answer with a short list when records are missing.",
    interactions: ["filter", "open entity"],
    purpose: "Browse a bounded collection with layout matched to count.",
    recordKinds: ["entity"],
    requiredFields: ["entityIds"],
    suits: ["exploration", "primary-with-support"],
  },
  ComparisonView: {
    avoid: ["Comparison without at least two grounded entities."],
    cardinality: { max: 1, min: 1 },
    density: "evidence",
    evidence: "Compared entity ids and optional metric ids.",
    fallback: "Answer describing what cannot be compared.",
    interactions: ["toggle dimension"],
    purpose: "Contrast entities on named dimensions.",
    recordKinds: ["entity", "metric"],
    requiredFields: ["entityIds"],
    suits: ["comparison-then-interpretation"],
  },
  DataExplorer: {
    avoid: ["Charts without metrics or time series in records."],
    cardinality: { max: 1, min: 1 },
    density: "interactive",
    evidence: "Metric records and optional document context.",
    fallback: "Table of available metrics.",
    interactions: ["filter", "change range"],
    purpose: "Explore metrics and trends interactively.",
    recordKinds: ["metric", "document"],
    requiredFields: ["metricIds"],
    suits: ["exploration"],
  },
  DetailView: {
    avoid: ["Hero layouts for single-line facts."],
    cardinality: { max: 1, min: 1 },
    density: "document",
    evidence: "Primary entity or document record.",
    fallback: "Answer with link to source.",
    interactions: ["open related"],
    purpose: "Deep dive on one entity or document.",
    recordKinds: ["entity", "document"],
    requiredFields: ["sourceId"],
    suits: ["primary-with-support"],
  },
  DocumentationBlock: {
    avoid: ["Code blocks without a document record."],
    cardinality: { max: 1, min: 1 },
    density: "document",
    evidence: "Document record with excerpt.",
    fallback: "Plain answer citing the doc id.",
    interactions: ["copy snippet"],
    purpose: "Show documentation and code together.",
    recordKinds: ["document"],
    requiredFields: ["documentId"],
    suits: ["explanation-then-evidence"],
  },
  FilePreview: {
    avoid: ["Embedding executable content."],
    cardinality: { max: 1, min: 1 },
    density: "document",
    evidence: "Media record with mime type.",
    fallback: "Link to download.",
    interactions: ["download"],
    purpose: "Preview a bounded file or media asset.",
    recordKinds: ["media"],
    requiredFields: ["mediaId"],
    suits: ["primary-with-support"],
  },
  InteractiveForm: {
    avoid: ["Submitting without registered server actions."],
    cardinality: { max: 1, min: 1 },
    density: "interactive",
    evidence: "Form schema id registered by host.",
    fallback: "Status message explaining unavailable action.",
    interactions: ["submit-form"],
    purpose: "Collect input for a registered action.",
    recordKinds: ["entity"],
    requiredFields: ["formId"],
    suits: ["evidence-then-action"],
  },
  SearchResults: {
    avoid: ["Filters that reference ids not in records."],
    cardinality: { max: 1, min: 1 },
    density: "evidence",
    evidence: "Result entity ids from retrieval.",
    fallback: "Empty state with query echo.",
    interactions: ["filter", "sort"],
    purpose: "Present search hits with optional filters.",
    recordKinds: ["entity"],
    requiredFields: ["entityIds", "query"],
    suits: ["exploration"],
  },
  SectionStack: {
    avoid: ["Nested stacks", "More than six sections", "Duplicate section purposes."],
    cardinality: { max: 6, min: 1 },
    density: "evidence",
    evidence: "Each child must validate independently.",
    fallback: "Drop invalid children; never widen filters.",
    interactions: [],
    purpose: "Sequence multiple composites for compound requests.",
    recordKinds: ["entity", "document", "metric", "media"],
    requiredFields: ["children"],
    suits: [
      "explanation-then-evidence",
      "comparison-then-interpretation",
      "primary-with-support",
      "evidence-then-action",
      "chronology",
    ],
  },
  StatusMessage: {
    avoid: ["Using status for primary content."],
    cardinality: { max: 1, min: 1 },
    density: "concise",
    evidence: "Host-provided status code.",
    fallback: "Generic error text.",
    interactions: [],
    purpose: "Loading, empty, warning, or error states.",
    recordKinds: [],
    requiredFields: ["variant", "message"],
    suits: ["concise-fact"],
  },
  TimelineView: {
    avoid: ["Timelines without ordered document or entity evidence."],
    cardinality: { max: 1, min: 1 },
    density: "chronology",
    evidence: "Ordered record ids.",
    fallback: "Bulleted answer.",
    interactions: ["expand event"],
    purpose: "Chronological story or release history.",
    recordKinds: ["document", "entity"],
    requiredFields: ["orderedIds"],
    suits: ["chronology"],
  },
};

export const compositionGuidance = `
Choose layout from intent, not habit:
- Prefer Answer when a short grounded sentence suffices.
- Use SectionStack for compound requests; do not force one template.
- Pair explanation with evidence (Answer then CollectionGrid) when users ask "why" and "show".
- Use ComparisonView only with two or more entity ids.
- Use DataExplorer when metrics or trends are explicit.
- Avoid repetitive card grids; use list-compact or comparison-table when appropriate.
- Use progressive disclosure (detail-document) for long content.
- Plain text beats decorative UI when data is thin.
`.trim();
