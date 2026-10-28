import { z } from "zod";

/** Shared contracts for spec 001: used by the service, REST routes, MCP tools and UI. */

export const MAX_TITLE = 120;
export const MAX_DESCRIPTION = 2000;
export const CHECK_TTL_MINUTES = 30;
export const MAX_SAME_NEED = 3;
export const MAX_RELATED_NEED = 2;
export const CANDIDATE_POOL = 10;

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
  checkId: z.string().uuid(),
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

export interface SupportView {
  account: { name: string; plan: string | null; segment: string | null; size: string | null };
  actor: Actor;
  createdAt: string;
  id: string;
  quote: string | null;
  requester: string | null;
}

export interface CommentView {
  account: string | null;
  actor: Actor;
  body: string;
  createdAt: string;
  id: string;
}

export interface RelatedLinkView {
  featureRequestId: string;
  reason: string;
  sharedDimension: string;
  title: string;
}

export interface FeatureRequestDetail extends FeatureRequestSummary {
  comments: CommentView[];
  createdBy: Actor;
  onBehalfOf: { account: string | null; requester: string | null };
  relatedLinks: RelatedLinkView[];
  skipReason: string | null;
  supports: SupportView[];
}

export interface Metrics {
  checks: number;
  checksWithSameNeed: number;
  createsAfterSameNeed: number;
  fragmentationRate: null;
  reviewCoverage: 0;
  suggestionAcceptance: number | null;
}

/** Agent-actionable error; REST maps it with `jsonError`, MCP returns it as an error result. */
export type SignalErrorCode =
  | "already_supported"
  | "check_expired"
  | "check_mismatch"
  | "check_required"
  | "invalid_input"
  | "not_found"
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
  metrics: () => Promise<Metrics>;
  search: (
    input: SearchInput,
  ) => Promise<{ items: FeatureRequestSummary[]; nextCursor: number | null }>;
  support: (
    featureRequestId: string,
    input: SupportInput,
  ) => Promise<{ created: boolean; featureRequest: FeatureRequestDetail; support: SupportView }>;
}
