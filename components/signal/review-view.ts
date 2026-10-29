import type {
  CommentView,
  DecideInput,
  EvidenceVia,
  Metrics,
  ReviewDecision,
  ReviewDecisionKind,
  SupportView,
} from "@/lib/signal/contracts";
import { decisionRuleViolation, isReviewMetrics } from "@/lib/signal/contracts";

/** Pure view helpers for the Review Queue and canonical evidence (spec 002). */

const DASH = "—";

/** A rate as a percent; "—" when there is no denominator. Below 10% keeps one decimal. */
export const formatRate = (rate: number | null): string => {
  if (rate === null || !Number.isFinite(rate)) return DASH;
  const percent = rate * 100;
  if (percent === 0) return "0%";
  if (percent < 10) return `${Number(percent.toFixed(1))}%`;
  return `${Math.round(percent)}%`;
};

export interface MetricCard {
  /** Labeled AI-suspected: workload, not confirmed duplication. */
  aiSuspected: boolean;
  comparison: { counts: string; label: string; value: string } | null;
  counts: string;
  description: string;
  key: "intakeDuplicateRate" | "reviewCoverage" | "suspectedDuplication";
  label: string;
  value: string;
}

const NO_DATA = "No data yet";

const DESCRIPTIONS: Record<MetricCard["key"], string> = {
  intakeDuplicateRate:
    "Share of reviewed new Feature Requests (created through a Check) confirmed Duplicate. Lower is better.",
  reviewCoverage: "Share of new Feature Requests a Product Manager has reviewed.",
  suspectedDuplication:
    "Open Feature Requests with an undecided Suspected Duplicate. Review workload, not confirmed duplication.",
};

/** The three headline metrics, each with its counts; "—" when there is no data. */
export const metricCards = (metrics: Metrics | null): MetricCard[] => {
  const review = metrics && isReviewMetrics(metrics) ? metrics : null;
  if (!review) {
    return [
      {
        aiSuspected: false,
        comparison: { counts: NO_DATA, label: "Backlog baseline", value: DASH },
        counts: NO_DATA,
        description: DESCRIPTIONS.intakeDuplicateRate,
        key: "intakeDuplicateRate",
        label: "Intake Duplicate Rate",
        value: DASH,
      },
      {
        aiSuspected: false,
        comparison: null,
        counts: NO_DATA,
        description: DESCRIPTIONS.reviewCoverage,
        key: "reviewCoverage",
        label: "Review Coverage",
        value: DASH,
      },
      {
        aiSuspected: true,
        comparison: null,
        counts: NO_DATA,
        description: DESCRIPTIONS.suspectedDuplication,
        key: "suspectedDuplication",
        label: "Suspected Duplication",
        value: DASH,
      },
    ];
  }
  const { backlogBaseline, intakeDuplicateRate, reviewCoverage, suspectedDuplication } = review;
  return [
    {
      aiSuspected: false,
      comparison: {
        counts: `${backlogBaseline.duplicates} of ${backlogBaseline.reviewed} reviewed`,
        label: "Backlog baseline",
        value: formatRate(backlogBaseline.rate),
      },
      counts: `${intakeDuplicateRate.duplicates} of ${intakeDuplicateRate.reviewed} reviewed new Feature Requests confirmed Duplicate`,
      description: DESCRIPTIONS.intakeDuplicateRate,
      key: "intakeDuplicateRate",
      label: "Intake Duplicate Rate",
      value: formatRate(intakeDuplicateRate.rate),
    },
    {
      aiSuspected: false,
      comparison: null,
      counts: `${reviewCoverage.reviewed} of ${reviewCoverage.total} new Feature Requests reviewed`,
      description: DESCRIPTIONS.reviewCoverage,
      key: "reviewCoverage",
      label: "Review Coverage",
      value: formatRate(reviewCoverage.rate),
    },
    {
      aiSuspected: true,
      comparison: null,
      counts: `${suspectedDuplication.open} of ${suspectedDuplication.total} open Feature Requests`,
      description: DESCRIPTIONS.suspectedDuplication,
      key: "suspectedDuplication",
      label: "Suspected Duplication",
      value: formatRate(suspectedDuplication.rate),
    },
  ];
};

export type CanonicalSide = "other" | "this";

/** The canonical Feature Request id for the side the Product Manager chose. */
export const canonicalIdFor = (
  pair: { featureRequestId: string; otherId: string },
  side: CanonicalSide,
): string => (side === "this" ? pair.featureRequestId : pair.otherId);

