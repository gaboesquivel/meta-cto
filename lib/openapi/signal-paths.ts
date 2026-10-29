/** OpenAPI fragments for the Signal REST routes: check before create (spec 001) and review (spec 002). */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const errorContent = { "application/json": { schema: ref("ApiError") } };

const err = (description: string, codes: string[]) => ({
  content: errorContent,
  description: `${description} (code: ${codes.join(", ")})`,
});

const ok = (description: string, schema: object) => ({
  content: { "application/json": { schema } },
  description,
});

const jsonBody = (schemaName: string) => ({
  content: { "application/json": { schema: ref(schemaName) } },
  required: true,
});

const idParameter = {
  description: "Feature Request id (uuid)",
  in: "path",
  name: "id",
  required: true,
  schema: { format: "uuid", type: "string" },
};

const invalidInput = err("Invalid JSON or fields; body includes zod issues", ["invalid_input"]);
const rateLimited = { $ref: "#/components/responses/RateLimited" };
const unavailable = err("Signal is not configured", ["service_unavailable"]);
const notFound = err("Feature Request not found", ["not_found"]);
const operatorRequired = err(
  "Operator access missing or invalid; sign in at /operator/access or send Authorization: Bearer <OPERATOR_SECRET>",
  ["operator_required"],
);
const operatorUnavailable = err(
  "Signal is not configured, or OPERATOR_SECRET is unset so review writes fail closed",
  ["service_unavailable", "operator_required"],
);
/** Operator access for review writes; any one of these is enough. */
export const signalSecuritySchemes = {
  operatorBearer: {
    description: "Authorization: Bearer <OPERATOR_SECRET>",
    scheme: "bearer",
    type: "http",
  },
  operatorSecret: { in: "header", name: "X-Operator-Secret", type: "apiKey" },
  operatorSession: {
    description: "Session cookie set by signing in at /operator/access",
    in: "cookie",
    name: "flow_operator_session",
    type: "apiKey",
  },
};

const operatorSecurity = [{ operatorBearer: [] }, { operatorSecret: [] }, { operatorSession: [] }];

const str = { type: "string" };
const nullableStr = { type: ["string", "null"] };
const uuid = { format: "uuid", type: "string" };
const nullableUuid = { format: "uuid", type: ["string", "null"] };
const dateTime = { format: "date-time", type: "string" };
const integer = { type: "integer" };
const nullableRate = { description: "null when the denominator is zero", type: ["number", "null"] };

const countedRate = (description: string, counts: string[]) => ({
  description,
  properties: Object.fromEntries([
    ["rate", nullableRate],
    ...counts.map((name) => [name, integer]),
  ]),
  required: ["rate", ...counts],
  type: "object",
});

const via = {
  description: "Set when recorded on a confirmed duplicate of this Feature Request",
  properties: { featureRequestId: uuid, title: str },
  required: ["featureRequestId", "title"],
  type: "object",
};

const featureRequestRef = {
  properties: { id: uuid, title: str },
  required: ["id", "title"],
  type: "object",
};

const accountView = {
  properties: { name: str, plan: nullableStr, segment: nullableStr, size: nullableStr },
  required: ["name"],
  type: "object",
};

const duplicateEvidence = {
  description:
    "A confirmed duplicate with its originating evidence: the customer's original words, Account and requester",
  properties: {
    account: { oneOf: [accountView, { type: "null" }] },
    createdAt: dateTime,
    createdBy: ref("SignalActor"),
    description: { description: "The customer's original words", type: "string" },
    id: uuid,
    requester: nullableStr,
    title: str,
  },
  required: ["id", "title", "description", "account", "requester", "createdBy", "createdAt"],
  type: "object",
};

