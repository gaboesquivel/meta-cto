import type { z } from "zod";

import { jsonError, withExtraHeaders } from "@/lib/api/json-error";
import { buildRateLimitHeaders } from "@/lib/api/rate-limit-headers";
import { verifyOperatorRequest } from "@/lib/auth/operator-access";
import { pilotKeyRefusal, resolvePilotAccess } from "@/lib/auth/pilot-access";
import type { PilotAccess } from "@/lib/auth/pilot-access";
import { SignalError } from "@/lib/signal/contracts";
import type { Origin, ReviewService, SignalErrorCode, SignalService } from "@/lib/signal/contracts";
import { getReviewService, getSignalService } from "@/lib/signal/runtime";

/** Writes allowed per client IP per window (best effort: in-memory per instance). */
export const SIGNAL_WRITE_LIMIT = 30;
export const SIGNAL_WRITE_WINDOW_SECONDS = 60;

const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/iu;

const buckets = new Map<string, { count: number; resetAt: number }>();

export const resetSignalWriteLimit = () => {
  buckets.clear();
};

const clientKey = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  request.headers.get("x-real-ip") ??
  "local";

const consumeWrite = (request: Request) => {
  const key = clientKey(request);
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + SIGNAL_WRITE_WINDOW_SECONDS * 1000 };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  const headers = buildRateLimitHeaders({
    limit: SIGNAL_WRITE_LIMIT,
    remaining: SIGNAL_WRITE_LIMIT - bucket.count,
    resetAt: bucket.resetAt,
    windowSeconds: SIGNAL_WRITE_WINDOW_SECONDS,
  });
  if (bucket.count <= SIGNAL_WRITE_LIMIT) return { headers, limited: null };
  return {
    headers,
    limited: jsonError({
      code: "rate_limited",
      extraHeaders: headers,
      message: "Too many writes from this client.",
      resolution: `Wait and retry; writes are limited to ${SIGNAL_WRITE_LIMIT} per minute per client.`,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      status: 429,
    }),
  };
};

/** `jsonError` body plus extra fields (zod issues, the existing Support). */
export const signalJsonError = async (
  input: { code: string; message: string; resolution: string; status: number },
  extra?: Record<string, unknown>,
) => {
  const base = jsonError(input);
  if (!extra) return base;
  const body = (await base.json()) as Record<string, unknown>;
  return Response.json({ ...body, ...extra }, { headers: base.headers, status: base.status });
};

const invalidInput = (issues: unknown) =>
  new SignalError({
    code: "invalid_input",
    details: { issues },
    message: "The request is invalid.",
    resolution: "Fix the fields listed in issues and retry.",
    status: 400,
  });

const featureRequestNotFound = {
  message: "Feature Request not found.",
  resolution: "Use GET /api/feature-requests to find a valid id.",
};

export const decisionNotFound = {
  message: "Review Decision not found.",
  resolution:
    "Use GET /api/review/queue or the Feature Request's reviewHistory to find a valid id.",
};

const notFound = (what: { message: string; resolution: string }) =>
  new SignalError({ code: "not_found", ...what, status: 404 });

export const parseWith = <T extends z.ZodType>(schema: T, value: unknown): z.infer<T> => {
  const result = schema.safeParse(value);
  if (!result.success) throw invalidInput(result.error.issues);
  return result.data;
};

export const parseJsonBody = async <T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> => {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw invalidInput([{ code: "invalid_json", message: "Body must be valid JSON.", path: [] }]);
  }
  return parseWith(schema, json);
};

export const parseSearchParams = <T extends z.ZodType>(request: Request, schema: T): z.infer<T> =>
  parseWith(schema, Object.fromEntries(new URL(request.url).searchParams));

/** Resolves the dynamic `[id]` segment; non-uuid ids are a 404 so they never reach the database. */
export const readId = async (
  params: Promise<{ id: string }>,
  what: { message: string; resolution: string } = featureRequestNotFound,
) => {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) throw notFound(what);
  return id;
};

/** HTTP status per error code where REST fixes it, whatever status the service attached. */
export const SIGNAL_ERROR_STATUS: Partial<Record<SignalErrorCode, number>> = {
  already_undone: 409,
  invalid_decision: 422,
  operator_required: 401,
};

/** Object details are spread into the body; arrays (zod issues) go under `issues`; others are dropped. */
const detailsToExtra = (details: unknown): Record<string, unknown> | undefined => {
  if (Array.isArray(details)) return { issues: details };
  if (details && typeof details === "object") return details as Record<string, unknown>;
  return undefined;
};