export type DecisionBody = DecideInput & { actor: { name: string; type: "staff" } };

export type DecisionBodyResult = { body: DecisionBody; ok: true } | { message: string; ok: false };

/** Builds a `POST /api/review/decisions` body, or the rule it breaks. */
export const buildDecisionBody = (input: {
  actorName: string;
  canonical?: CanonicalSide;
  decision: ReviewDecisionKind;
  featureRequestId: string;
  otherId?: string;
  sharedDimension?: string;
  suggestionId?: string;
}): DecisionBodyResult => {
  const name = input.actorName.trim();
  if (!name) return { message: "Add your name to record a Review Decision.", ok: false };
  const decide: DecideInput = {
    decision: input.decision,
    featureRequestId: input.featureRequestId,
  };
  if (input.decision !== "none" && input.otherId) decide.otherId = input.otherId;
  if (input.decision === "duplicate" && input.otherId && input.canonical) {
    decide.canonicalId = canonicalIdFor(
      { featureRequestId: input.featureRequestId, otherId: input.otherId },
      input.canonical,
    );
  }
  if (input.decision === "related") {
    const dimension = input.sharedDimension?.trim();
    if (dimension) decide.sharedDimension = dimension;
  }
  if (input.decision !== "none" && input.suggestionId) decide.suggestionId = input.suggestionId;
  const violation = decisionRuleViolation(decide);
  if (violation) return { message: violation, ok: false };
  return { body: { ...decide, actor: { name, type: "staff" } }, ok: true };
};

export type ReviewActionBlock = "name" | "pending" | "sign_in";

/** Whether review actions can run, and why not: Operator sign-in, then a name, then pending. */
export const reviewActionState = (input: {
  actorName: string;
  operator: boolean;
  pending: boolean;
}): { enabled: boolean; reason: ReviewActionBlock | null } => {
  if (!input.operator) return { enabled: false, reason: "sign_in" };
  if (!input.actorName.trim()) return { enabled: false, reason: "name" };
  if (input.pending) return { enabled: false, reason: "pending" };
  return { enabled: true, reason: null };
};

export interface AccountEvidence {
  account: SupportView["account"];
  supports: SupportView[];
  /** Duplicates this Account's Supports came from, each once, in first-seen order. */
  vias: EvidenceVia[];
}

/** Groups Supports by Account so each Account appears (and counts) once, noting provenance. */
export const groupEvidenceByAccount = (supports: SupportView[]): AccountEvidence[] => {
  const groups = new Map<string, AccountEvidence>();
  for (const support of supports) {
    let group = groups.get(support.account.name);
    if (!group) {
      group = { account: support.account, supports: [], vias: [] };
      groups.set(support.account.name, group);
    }
    group.supports.push(support);
    const { via } = support;
    if (via && !group.vias.some((item) => item.featureRequestId === via.featureRequestId)) {
      group.vias.push(via);
    }
  }
  return [...groups.values()];
};

/** How many Comments were recorded here and how many on confirmed duplicates. */
export const splitCommentsByVia = (
  comments: CommentView[],
): { direct: number; viaDuplicates: number } => {
  const viaDuplicates = comments.filter((comment) => comment.via).length;
  return { direct: comments.length - viaDuplicates, viaDuplicates };
};

const quoted = (titles: Map<string, string>, id: string | null) =>
  `“${(id && titles.get(id)) || "a Feature Request"}”`;

/** One-line description of a Review Decision, e.g. "Duplicate: “A” → canonical “B”". */
export const describeDecision = (decision: ReviewDecision, titles: Map<string, string>): string => {
  const self = quoted(titles, decision.featureRequestId);
  const other = quoted(titles, decision.otherId);
  switch (decision.decision) {
    case "duplicate": {
      const duplicateId =
        decision.canonicalId === decision.featureRequestId
          ? decision.otherId
          : decision.featureRequestId;
      return `Duplicate: ${quoted(titles, duplicateId)} → canonical ${quoted(titles, decision.canonicalId)}`;
    }
    case "related":
      return `Related: ${self} and ${other} share ${decision.sharedDimension ?? "a Shared Dimension"}`;
    case "distinct":
      return `Distinct: ${self} and ${other}`;
    default:
      return `No duplicates: ${self}`;
  }
};

export const DECISION_LABELS: Record<ReviewDecisionKind, string> = {
  distinct: "Distinct",
  duplicate: "Duplicate",
  none: "No duplicates",
  related: "Related",
};
