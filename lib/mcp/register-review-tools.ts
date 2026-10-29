import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  actorSchema,
  decideRequestSchema,
  decisionRuleViolation,
  metricsInputSchema,
  scanOptionsSchema,
  SignalError,
} from "@/lib/signal/contracts";
import { originOfAccess, pilotKeyRefusal } from "@/lib/auth/pilot-access";
import type { PilotAccess } from "@/lib/auth/pilot-access";
import type { ReviewService } from "@/lib/signal/contracts";
import { getReviewService } from "@/lib/signal/runtime";
import { z } from "zod";

import { advertised, invalidInputToolError, toToolError } from "./signal-tool-helpers";
import { asToolError, asToolResult } from "./tool-result";

/**
 * Review (spec 002) tools: on the Operator MCP, bound to the Pilot Workspace when the Pilot Key
 * header is sent (spec 003). The public MCP gets only the review_queue read, and only with the
 * Pilot Key; review writes are never on the public MCP.
 */
export const reviewMcpToolNames = [
  "review_queue",
  "decide_review",
  "undo_review_decision",
  "scan_backlog",
] as const;

type ReviewToolName = (typeof reviewMcpToolNames)[number];

export const reviewToolDescriptions = {
  decide_review:
    "Record the Product Manager's Review Decision on a Feature Request (Operator only). The AI only suggests Same Need; the Product Manager decides: duplicate (canonicalId must be featureRequestId or otherId; new evidence goes to the canonical), related (sharedDimension: the Shared Dimension seen in both), distinct, or none (no otherId: a decision that confirms the Feature Request has no duplicate; not the same as undecided). Pass suggestionId when answering a Suspected Duplicate from review_queue; omit it on a blind item (the decision records blind: true and answers no suggestion). A rule violation returns invalid_decision; see the canonical evidence afterwards with get_feature_request.",
  review_queue:
    "Read the Review Queue: new Feature Requests not yet reviewed and backlog Feature Requests with undecided Suspected Duplicates, each with the AI's Reason. Suspicions are suggestions only; nothing counts as a duplicate until the Product Manager decides it with decide_review. Blind Review: an item with blind: true withholds the AI's suggestion, Reason and restated need; choose the other Feature Request (and canonical) yourself from blindChoices, every open Feature Request by title with no AI ranking. On the public MCP it is listed only with the Pilot Key; a refused key returns pilot_key_required (branch on error.details.reason: missing, invalid or disabled).",
  scan_backlog:
    "Scan open backlog Feature Requests for Suspected Duplicates (Operator only). Costly (embeddings and judge calls): run it only on request, never on a schedule. limit bounds this call; remaining says how many are left for the next call. Results appear in review_queue as suggestions.",
  undo_review_decision:
    "Undo a Review Decision by decisionId (Operator only). Undo keeps history: the decision stays in the Feature Request's review history marked undone, and the pair returns to review_queue. A second undo fails with already_undone.",
} as const satisfies Record<ReviewToolName, string>;

/** Read tool on both MCP endpoints (spec 003 Capabilities: metrics accept Origin over MCP). */
export const REVIEW_METRICS_TOOL = "review_metrics";

export const reviewMetricsToolDescription =
  "Read the prevention and review metrics (read-only), the same body as GET /api/metrics: Intake Duplicate Rate next to the backlog baseline, Review Coverage, Suspected Duplication (AI-suspected workload, not confirmed duplication), Undo Rate and Suggestion Acceptance, each rate with its counts. One Origin per call: origin (demo, seed, eval or pilot) or, by default, the caller's own. Workspace: the Crewday Demo Workspace without the Pilot Key header; the Pilot Workspace with it, on the public and the Operator MCP. A refused key returns pilot_key_required; branch on error.details.reason: missing (send the key), invalid (wrong key; check it with the operator) or disabled (no Pilot Key configured on this deployment; drop the header for the demo). An unknown origin returns invalid_input.";

const idSchema = z.string().trim().uuid();

const toolSchemas = {
  decide: decideRequestSchema,
  metrics: metricsInputSchema,
  queue: z.object({}),
  scan: scanOptionsSchema,
  undo: z.object({ actor: actorSchema, decisionId: idSchema }),
};

/** Fields whose malformed value means "no such record" rather than bad input. */
const ID_FIELDS: Record<string, string> = {
  canonicalId: "Feature Request",
  decisionId: "Review Decision",
  featureRequestId: "Feature Request",
  otherId: "Feature Request",
  suggestionId: "Suspected Duplicate",
};

