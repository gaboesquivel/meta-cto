import { z } from "zod";

/** Shared contracts for specs 001 and 002: used by the service, REST routes, MCP tools and UI. */

export const MAX_TITLE = 120;
export const MAX_DESCRIPTION = 2000;
export const CHECK_TTL_MINUTES = 30;
export const MAX_SAME_NEED = 3;
export const MAX_RELATED_NEED = 2;
export const CANDIDATE_POOL = 10;

/**
 * Origin: where a Check or event came from (decision 0003). Recorded at the source; a metric
 * reads one Origin at a time. `pilot` is the Pilot Workspace (spec 003 task 02).
 */
export const ORIGINS = ["pilot", "demo", "seed", "eval"] as const;
export type Origin = (typeof ORIGINS)[number];
export const originSchema = z.enum(ORIGINS);
/** The Origin of the Crewday demo caller, the default for REST, MCP and `/review`. */
export const DEMO_ORIGIN: Origin = "demo";

export const metricsInputSchema = z.object({ origin: originSchema.optional() });
export type MetricsInput = z.infer<typeof metricsInputSchema>;

export const actorSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(["agent", "staff"]),
});

export const onBehalfOfSchema = z.object({
  account: z.object({
    externalId: z.string().max(80).optional(),
    name: z.string().trim().min(1).max(120),
    plan: z.string().max(40).optional(),
    segment: z.string().max(40).optional(),
    size: z.string().max(40).optional(),
  }),
  requester: z
    .object({ name: z.string().trim().min(1).max(80), role: z.string().max(60).optional() })
    .optional(),
});

export const draftSchema = z.object({
  description: z.string().trim().min(1).max(MAX_DESCRIPTION),
  title: z.string().trim().min(3).max(MAX_TITLE),
});

export const checkInputSchema = z.object({
  actor: actorSchema,
  draft: draftSchema,
  onBehalfOf: onBehalfOfSchema.optional(),
});

export const createInputSchema = checkInputSchema.extend({
  /** Optional in the schema so a missing Check returns `check_required`, not `invalid_input`. */
  checkId: z.string().uuid().optional(),
  skipReason: z.string().trim().min(3).max(500).optional(),
});

export const supportInputSchema = z.object({
  actor: actorSchema,
  checkId: z.string().uuid().optional(),
  onBehalfOf: onBehalfOfSchema,
  quote: z.string().trim().max(500).optional(),
});

export const commentInputSchema = z.object({
  actor: actorSchema,
  body: z.string().trim().min(1).max(2000),
  /** The Check whose Same Need candidate led to this Comment; counts toward Suggestion Acceptance. */
  checkId: z.string().uuid().optional(),
  onBehalfOf: onBehalfOfSchema.optional(),
});

export const searchInputSchema = z.object({
  cursor: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  q: z.string().trim().max(200).optional(),
});

export type Actor = z.infer<typeof actorSchema>;
export type OnBehalfOf = z.infer<typeof onBehalfOfSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type CheckInput = z.infer<typeof checkInputSchema>;
export type CreateInput = z.infer<typeof createInputSchema>;
export type SupportInput = z.infer<typeof supportInputSchema>;
export type CommentInput = z.infer<typeof commentInputSchema>;
export type SearchInput = z.infer<typeof searchInputSchema>;

export type Verdict = "different" | "related_need" | "same_need" | "unknown";
export type NextAction = "create" | "create_with_related_link" | "support_or_comment";

export interface Candidate {
  featureRequestId: string;
  reason: string | null;
  sharedDimension: string | null;
  title: string;
  verdict: Verdict;
}

export interface CheckResult {
  candidates: Candidate[];
  checkId: string;
  consideredCount: number;
  degraded: boolean;
  expiresAt: string;
  nextAction: NextAction;
  underlyingNeed: string | null;
}

export interface FeatureRequestSummary {
  accountCount: number;
  createdAt: string;
  description: string;
  id: string;
  supportCount: number;
  title: string;
  underlyingNeed: string | null;
}