const metricsSchema = {
  properties: {
    backlogBaseline: countedRate(
      "Reviewed pre-Signal Feature Requests confirmed Duplicate / reviewed pre-Signal Feature Requests",
      ["duplicates", "reviewed"],
    ),
    checks: integer,
    checksWithSameNeed: integer,
    createsAfterSameNeed: integer,
    intakeDuplicateRate: countedRate(
      "Main metric: reviewed new Feature Requests confirmed Duplicate / reviewed new Feature Requests",
      ["duplicates", "reviewed"],
    ),
    reviewCoverage: countedRate("Reviewed new Feature Requests / new Feature Requests", [
      "reviewed",
      "total",
    ]),
    suggestionAcceptance: nullableRate,
    suspectedDuplication: countedRate(
      "AI-suspected, unconfirmed: open Feature Requests with an undecided suspected duplicate / open Feature Requests",
      ["open", "total"],
    ),
    undoRate: countedRate("Duplicate decisions later undone / Duplicate decisions", [
      "decisions",
      "undone",
    ]),
  },
  required: [
    "checks",
    "checksWithSameNeed",
    "createsAfterSameNeed",
    "suggestionAcceptance",
    "intakeDuplicateRate",
    "backlogBaseline",
    "reviewCoverage",
    "suspectedDuplication",
    "undoRate",
  ],
  type: "object",
};

const actor = {
  properties: {
    name: { maxLength: 80, minLength: 1, type: "string" },
    type: { enum: ["staff", "agent"], type: "string" },
  },
  required: ["type", "name"],
  type: "object",
};

const onBehalfOf = {
  properties: {
    account: {
      properties: {
        externalId: str,
        name: { maxLength: 120, minLength: 1, type: "string" },
        plan: str,
        segment: str,
        size: str,
      },
      required: ["name"],
      type: "object",
    },
    requester: {
      properties: { name: str, role: str },
      required: ["name"],
      type: "object",
    },
  },
  required: ["account"],
  type: "object",
};

const draft = {
  properties: {
    description: { maxLength: 2000, minLength: 1, type: "string" },
    title: { maxLength: 120, minLength: 3, type: "string" },
  },
  required: ["title", "description"],
  type: "object",
};

