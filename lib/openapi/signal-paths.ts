/** OpenAPI fragments for the Signal check-before-create REST routes (spec 001). */

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

const str = { type: "string" };
const nullableStr = { type: ["string", "null"] };

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
    required: ["checkId", "draft", "actor"],
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
  SignalOnBehalfOf: onBehalfOf,
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
      description: "Requires a recent Check (checkId) for the same Draft.",
      operationId: "createFeatureRequest",
      requestBody: jsonBody("SignalCreateInput"),
      responses: {
        "201": ok("Created", {
          properties: { featureRequest: ref("SignalFeatureRequest") },
          required: ["featureRequest"],
          type: "object",
        }),
        "400": invalidInput,
        "409": err("Check missing or Draft differs from the Check", [
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
        "200": ok("Feature Request detail", ref("SignalFeatureRequest")),
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
        "200": ok("Signal metrics", {
          properties: {
            checks: { type: "integer" },
            checksWithSameNeed: { type: "integer" },
            createsAfterSameNeed: { type: "integer" },
            fragmentationRate: { type: "null" },
            reviewCoverage: { const: 0 },
            suggestionAcceptance: { type: ["number", "null"] },
          },
          type: "object",
        }),
        "503": unavailable,
      },
      summary: "Check-before-create metrics",
      tags,
    },
  },
};

export const signalTag = { description: "Check before create (Feature Requests)", name: "signal" };