/** A pointer to another Feature Request, for labels and links. */
export interface FeatureRequestRef {
  id: string;
  title: string;
}

/** Provenance of evidence shown on a canonical Feature Request but recorded on one of its duplicates. */
export interface EvidenceVia {
  featureRequestId: string;
  title: string;
}

export interface AccountView {
  name: string;
  plan: string | null;
  segment: string | null;
  size: string | null;
}

export interface SupportView {
  account: AccountView;
  actor: Actor;
  createdAt: string;
  id: string;
  quote: string | null;
  requester: string | null;
  /** Set when the Support was recorded on a confirmed duplicate of this Feature Request. */
  via?: EvidenceVia;
}

export interface CommentView {
  account: string | null;
  actor: Actor;
  body: string;
  createdAt: string;
  id: string;
  /** Set when the Comment was recorded on a confirmed duplicate of this Feature Request. */
  via?: EvidenceVia;
}

/** Where a Related Link came from: a Check, the demo seed, or a Product Manager's Related decision. */
export type RelatedLinkSource = "check" | "review" | "seed";

export interface RelatedLinkView {
  featureRequestId: string;
  reason: string;
  sharedDimension: string;
  source: RelatedLinkSource;
  title: string;
}

/**
 * A confirmed duplicate shown on its canonical, with its own originating evidence: the
 * customer's original words (`description`), the Account it was filed on behalf of, and the
 * requester. Its Account counts once in the canonical's `accountCount`.
 */
export interface DuplicateEvidence extends FeatureRequestRef {
  account: AccountView | null;
  createdAt: string;
  createdBy: Actor;
  description: string;
  requester: string | null;
}

export interface FeatureRequestDetail extends FeatureRequestSummary {
  comments: CommentView[];
  createdBy: Actor;
  onBehalfOf: { account: string | null; requester: string | null };
  relatedLinks: RelatedLinkView[];
  skipReason: string | null;
  supports: SupportView[];
  /**
   * Canonical evidence (spec 002).
   * `duplicates`: confirmed duplicates of this Feature Request with their original words,
   * Account and requester; their Supports and Comments appear in `supports`/`comments` with
   * `via`. `accountCount` counts each Account once across Supports and duplicates' origins.
   * `duplicateOf`: the canonical Feature Request when this one is a confirmed duplicate.
   * `reviewHistory`: Review Decisions involving this Feature Request, undone ones included.
   */
  duplicateOf: FeatureRequestRef | null;
  duplicates: DuplicateEvidence[];
  reviewHistory: ReviewDecision[];
}

/** `rate` is null when the denominator is zero; counts are always reported. */
export const rateOf = (numerator: number, denominator: number): number | null =>
  denominator === 0 ? null : numerator / denominator;

/** Suggestion Acceptance and its counts (spec 001). */
export interface SuggestionMetrics {
  checks: number;
  checksWithSameNeed: number;
  createsAfterSameNeed: number;
  suggestionAcceptance: number | null;
}

/** Spec 002 metrics: the shape of `GET /api/metrics`. */
export interface ReviewMetrics extends SuggestionMetrics {
  /**
   * The intake Origin: Checks, events and Feature Requests created through a Check count only
   * from it. The pre-Signal backlog (baseline, its suspicions) is the Workspace's, for any Origin.
   */
  origin: Origin;
  /** Reviewed pre-Signal Feature Requests confirmed Duplicate ÷ reviewed pre-Signal Feature Requests. */
  backlogBaseline: { duplicates: number; rate: number | null; reviewed: number };
  /**
   * Main metric: reviewed new Feature Requests confirmed Duplicate ÷ reviewed new Feature Requests.
   * A request counts as Duplicate when it is on either side of an active Duplicate decision, so
   * the rate does not depend on which side the Product Manager kept as canonical.
   */
  intakeDuplicateRate: { duplicates: number; rate: number | null; reviewed: number };
  /** Reviewed new Feature Requests ÷ new Feature Requests. */
  reviewCoverage: { rate: number | null; reviewed: number; total: number };
  /** AI-suspected, unconfirmed: open Feature Requests with an undecided Suspected Duplicate ÷ open. */
  suspectedDuplication: { open: number; rate: number | null; total: number };
  /** Duplicate decisions later undone ÷ Duplicate decisions. */
  undoRate: { decisions: number; rate: number | null; undone: number };
}

