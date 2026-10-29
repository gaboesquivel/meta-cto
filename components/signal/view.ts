import type {
  Candidate,
  CheckResult,
  CommentInput,
  OnBehalfOf,
  SupportView,
} from "@/lib/signal/contracts";

/** Pure view helpers for the Signal UI. */

export interface AccountSupports {
  account: SupportView["account"];
  supports: SupportView[];
}

/** Groups Supports by Account name, keeping first-seen order. */
export const groupSupportsByAccount = (supports: SupportView[]): AccountSupports[] => {
  const groups = new Map<string, AccountSupports>();
  for (const support of supports) {
    const existing = groups.get(support.account.name);
    if (existing) {
      existing.supports.push(support);
    } else {
      groups.set(support.account.name, { account: support.account, supports: [support] });
    }
  }
  return [...groups.values()];
};

/** A Skip Reason is required to create when any candidate is Same Need. */
export const isSkipReasonRequired = (result: CheckResult | null): boolean =>
  result?.candidates.some((candidate) => candidate.verdict === "same_need") ?? false;

export interface SplitCandidates {
  related: Candidate[];
  same: Candidate[];
  unknown: Candidate[];
}

/** Splits candidates by Verdict; Different candidates are not shown. */
export const splitCandidates = (result: CheckResult): SplitCandidates => ({
  related: result.candidates.filter((candidate) => candidate.verdict === "related_need"),
  same: result.candidates.filter((candidate) => candidate.verdict === "same_need"),
  unknown: result.candidates.filter((candidate) => candidate.verdict === "unknown"),
});

/** Account Context as one line, e.g. "24 stores · retail · Pro". */
export const describeAccount = (account: SupportView["account"]): string =>
  [account.size, account.segment, account.plan].filter(Boolean).join(" · ");

export interface OnBehalfOfFields {
  accountName: string;
  requesterName: string;
  segment: string;
  size: string;
}

/** Builds the onBehalfOf body from form fields; undefined without an Account name. */
export const buildOnBehalfOf = (fields: OnBehalfOfFields): OnBehalfOf | undefined => {
  const name = fields.accountName.trim();
  if (!name) return undefined;
  const account: OnBehalfOf["account"] = { name };
  const size = fields.size.trim();
  const segment = fields.segment.trim();
  if (size) account.size = size;
  if (segment) account.segment = segment;
  const requesterName = fields.requesterName.trim();
  return requesterName ? { account, requester: { name: requesterName } } : { account };
};

/** Builds a Comment body; a `checkId` cites the Check whose Same Need Verdict led here. */
export const buildCommentBody = (input: {
  body: string;
  checkId?: string;
  onBehalfOf?: OnBehalfOf;
  staffName: string;
}): CommentInput => {
  const comment: CommentInput = {
    actor: { name: input.staffName.trim(), type: "staff" },
    body: input.body,
    onBehalfOf: input.onBehalfOf,
  };
  if (input.checkId) comment.checkId = input.checkId;
  return comment;
};

export interface ApiError {
  code: string;
  message: string;
  resolution: string | null;
}

const stringField = (body: Record<string, unknown>, key: string): string | null => {
  const value = body[key];
  return typeof value === "string" && value ? value : null;
};

/** Reads `{ code, error | message, resolution }` from an error response body. */
export const readApiError = (body: unknown, status: number): ApiError => {
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  return {
    code: stringField(record, "code") ?? `http_${status}`,
    message:
      stringField(record, "error") ??
      stringField(record, "message") ??
      `Request failed with status ${status}.`,
    resolution: stringField(record, "resolution"),
  };
};