export const signalSchemas = {
  SignalActor: actor,
  SignalCandidate: {
    properties: {
      featureRequestId: { format: "uuid", type: "string" },
      reason: nullableStr,
      sharedDimension: nullableStr,
      title: str,
      verdict: { enum: ["same_need", "related_need", "different", "unknown"], type: "string" },
    },
    required: ["featureRequestId", "title", "verdict", "reason", "sharedDimension"],
    type: "object",
  },
  SignalCheckInput: {
    properties: {
      actor: ref("SignalActor"),
      draft: ref("SignalDraft"),
      onBehalfOf: ref("SignalOnBehalfOf"),
    },
    required: ["draft", "actor"],
    type: "object",
  },
  SignalCheckResult: {
    properties: {
      candidates: { items: ref("SignalCandidate"), type: "array" },
      checkId: { format: "uuid", type: "string" },
      consideredCount: { type: "integer" },
      degraded: { type: "boolean" },
      expiresAt: { format: "date-time", type: "string" },
      nextAction: {
        enum: ["support_or_comment", "create_with_related_link", "create"],
        type: "string",
      },
      underlyingNeed: nullableStr,
    },
    required: [
      "checkId",
      "expiresAt",
      "underlyingNeed",
      "candidates",
      "consideredCount",
      "nextAction",
      "degraded",
    ],
    type: "object",
  },
  SignalCommentInput: {
    properties: {
      actor: ref("SignalActor"),
      body: { maxLength: 2000, minLength: 1, type: "string" },
      checkId: { format: "uuid", type: "string" },
      onBehalfOf: ref("SignalOnBehalfOf"),
    },
    required: ["actor", "body"],
    type: "object",
  },
  SignalCreateInput: {
    properties: {
      actor: ref("SignalActor"),
      checkId: { format: "uuid", type: "string" },
      draft: ref("SignalDraft"),
      onBehalfOf: ref("SignalOnBehalfOf"),
      skipReason: {
        description: "Required when the Check found a Same Need candidate",
        maxLength: 500,
        minLength: 3,
        type: "string",
      },
    },
    required: ["draft", "actor"],
    type: "object",
  },
  SignalDraft: draft,
  SignalFeatureRequest: {
    description:
      "Feature Request; detail responses add supports, comments, relatedLinks, createdBy, onBehalfOf and skipReason.",
    properties: {
      accountCount: { type: "integer" },
      createdAt: { format: "date-time", type: "string" },
      description: str,
      id: { format: "uuid", type: "string" },
      supportCount: { type: "integer" },
      title: str,
      underlyingNeed: nullableStr,
    },
    required: ["id", "title", "description", "supportCount", "accountCount"],
    type: "object",
  },
  SignalFeatureRequestDetail: {
    allOf: [
      ref("SignalFeatureRequest"),
      {
        properties: {
          comments: {
            items: {
              properties: {
                account: nullableStr,
                actor: ref("SignalActor"),
                body: str,
                createdAt: dateTime,
                id: uuid,
                via,
              },
              required: ["id", "body", "actor", "account", "createdAt"],
              type: "object",
            },
            type: "array",
          },
          createdBy: ref("SignalActor"),
          duplicateOf: {
            description: "The canonical Feature Request when this one is a confirmed duplicate",
            oneOf: [featureRequestRef, { type: "null" }],
          },
          duplicates: {
            description:
              "Confirmed duplicates with their original words, Account and requester; their Supports and Comments appear here with via; accountCount counts each Account once across Supports and duplicates' originating Accounts",
            items: duplicateEvidence,
            type: "array",
          },
          onBehalfOf: {
            properties: { account: nullableStr, requester: nullableStr },
            type: "object",
          },
          relatedLinks: {
            items: {
              properties: {
                featureRequestId: uuid,
                reason: str,
                sharedDimension: str,
                title: str,
              },
              type: "object",
            },
            type: "array",
          },
          reviewHistory: {
            description: "Review Decisions involving this Feature Request, undone ones included",
            items: ref("SignalReviewDecision"),
            type: "array",
          },
          skipReason: nullableStr,
          supports: {
            items: {
              properties: {
                account: accountView,
                actor: ref("SignalActor"),
                createdAt: dateTime,
                id: uuid,
                quote: nullableStr,
                requester: nullableStr,
                via,
              },
              required: ["id", "account", "actor", "createdAt", "quote", "requester"],
              type: "object",
            },
            type: "array",
          },
        },
        required: ["supports", "comments", "relatedLinks", "createdBy", "onBehalfOf", "skipReason"],
        type: "object",
      },
    ],
  },
  SignalMetrics: metricsSchema,
  SignalOnBehalfOf: onBehalfOf,
  SignalReviewDecideInput: {
    description:
      "Duplicate needs otherId and canonicalId (one of the pair); Related needs otherId and sharedDimension; Distinct needs otherId; none takes neither. Rule violations return invalid_decision.",
    properties: {
      actor: ref("SignalActor"),
      canonicalId: uuid,
      decision: { enum: ["duplicate", "related", "distinct", "none"], type: "string" },
      featureRequestId: uuid,
      otherId: uuid,
      sharedDimension: { maxLength: 200, minLength: 1, type: "string" },
      suggestionId: { ...uuid, description: "The suspected duplicate this decision answers" },
    },
    required: ["actor", "decision", "featureRequestId"],
    type: "object",
  },
  SignalReviewDecision: {
    properties: {
      actor: ref("SignalActor"),
      canonicalId: nullableUuid,
      createdAt: dateTime,
      decision: { enum: ["duplicate", "related", "distinct", "none"], type: "string" },
      featureRequestId: uuid,
      id: uuid,
      otherId: nullableUuid,
      sharedDimension: nullableStr,
      suggestionId: nullableUuid,
      undoneAt: { format: "date-time", type: ["string", "null"] },
      undoneBy: { oneOf: [ref("SignalActor"), { type: "null" }] },
    },
    required: [
      "id",
      "featureRequestId",
      "otherId",
      "decision",
      "canonicalId",
      "sharedDimension",
      "suggestionId",
      "actor",
      "createdAt",
      "undoneAt",
      "undoneBy",
    ],
    type: "object",
  },
  SignalReviewQueue: {
    properties: {
      counts: {
        properties: { backlog: integer, new: integer },
        required: ["backlog", "new"],
        type: "object",
      },
      items: {
        items: {
          properties: {
            featureRequest: ref("SignalFeatureRequest"),
            isNew: {
              description: "Created through a Check; otherwise pre-Signal backlog",
              type: "boolean",
            },
            suspicions: {
              items: {
                properties: {
                  decision: { oneOf: [ref("SignalReviewDecision"), { type: "null" }] },
                  judgedAt: dateTime,
                  model: nullableStr,
                  other: ref("SignalFeatureRequest"),
                  reason: str,
                  source: { enum: ["check", "scan"], type: "string" },
                  suggestionId: uuid,
                },
                required: [
                  "suggestionId",
                  "other",
                  "reason",
                  "source",
                  "judgedAt",
                  "model",
                  "decision",
                ],
                type: "object",
              },
              type: "array",
            },
          },
          required: ["featureRequest", "isNew", "suspicions"],
          type: "object",
        },
        type: "array",
      },
    },
    required: ["counts", "items"],
    type: "object",
  },
  SignalScanInput: {
    properties: {
      limit: {
        description: "Feature Requests to scan in this call; the rest stay for the next call",
        maximum: 50,
        minimum: 1,
        type: "integer",
      },
    },
    type: "object",
  },
  SignalScanResult: {
    properties: { pairsFound: integer, remaining: integer, scanned: integer },
    required: ["scanned", "pairsFound", "remaining"],
    type: "object",
  },
  SignalSupportInput: {
    properties: {
      actor: ref("SignalActor"),
      checkId: { format: "uuid", type: "string" },
      onBehalfOf: ref("SignalOnBehalfOf"),
      quote: { maxLength: 500, type: "string" },
    },
    required: ["actor", "onBehalfOf"],
    type: "object",
  },
  SignalUndoInput: {
    properties: { actor: ref("SignalActor") },
    required: ["actor"],
    type: "object",
  },
};