// Review context (spec 002, decision 0002).

export const SUSPICION_SOURCES = ["check", "scan"] as const;
export const REVIEW_DECISION_KINDS = ["duplicate", "related", "distinct", "none"] as const;
export const MAX_SHARED_DIMENSION = 200;

export type SuspicionSource = (typeof SUSPICION_SOURCES)[number];
/** "none": the Product Manager confirmed a Feature Request with no suspicions has no duplicate. */
export type ReviewDecisionKind = (typeof REVIEW_DECISION_KINDS)[number];

/** Two existing Feature Requests the AI judged Same Need; never counted as duplication. */
export interface SuspectedDuplicate {
  /** The unordered pair, stored sorted ascending. */
  featureRequestIds: [string, string];
  id: string;
  judgedAt: string;
  model: string | null;
  reason: string;
  source: SuspicionSource;
}

export interface ReviewDecision {
  actor: Actor;
  /** Blind Review (spec 003): decided without the AI's suggestion or Reason in view. */
  blind: boolean;
  /** Duplicate only: the canonical Feature Request, one of `featureRequestId` and `otherId`. */
  canonicalId: string | null;
  createdAt: string;
  decision: ReviewDecisionKind;
  featureRequestId: string;
  id: string;
  /** Null only for "none". */
  otherId: string | null;
  /** Related only: the Shared Dimension the Product Manager stated. */
  sharedDimension: string | null;
  /** The Suspected Duplicate this decision answered, if any. */
  suggestionId: string | null;
  undoneAt: string | null;
  undoneBy: Actor | null;
}

/**
 * Optional fields are checked by `decisionRuleViolation` (and the service) rather than the schema,
 * so a missing canonical or Shared Dimension returns `invalid_decision`, not `invalid_input`.
 */
export const decideInputSchema = z.object({
  canonicalId: z.string().uuid().optional(),
  decision: z.enum(REVIEW_DECISION_KINDS),
  featureRequestId: z.string().uuid(),
  otherId: z.string().uuid().optional(),
  sharedDimension: z.string().trim().min(1).max(MAX_SHARED_DIMENSION).optional(),
  suggestionId: z.string().uuid().optional(),
});

