import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer, StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import {
  checkInputSchema,
  commentInputSchema,
  createInputSchema,
  searchInputSchema,
  SignalError,
  supportInputSchema,
} from "@/lib/signal/contracts";
import type { SignalService } from "@/lib/signal/contracts";
import { getSignalService } from "@/lib/signal/runtime";
import { z } from "zod";

import { signalToolDescriptions } from "./signal-tool-descriptions";
import { asToolError, asToolResult } from "./tool-result";

export { signalMcpToolNames } from "./signal-tool-descriptions";

const featureRequestIdSchema = z.string().trim().min(1).max(200);

const toolSchemas = {
  check: checkInputSchema,
  comment: commentInputSchema.extend({ featureRequestId: featureRequestIdSchema }),
  create: createInputSchema.extend({ checkId: z.string().uuid().optional() }),
  get: z.object({ featureRequestId: featureRequestIdSchema }),
  search: searchInputSchema,
  support: supportInputSchema.extend({ featureRequestId: featureRequestIdSchema }),
};

/**
 * Advertise the zod JSON Schema in tools/list but let every call through, so the
 * handler can return `invalid_input` with a resolution instead of the SDK's bare message.
 */
const advertised = <S extends z.ZodType>(
  schema: S,
): StandardSchemaWithJSON<z.input<S>, unknown> => ({
  "~standard": {
    jsonSchema: schema["~standard"].jsonSchema,
    validate: (value: unknown) => ({ value }),
    vendor: "signal",
    version: 1,
  },
});

const plainToolMeta = { _meta: {} };

const requireService = (): SignalService => {
  const service = getSignalService();
  if (service) return service;
  throw new SignalError({
    code: "service_unavailable",
    message: "Signal is not configured on this deployment (database or AI keys missing).",
    resolution: "Retry later or ask the operator to configure DATABASE_URL and the AI Gateway key.",
    status: 503,
  });
};

const toToolError = (error: unknown) => {
  if (error instanceof SignalError)
    return asToolError({
      code: error.code,
      details: error.details,
      message: error.message,
      resolution: error.resolution,
    });
  return asToolError({
    code: "internal_error",
    message: error instanceof Error ? error.message : "Unexpected error",
    resolution: "Retry the call; if it keeps failing, report it to the operator.",
  });
};

const runSignalTool = async <S extends z.ZodType>(
  schema: S,
  args: unknown,
  run: (input: z.output<S>) => Promise<unknown>,
) => {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success)
    return asToolError({
      code: "invalid_input",
      details: parsed.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.join("."),
      })),
      message: `Invalid arguments: ${z.prettifyError(parsed.error)}`,
      resolution:
        "Fix the fields listed in details to match the tool's input schema and call again.",
    });
  try {
    return asToolResult(await run(parsed.data));
  } catch (error) {
    return toToolError(error);
  }
};

const createFeatureRequest = async ({ checkId, ...rest }: z.output<typeof toolSchemas.create>) => {
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

const commentOnFeatureRequest = async ({
  featureRequestId,
  ...input
}: z.output<typeof toolSchemas.comment>) => {
  const comment = await requireService().comment(featureRequestId, input);
  return { comment };
};

export const registerSignalMcpTools = (server: McpServer) => {
  registerAppTool(
    server,
    "check_feature_request",
    {
      ...plainToolMeta,
      description: signalToolDescriptions.check_feature_request,
      inputSchema: advertised(toolSchemas.check),
    },
    (args) => runSignalTool(toolSchemas.check, args, (input) => requireService().check(input)),
  );

  registerAppTool(
    server,
    "create_feature_request",
    {
      ...plainToolMeta,
      description: signalToolDescriptions.create_feature_request,
      inputSchema: advertised(toolSchemas.create),
    },
    (args) => runSignalTool(toolSchemas.create, args, createFeatureRequest),
  );

  registerAppTool(
    server,
    "support_feature_request",
    {
      ...plainToolMeta,
      description: signalToolDescriptions.support_feature_request,
      inputSchema: advertised(toolSchemas.support),
    },
    (args) =>
      runSignalTool(toolSchemas.support, args, ({ featureRequestId, ...input }) =>
        requireService().support(featureRequestId, input),
      ),
  );

  registerAppTool(
    server,
    "comment_on_feature_request",
    {
      ...plainToolMeta,
      description: signalToolDescriptions.comment_on_feature_request,
      inputSchema: advertised(toolSchemas.comment),
    },
    (args) => runSignalTool(toolSchemas.comment, args, commentOnFeatureRequest),
  );

  registerAppTool(
    server,
    "search_feature_requests",
    {
      ...plainToolMeta,
      description: signalToolDescriptions.search_feature_requests,
      inputSchema: advertised(toolSchemas.search),
    },
    (args) => runSignalTool(toolSchemas.search, args, (input) => requireService().search(input)),
  );

  registerAppTool(
    server,
    "get_feature_request",
    {
      ...plainToolMeta,
      description: signalToolDescriptions.get_feature_request,
      inputSchema: advertised(toolSchemas.get),
    },
    (args) =>
      runSignalTool(toolSchemas.get, args, ({ featureRequestId }) =>
        requireService().get(featureRequestId),
      ),
  );
};