const tags = ["signal"];

export const signalPaths = {
  "/api/checks": {
    post: {
      description:
        "Call before creating a Feature Request. Returns the Draft's Underlying Need, a Verdict with Reason per close candidate, and the next action.",
      operationId: "checkFeatureRequest",
      requestBody: jsonBody("SignalCheckInput"),
      responses: {
        "200": ok("Check result", ref("SignalCheckResult")),
        "400": invalidInput,
        "429": rateLimited,
        "503": unavailable,
      },
      summary: "Check a Draft before filing",
      tags,
    },
  },
  "/api/feature-requests": {
    get: {
      operationId: "searchFeatureRequests",
      parameters: [
        {
          description: "Semantic query",
          in: "query",
          name: "q",
          schema: { maxLength: 200, type: "string" },
        },
        { in: "query", name: "limit", schema: { maximum: 50, minimum: 1, type: "integer" } },
        { in: "query", name: "cursor", schema: { minimum: 0, type: "integer" } },
      ],
      responses: {
        "200": ok("Page of Feature Requests", {
          properties: {
            items: { items: ref("SignalFeatureRequest"), type: "array" },
            nextCursor: { type: ["integer", "null"] },
          },
          required: ["items", "nextCursor"],
          type: "object",
        }),
        "400": invalidInput,
        "503": unavailable,
      },
      summary: "Search or list Feature Requests",
      tags,
    },
    post: {
      description:
        "Requires a recent, unused Check (checkId) for the same Draft; omitting it returns check_required.",
      operationId: "createFeatureRequest",
      requestBody: jsonBody("SignalCreateInput"),
      responses: {
        "201": ok("Created", {
          properties: { featureRequest: ref("SignalFeatureRequest") },
          required: ["featureRequest"],
          type: "object",
        }),
        "400": invalidInput,
        "409": err("Check missing, already used, or Draft differs from the Check", [
          "check_required",
          "check_mismatch",
        ]),
        "410": err("Check expired", ["check_expired"]),
        "422": err("Same Need found; a Skip Reason is required", ["skip_reason_required"]),
        "429": rateLimited,
        "503": unavailable,
      },
      summary: "Create a Feature Request",
      tags,
    },
  },
  "/api/feature-requests/{id}": {
    get: {
      operationId: "getFeatureRequest",
      parameters: [idParameter],
      responses: {
        "200": ok("Feature Request detail", ref("SignalFeatureRequestDetail")),
        "404": notFound,
        "503": unavailable,
      },
      summary: "Get a Feature Request",
      tags,
    },
  },
  "/api/feature-requests/{id}/comments": {
    post: {
      operationId: "commentOnFeatureRequest",
      parameters: [idParameter],
      requestBody: jsonBody("SignalCommentInput"),
      responses: {
        "201": ok("Comment added", {
          properties: { comment: { type: "object" } },
          required: ["comment"],
          type: "object",
        }),
        "400": invalidInput,
        "404": notFound,
        "429": rateLimited,
        "503": unavailable,
      },
      summary: "Comment on a Feature Request",
      tags,
    },
  },
  "/api/feature-requests/{id}/supports": {
    post: {
      operationId: "supportFeatureRequest",
      parameters: [idParameter],
      requestBody: jsonBody("SignalSupportInput"),
      responses: {
        "201": ok("Support added", {
          properties: { featureRequest: ref("SignalFeatureRequest"), support: { type: "object" } },
          required: ["support", "featureRequest"],
          type: "object",
        }),
        "400": invalidInput,
        "404": notFound,
        "409": err("The Account already supports it; body includes the existing support", [
          "already_supported",
        ]),
        "429": rateLimited,
        "503": unavailable,
      },
      summary: "Support a Feature Request for an Account",
      tags,
    },
  },
  "/api/metrics": {
    get: {
      operationId: "getSignalMetrics",
      responses: {
        "200": ok("Signal metrics, each rate with its counts", ref("SignalMetrics")),
        "503": unavailable,
      },
      summary: "Prevention and review metrics",
      tags,
    },
  },
  "/api/review/decisions": {
    post: {
      description:
        "Operator access only. Confirm Duplicate, Related, Distinct, or none (no duplicate).",
      operationId: "decideReview",
      requestBody: jsonBody("SignalReviewDecideInput"),
      responses: {
        "201": ok("Decision recorded", {
          properties: { decision: ref("SignalReviewDecision") },
          required: ["decision"],
          type: "object",
        }),
        "400": invalidInput,
        "401": operatorRequired,
        "404": notFound,
        "422": err(
          "The decision breaks a rule (self-reference, chain, missing canonical or Shared Dimension)",
          ["invalid_decision"],
        ),
        "429": rateLimited,
        "503": operatorUnavailable,
      },
      security: operatorSecurity,
      summary: "Record a Review Decision",
      tags,
    },
  },
  "/api/review/decisions/{id}/undo": {
    post: {
      description:
        "Operator access only. Ends the decision's effect; the decision and its undo stay in history.",
      operationId: "undoReviewDecision",
      parameters: [{ ...idParameter, description: "Review Decision id (uuid)" }],
      requestBody: jsonBody("SignalUndoInput"),
      responses: {
        "200": ok("Decision undone", {
          properties: { decision: ref("SignalReviewDecision") },
          required: ["decision"],
          type: "object",
        }),
        "400": invalidInput,
        "401": operatorRequired,
        "404": err("Review Decision not found", ["not_found"]),
        "409": err("The decision was already undone", ["already_undone"]),
        "429": rateLimited,
        "503": operatorUnavailable,
      },
      security: operatorSecurity,
      summary: "Undo a Review Decision",
      tags,
    },
  },
  "/api/review/queue": {
    get: {
      description:
        "Open read. New Feature Requests not yet reviewed and backlog Feature Requests with undecided suspected duplicates, each with the AI's Reason.",
      operationId: "getReviewQueue",
      responses: {
        "200": ok("Review Queue", ref("SignalReviewQueue")),
        "503": unavailable,
      },
      summary: "Read the Review Queue",
      tags,
    },
  },
  "/api/review/scan": {
    post: {
      description:
        "Operator access only. Judges unscanned backlog Feature Requests for suspected duplicates (paid AI calls); call again while remaining > 0.",
      operationId: "scanBacklog",
      requestBody: {
        content: { "application/json": { schema: ref("SignalScanInput") } },
        required: false,
      },
      responses: {
        "200": ok("Scan progress", ref("SignalScanResult")),
        "400": invalidInput,
        "401": operatorRequired,
        "429": rateLimited,
        "503": operatorUnavailable,
      },
      security: operatorSecurity,
      summary: "Scan the backlog for suspected duplicates",
      tags,
    },
  },
};

