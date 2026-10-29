import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { originOfAccess, pilotKeyRefusal } from "@/lib/auth/pilot-access";
import type { PilotAccess } from "@/lib/auth/pilot-access";
import {
  checkInputSchema,
  commentInputSchema,
  createInputSchema,
  searchInputSchema,
  SignalError,
  supportInputSchema,
} from "@/lib/signal/contracts";
import type { SignalService } from "@/lib/signal/contracts";
import { handleSignal, SIGNAL_WRITE_LIMIT } from "@/lib/signal/http";
import { getSignalService } from "@/lib/signal/runtime";
import { z } from "zod";

import { signalToolDescriptions } from "./signal-tool-descriptions";
import { advertised, invalidInputToolError, toToolError } from "./signal-tool-helpers";
import { asToolError, asToolResult } from "./tool-result";

export { signalMcpToolNames } from "./signal-tool-descriptions";

const featureRequestIdSchema = z.string().trim().uuid();

const toolSchemas = {
  check: checkInputSchema,
  comment: commentInputSchema.extend({ featureRequestId: featureRequestIdSchema }),
  create: createInputSchema.extend({ checkId: z.string().uuid().optional() }),
  get: z.object({ featureRequestId: featureRequestIdSchema }),
  search: searchInputSchema,
  support: supportInputSchema.extend({ featureRequestId: featureRequestIdSchema }),
};

const plainToolMeta = { _meta: {} };

/** The caller's service: the Pilot Workspace with the Pilot Key, the demo without; refused otherwise. */
const serviceFor = (access: PilotAccess): SignalService => {
  if (access.kind === "refused") throw pilotKeyRefusal(access.reason);
  const service = getSignalService(originOfAccess(access));
  if (service) return service;
  throw new SignalError({
    code: "service_unavailable",
    message: "Signal is not configured on this deployment (database or AI keys missing).",
    resolution: "Retry later or ask the operator to configure DATABASE_URL and the AI Gateway key.",
    status: 503,
  });
};

/** Request context the SDK passes to tool handlers over Streamable HTTP. */
interface ToolContext {
  http?: { req?: Request };
}

const fallbackRequest = () => new Request("http://localhost/api/mcp");

/**
 * Consumes one unit of the REST per-IP write budget (same buckets as `handleSignal`).
 * Returns a `rate_limited` tool error when the client is over budget.
 */
const consumeSignalWrite = async (request: Request | undefined) => {
  const response = await handleSignal({
    request: request ?? fallbackRequest(),
    run: () => Promise.resolve(new Response(null, { status: 204 })),
    write: true,
  });
  if (response.status !== 429) return null;
  const retryAfter = response.headers.get("Retry-After") ?? "60";
  return asToolError({
    code: "rate_limited",
    details: { retryAfterSeconds: Number(retryAfter) },
    message: "Too many writes from this client.",
    resolution: `Wait ${retryAfter} seconds and retry; writes are limited to ${SIGNAL_WRITE_LIMIT} per minute per client.`,
  });
};

const malformedIdError = () =>
  asToolError({
    code: "not_found",
    message: "Feature Request not found.",
    resolution: "Use search_feature_requests to find a valid featureRequestId (a UUID).",
  });

const invalidInputError = (error: z.ZodError) => {
  if (error.issues.some((issue) => issue.path[0] === "featureRequestId")) return malformedIdError();
  return invalidInputToolError(error);
};

interface SignalToolOptions<S extends z.ZodType> {
  args: unknown;
  ctx: ToolContext | undefined;
  run: (input: z.output<S>) => Promise<unknown>;
  schema: S;
  /** Whether this call spends the per-IP write budget (writes and paid embeddings). */
  write?: (input: z.output<S>) => boolean;
}

const runSignalTool = async <S extends z.ZodType>({
  args,
  ctx,
  run,
  schema,
  write,
}: SignalToolOptions<S>) => {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) return invalidInputError(parsed.error);
  if (write?.(parsed.data)) {
    const limited = await consumeSignalWrite(ctx?.http?.req);
    if (limited) return limited;
  }
  try {
    return asToolResult(await run(parsed.data));
  } catch (error) {
    return toToolError(error);
  }
};

const always = () => true;