/** REST and MCP bodies: the decision plus who records it (Operator access is checked separately). */
export const decideRequestSchema = decideInputSchema.extend({ actor: actorSchema });
export const undoRequestSchema = z.object({ actor: actorSchema });
export const scanOptionsSchema = z.object({
  /** Feature Requests to scan in this call; the rest stay for the next call. */
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type DecideInput = z.infer<typeof decideInputSchema>;
export type ScanOptions = z.infer<typeof scanOptionsSchema>;

/** Rules a decision must meet before it touches storage; returns a message, or null when valid. */
export const decisionRuleViolation = (input: DecideInput): string | null => {
  if (input.decision === "none") {
    return input.otherId || input.canonicalId || input.sharedDimension
      ? "A none decision takes no other Feature Request, canonical or Shared Dimension."
      : null;
  }
  if (!input.otherId) return "Name the other Feature Request with otherId.";
  if (input.otherId === input.featureRequestId)
    return "A Feature Request can't be decided against itself.";
  if (input.decision === "duplicate") {
    return input.canonicalId === input.featureRequestId || input.canonicalId === input.otherId
      ? null
      : "A Duplicate needs canonicalId set to featureRequestId or otherId.";
  }
  if (input.canonicalId) return "Only a Duplicate takes a canonicalId.";
  if (input.decision === "related") {
    return input.sharedDimension ? null : "Related needs the Shared Dimension you see in both.";
  }
  return input.sharedDimension ? "Only Related takes a Shared Dimension." : null;
};

export interface ReviewSuspicionView {
  /** The active decision on this pair; null while undecided. */
  decision: ReviewDecision | null;
  judgedAt: string;
  model: string | null;
  other: FeatureRequestSummary;
  reason: string;
  source: SuspicionSource;
  suggestionId: string;
}

export interface ReviewQueueItem {
  /**
   * Chosen for Blind Review (spec 003): `suspicions` is empty and `underlyingNeed` null so the
   * AI's suggestion, Reason and restated need are withheld; pick the other side from
   * `ReviewQueue.blindChoices`. The decision records `blind: true`.
   */
  blind: boolean;
  featureRequest: FeatureRequestSummary;
  /** Created through a Check (spec 001); otherwise a pre-Signal backlog Feature Request. */
  isNew: boolean;
  suspicions: ReviewSuspicionView[];
}

export interface ReviewQueue {
  /**
   * Present only when an item is blind: every open Feature Request in the Workspace, by title,
   * with no AI ranking, so a blind reviewer can choose the other side (and canonical) of a decision.
   */
  blindChoices?: FeatureRequestRef[];
  counts: { backlog: number; new: number };
  items: ReviewQueueItem[];
}

export interface ScanResult {
  pairsFound: number;
  /** Open Feature Requests with an embedding still not scanned after this call. */
  remaining: number;
  scanned: number;
}

/** Agent-actionable error; REST maps it with `jsonError`, MCP returns it as an error result. */
export type SignalErrorCode =
  | "already_supported"
  | "already_undone"
  | "check_expired"
  | "check_mismatch"
  | "check_required"
  | "invalid_decision"
  | "invalid_input"
  | "not_found"
  | "operator_required"
  | "pilot_key_required"
  | "service_unavailable"
  | "skip_reason_required";

export class SignalError extends Error {
  readonly code: SignalErrorCode;
  readonly resolution: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(input: {
    code: SignalErrorCode;
    details?: unknown;
    message: string;
    resolution: string;
    status: number;
  }) {
    super(input.message);
    this.name = "SignalError";
    this.code = input.code;
    this.details = input.details;
    this.resolution = input.resolution;
    this.status = input.status;
  }
}

/** Ports injected into the service so tests use fakes. */
export interface Embedder {
  embed: (text: string) => Promise<number[]>;
}

export interface JudgeCandidate {
  description: string;
  featureRequestId: string;
  title: string;
  underlyingNeed: string | null;
}

export interface JudgeOutput {
  judgments: {
    featureRequestId: string;
    reason: string;
    sharedDimension: string | null;
    verdict: Exclude<Verdict, "unknown">;
  }[];
  underlyingNeed: string;
}

export interface Judge {
  judge: (input: { candidates: JudgeCandidate[]; draft: Draft }) => Promise<JudgeOutput>;
}

export interface SignalService {
  check: (input: CheckInput) => Promise<CheckResult>;
  comment: (featureRequestId: string, input: CommentInput) => Promise<CommentView>;
  create: (input: CreateInput) => Promise<FeatureRequestDetail>;
  get: (featureRequestId: string) => Promise<FeatureRequestDetail>;
  search: (
    input: SearchInput,
  ) => Promise<{ items: FeatureRequestSummary[]; nextCursor: number | null }>;
  support: (
    featureRequestId: string,
    input: SupportInput,
  ) => Promise<{ created: boolean; featureRequest: FeatureRequestDetail; support: SupportView }>;
}

/** Review port (spec 002). Writes need Operator access, checked by REST and MCP before calling. */
export interface ReviewService {
  decide: (input: DecideInput, actor: Actor) => Promise<ReviewDecision>;
  /**
   * Review metrics plus Suggestion Acceptance for one Origin, the caller's own when omitted;
   * needs only the database.
   */
  metrics: (input?: MetricsInput) => Promise<ReviewMetrics>;
  queue: () => Promise<ReviewQueue>;
  scan: (options?: ScanOptions) => Promise<ScanResult>;
  undo: (decisionId: string, actor: Actor) => Promise<ReviewDecision>;
}