export const signalTag = { description: "Check before create (Feature Requests)", name: "signal" };

const featureRequestId = { maxLength: 200, minLength: 1, type: "string" };

/** Signal tools on the public MCP, listed as `McpTool_*` components with `x-mcp-tool`. */
export const signalMcpTools = {
  check_feature_request: {
    operationId: "mcpCheckFeatureRequest",
    requestBody: {
      properties: {
        actor: ref("SignalActor"),
        draft: ref("SignalDraft"),
        onBehalfOf: ref("SignalOnBehalfOf"),
      },
      required: ["draft", "actor"],
      type: "object",
    },
    summary:
      "Check a Draft before creating: Underlying Need and Same Need / Related Need verdicts with Reasons",
  },
  comment_on_feature_request: {
    operationId: "mcpCommentOnFeatureRequest",
    requestBody: {
      properties: {
        actor: ref("SignalActor"),
        body: { maxLength: 2000, minLength: 1, type: "string" },
        featureRequestId,
        onBehalfOf: ref("SignalOnBehalfOf"),
      },
      required: ["featureRequestId", "actor", "body"],
      type: "object",
    },
    summary: "Comment on a Feature Request",
  },
  create_feature_request: {
    operationId: "mcpCreateFeatureRequest",
    requestBody: {
      properties: {
        actor: ref("SignalActor"),
        checkId: {
          description: "From check_feature_request; omitting it returns check_required",
          format: "uuid",
          type: "string",
        },
        draft: ref("SignalDraft"),
        onBehalfOf: ref("SignalOnBehalfOf"),
        skipReason: { maxLength: 500, minLength: 3, type: "string" },
      },
      required: ["draft", "actor"],
      type: "object",
    },
    summary:
      "Create a Feature Request after a Check (Skip Reason required after a Same Need verdict)",
  },
  get_feature_request: {
    operationId: "mcpGetFeatureRequest",
    requestBody: {
      properties: { featureRequestId },
      required: ["featureRequestId"],
      type: "object",
    },
    summary: "Get a Feature Request with Supports by Account, Comments and Related Links",
  },
  search_feature_requests: {
    operationId: "mcpSearchFeatureRequests",
    requestBody: {
      properties: {
        cursor: { minimum: 0, type: "integer" },
        limit: { maximum: 50, minimum: 1, type: "integer" },
        q: { maxLength: 200, type: "string" },
      },
      type: "object",
    },
    summary: "Semantic search over Feature Requests",
  },
  support_feature_request: {
    operationId: "mcpSupportFeatureRequest",
    requestBody: {
      properties: {
        actor: ref("SignalActor"),
        checkId: { format: "uuid", type: "string" },
        featureRequestId,
        onBehalfOf: ref("SignalOnBehalfOf"),
        quote: { maxLength: 500, type: "string" },
      },
      required: ["featureRequestId", "actor", "onBehalfOf"],
      type: "object",
    },
    summary: "Support an existing Feature Request on behalf of an Account",
  },
};