const supportFeatureRequest = async (
  requireService: () => SignalService,
  { featureRequestId, ...input }: z.output<typeof toolSchemas.support>,
) => {
  const { created, featureRequest, support } = await requireService().support(
    featureRequestId,
    input,
  );
  if (!created)
    throw new SignalError({
      code: "already_supported",
      details: { featureRequest, support },
      message: "This Account already supports this Feature Request.",
      resolution: "This Account already supports this Feature Request; add a Comment instead.",
      status: 409,
    });
  return { created, featureRequest, support };
};

const createFeatureRequest = async (
  requireService: () => SignalService,
  { checkId, ...rest }: z.output<typeof toolSchemas.create>,
) => {
  if (!checkId)
    throw new SignalError({
      code: "check_required",
      message: "create_feature_request needs the checkId of a recent Check of this draft.",
      resolution:
        "Call check_feature_request with the same draft, review its verdicts, then call create_feature_request with the returned checkId (and a skipReason if a same_need candidate exists).",
      status: 409,
    });
  const featureRequest = await requireService().create({ ...rest, checkId });
  return { featureRequest };
};

const commentOnFeatureRequest = async (
  requireService: () => SignalService,
  { featureRequestId, ...input }: z.output<typeof toolSchemas.comment>,
) => {
  const comment = await requireService().comment(featureRequestId, input);
  return { comment };
};

/**
 * Registers the Signal tools, unchanged in shape. `access` (from the Pilot Key header) picks the
 * Workspace: demo by default, the Pilot Workspace with the key; a refused key fails every call.
 */
export const registerSignalMcpTools = (server: McpServer, access?: PilotAccess) => {
  const requireService = () => serviceFor(access ?? { kind: "demo" });

  registerAppTool(
    server,
    "check_feature_request",
    {
      ...plainToolMeta,
      description: signalToolDescriptions.check_feature_request,
      inputSchema: advertised(toolSchemas.check),
    },
    (args, ctx) =>
      runSignalTool({
        args,
        ctx,
        run: (input) => requireService().check(input),
        schema: toolSchemas.check,
        write: always,
      }),
  );

  registerAppTool(
    server,
    "create_feature_request",
    {
      ...plainToolMeta,
      description: signalToolDescriptions.create_feature_request,
      inputSchema: advertised(toolSchemas.create),
    },
    (args, ctx) =>
      runSignalTool({
        args,
        ctx,
        run: (input) => createFeatureRequest(requireService, input),
        schema: toolSchemas.create,
        write: always,
      }),
  );

  registerAppTool(
    server,
    "support_feature_request",
    {
      ...plainToolMeta,
      description: signalToolDescriptions.support_feature_request,
      inputSchema: advertised(toolSchemas.support),
    },
    (args, ctx) =>
      runSignalTool({
        args,
        ctx,
        run: (input) => supportFeatureRequest(requireService, input),
        schema: toolSchemas.support,
        write: always,
      }),
  );

  registerAppTool(
    server,
    "comment_on_feature_request",
    {
      ...plainToolMeta,
      description: signalToolDescriptions.comment_on_feature_request,
      inputSchema: advertised(toolSchemas.comment),
    },
    (args, ctx) =>
      runSignalTool({
        args,
        ctx,
        run: (input) => commentOnFeatureRequest(requireService, input),
        schema: toolSchemas.comment,
        write: always,
      }),
  );

  registerAppTool(
    server,
    "search_feature_requests",
    {
      ...plainToolMeta,
      description: signalToolDescriptions.search_feature_requests,
      inputSchema: advertised(toolSchemas.search),
    },
    (args, ctx) =>
      runSignalTool({
        args,
        ctx,
        run: (input) => requireService().search(input),
        schema: toolSchemas.search,
        write: (input) => Boolean(input.q),
      }),
  );

  registerAppTool(
    server,
    "get_feature_request",
    {
      ...plainToolMeta,
      description: signalToolDescriptions.get_feature_request,
      inputSchema: advertised(toolSchemas.get),
    },
    (args, ctx) =>
      runSignalTool({
        args,
        ctx,
        run: ({ featureRequestId }) => requireService().get(featureRequestId),
        schema: toolSchemas.get,
      }),
  );
};