const invalidInputError = (error: z.ZodError) => {
  const idIssue = error.issues.find((issue) => String(issue.path[0]) in ID_FIELDS);
  if (!idIssue) return invalidInputToolError(error);
  const field = String(idIssue.path[0]);
  return asToolError({
    code: "not_found",
    message: `Malformed ${field}: ${ID_FIELDS[field]} not found (${field} must be a UUID).`,
    resolution: "Call review_queue to find valid ids, then call again.",
  });
};

const plainToolMeta = { _meta: {} };

const reviewFor = (access: PilotAccess): ReviewService => {
  if (access.kind === "refused") throw pilotKeyRefusal(access.reason);
  const service = getReviewService(originOfAccess(access));
  if (service) return service;
  throw new SignalError({
    code: "service_unavailable",
    message:
      "Review is not configured on this deployment (DATABASE_URL missing; the backlog scan also needs AI keys).",
    resolution: "Retry later or ask the operator to configure DATABASE_URL and the AI Gateway key.",
    status: 503,
  });
};

const runReviewTool = async <S extends z.ZodType>(
  schema: S,
  args: unknown,
  run: (input: z.output<S>) => Promise<unknown>,
) => {
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) return invalidInputError(parsed.error);
  try {
    return asToolResult(await run(parsed.data));
  } catch (error) {
    return toToolError(error);
  }
};

const decide = async (
  requireReview: () => ReviewService,
  { actor, ...input }: z.output<typeof toolSchemas.decide>,
) => {
  const violation = decisionRuleViolation(input);
  if (violation)
    throw new SignalError({
      code: "invalid_decision",
      message: violation,
      resolution:
        "Duplicate needs canonicalId (featureRequestId or otherId); Related needs sharedDimension; Distinct needs otherId only; none takes neither. Fix the arguments and call again.",
      status: 422,
    });
  return { decision: await requireReview().decide(input, actor) };
};

const undo = async (
  requireReview: () => ReviewService,
  { actor, decisionId }: z.output<typeof toolSchemas.undo>,
) => ({
  decision: await requireReview().undo(decisionId, actor),
});

/**
 * Registers review_metrics for the caller's Workspace (`access` from the Pilot Key header; demo by
 * default; a refused key fails the call with pilot_key_required). Public and Operator MCP alike.
 */
export const registerReviewMetricsMcpTool = (server: McpServer, access?: PilotAccess) => {
  registerAppTool(
    server,
    REVIEW_METRICS_TOOL,
    {
      ...plainToolMeta,
      description: reviewMetricsToolDescription,
      inputSchema: advertised(toolSchemas.metrics),
    },
    (args) =>
      runReviewTool(toolSchemas.metrics, args, (input) =>
        reviewFor(access ?? { kind: "demo" }).metrics(input),
      ),
  );
};

/**
 * Registers the review tools for the caller's Workspace (`access` from the Pilot Key header; demo
 * by default; a refused key fails every call). The Operator MCP route enforces Operator access
 * before any call. `readOnly` registers only review_queue (the public MCP with the Pilot Key).
 */
export const registerReviewMcpTools = (
  server: McpServer,
  { access, readOnly = false }: { access?: PilotAccess; readOnly?: boolean } = {},
) => {
  const requireReview = () => reviewFor(access ?? { kind: "demo" });

  registerAppTool(
    server,
    "review_queue",
    {
      ...plainToolMeta,
      description: reviewToolDescriptions.review_queue,
      inputSchema: advertised(toolSchemas.queue),
    },
    (args) => runReviewTool(toolSchemas.queue, args, () => requireReview().queue()),
  );
  if (readOnly) return;

  registerAppTool(
    server,
    "decide_review",
    {
      ...plainToolMeta,
      description: reviewToolDescriptions.decide_review,
      inputSchema: advertised(toolSchemas.decide),
    },
    (args) => runReviewTool(toolSchemas.decide, args, (input) => decide(requireReview, input)),
  );

  registerAppTool(
    server,
    "undo_review_decision",
    {
      ...plainToolMeta,
      description: reviewToolDescriptions.undo_review_decision,
      inputSchema: advertised(toolSchemas.undo),
    },
    (args) => runReviewTool(toolSchemas.undo, args, (input) => undo(requireReview, input)),
  );

  registerAppTool(
    server,
    "scan_backlog",
    {
      ...plainToolMeta,
      description: reviewToolDescriptions.scan_backlog,
      inputSchema: advertised(toolSchemas.scan),
    },
    (args) => runReviewTool(toolSchemas.scan, args, (options) => requireReview().scan(options)),
  );
};