export const toErrorResponse = async (error: unknown) => {
  if (error instanceof SignalError) {
    const extra = detailsToExtra(error.details);
    return await signalJsonError(
      {
        code: error.code,
        message: error.message,
        resolution: error.resolution,
        status: SIGNAL_ERROR_STATUS[error.code] ?? error.status,
      },
      extra,
    );
  }
  console.error("[signal] unexpected error", error);
  return jsonError({
    code: "internal_error",
    message: "Unexpected server error.",
    resolution: "Retry later; if it persists, report it.",
    status: 500,
  });
};

const serviceUnavailable = () =>
  jsonError({
    code: "service_unavailable",
    message: "Signal is not configured on this deployment.",
    resolution: "Set DATABASE_URL and AI_GATEWAY_API_KEY",
    status: 503,
  });

export const OPERATOR_REQUIRED_RESOLUTION =
  "Sign in as Operator (/operator/access) or send Authorization: Bearer <OPERATOR_SECRET>.";

/** Refusal for a write without Operator access; fails closed (503) when the secret is unset. */
const operatorRequired = (reason: "disabled" | "unauthorized") =>
  reason === "disabled"
    ? jsonError({
        code: "operator_required",
        message: "Operator access is not configured on this deployment, so review writes are off.",
        resolution: "Set OPERATOR_SECRET (min 16 characters) in the deployment environment.",
        status: 503,
      })
    : jsonError({
        code: "operator_required",
        message: "This action needs Operator access.",
        resolution: OPERATOR_REQUIRED_RESOLUTION,
        status: 401,
      });

/** The caller's access from the Pilot Key header; a request-less call is the demo caller. */
export const pilotAccessOf = (request: Request | undefined): PilotAccess =>
  request ? resolvePilotAccess(request) : { kind: "demo" };

/** The Origin (and so the Workspace) a granted caller acts on. */
export const originOfAccess = (access: Exclude<PilotAccess, { kind: "refused" }>): Origin =>
  access.kind === "pilot" ? "pilot" : "demo";

/**
 * Runs a review route. Reads are open; writes spend the per-client write budget and need Operator
 * access, as before spec 003. The Pilot Key header selects the Pilot Workspace but never
 * authorizes a write by itself: agents hold that key, and what agents file must stay separate
 * from what people decide. A bad or unconfigured key is refused before any service call.
 */
export const handleReview = async ({
  request,
  run,
  write = false,
}: {
  request?: Request;
  run: (service: ReviewService) => Promise<Response>;
  write?: boolean;
}): Promise<Response> => {
  const limit = write && request ? consumeWrite(request) : null;
  if (limit?.limited) return limit.limited;
  const pilot = pilotAccessOf(request);
  if (pilot.kind === "refused")
    return withExtraHeaders(await toErrorResponse(pilotKeyRefusal(pilot.reason)), limit?.headers);
  if (write) {
    const access = request
      ? verifyOperatorRequest(request)
      : { ok: false as const, reason: "unauthorized" as const };
    if (!access.ok) return withExtraHeaders(operatorRequired(access.reason), limit?.headers);
  }
  const service = getReviewService(originOfAccess(pilot));
  if (!service) return withExtraHeaders(serviceUnavailable(), limit?.headers);
  let response: Response;
  try {
    response = await run(service);
  } catch (error) {
    response = await toErrorResponse(error);
  }
  return withExtraHeaders(response, limit?.headers);
};

/**
 * Runs a Signal route: rate-limits writes per client IP, resolves the caller's Workspace from the
 * Pilot Key header (none is the demo), resolves the service, and maps SignalError and unexpected
 * errors to `jsonError` responses.
 */
export const handleSignal = async ({
  request,
  run,
  write = false,
}: {
  request?: Request;
  run: (service: SignalService) => Promise<Response>;
  write?: boolean;
}): Promise<Response> => {
  const limit = write && request ? consumeWrite(request) : null;
  if (limit?.limited) return limit.limited;
  const pilot = pilotAccessOf(request);
  if (pilot.kind === "refused")
    return withExtraHeaders(await toErrorResponse(pilotKeyRefusal(pilot.reason)), limit?.headers);
  const service = getSignalService(originOfAccess(pilot));
  if (!service) return serviceUnavailable();
  let response: Response;
  try {
    response = await run(service);
  } catch (error) {
    response = await toErrorResponse(error);
  }
  return withExtraHeaders(response, limit?.headers);
};
