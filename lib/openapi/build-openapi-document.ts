const toolPaths = {
  compose_ui: {
    operationId: "composeUi",
    requestBody: {
      properties: {
        query: { maxLength: 2000, minLength: 1, type: "string" },
      },
      required: ["query"],
      type: "object",
    },
    summary: "Generate OpenUI composition from natural language",
  },
  health: {
    operationId: "health",
    requestBody: { properties: {}, type: "object" },
    summary: "MCP liveness check",
  },
  list_component_catalog: {
    operationId: "listComponentCatalog",
    requestBody: { properties: {}, type: "object" },
    summary: "List registered GenUI components",
  },
} as const;

const mcpToolSchemaName = (name: string) => `McpTool_${name.replaceAll("-", "_")}`;

const mcpToolComponents = Object.fromEntries(
  Object.entries(toolPaths).map(([name, spec]) => [
    mcpToolSchemaName(name),
    {
      description: spec.summary,
      "x-mcp-tool": name,
      ...spec.requestBody,
    },
  ]),
);

const apiVersionParameter = {
  description: "Optional API version. v1 is the current stable surface.",
  in: "header",
  name: "X-API-Version",
  required: false,
  schema: { default: "v1", enum: ["v1"], type: "string" },
};

const errorJsonContent = {
  "application/json": {
    schema: { $ref: "#/components/schemas/ApiError" },
  },
  "application/problem+json": {
    schema: { $ref: "#/components/schemas/ProblemDetails" },
  },
};

const openApiComponents = {
  headers: {
    RateLimitLimit: {
      description: "Maximum requests allowed in the current window.",
      schema: { example: "120", type: "string" },
    },
    RateLimitPolicy: {
      description: "Quota policy; see IETF RateLimit fields draft.",
      schema: { example: "120;w=60", type: "string" },
    },
    RateLimitRemaining: {
      description: "Requests remaining in the current window.",
      schema: { example: "119", type: "string" },
    },
    RateLimitReset: {
      description: "Seconds until the quota window resets.",
      schema: { example: "45", type: "string" },
    },
    RetryAfter: {
      description: "Seconds to wait before retrying after HTTP 429.",
      schema: { example: "60", type: "integer" },
    },
  },
  parameters: {
    ApiVersionHeader: apiVersionParameter,
  },
  responses: {
    BadRequest: {
      content: errorJsonContent,
      description: "Invalid request",
    },
    MethodNotAllowed: {
      content: errorJsonContent,
      description: "HTTP method not supported",
    },
    NotAcceptable: {
      content: errorJsonContent,
      description: "Invalid Accept header",
    },
    RateLimited: {
      content: errorJsonContent,
      description: "Rate limit exceeded",
      headers: {
        "RateLimit-Limit": { $ref: "#/components/headers/RateLimitLimit" },
        "RateLimit-Policy": { $ref: "#/components/headers/RateLimitPolicy" },
        "RateLimit-Remaining": {
          $ref: "#/components/headers/RateLimitRemaining",
        },
        "RateLimit-Reset": { $ref: "#/components/headers/RateLimitReset" },
        "Retry-After": { $ref: "#/components/headers/RetryAfter" },
      },
    },
    ServerError: {
      content: errorJsonContent,
      description: "Unexpected server error",
    },
    ServiceUnavailable: {
      content: errorJsonContent,
      description: "Dependency not configured or temporarily unavailable",
    },
  },
  schemas: {
    ApiError: {
      properties: {
        code: { description: "Machine-readable error code", type: "string" },
        error: { description: "Human-readable error message", type: "string" },
        resolution: {
          description: "Suggested remediation for agents and developers",
          type: "string",
        },
        type: { description: "Error type URI", format: "uri", type: "string" },
      },
      required: ["code", "error", "resolution", "type"],
      type: "object",
    },
    ProblemDetails: {
      description: "RFC 9457 problem details",
      properties: {
        detail: { type: "string" },
        status: { type: "integer" },
        title: { type: "string" },
        type: { format: "uri", type: "string" },
      },
      required: ["type", "title", "status"],
      type: "object",
    },
    ...mcpToolComponents,
  },
};

const stdErrorResponses = {
  "400": { $ref: "#/components/responses/BadRequest" },
  "405": { $ref: "#/components/responses/MethodNotAllowed" },
  "500": { $ref: "#/components/responses/ServerError" },
};

const mcpOperation = {
  description:
    "Model Context Protocol Streamable HTTP endpoint. Tool schemas use x-mcp-tool in components.schemas.",
  operationId: "mcpStreamableHttp",
  parameters: [{ $ref: "#/components/parameters/ApiVersionHeader" }],
  requestBody: {
    content: {
      "application/json": {
        schema: { type: "object" },
      },
    },
  },
  responses: {
    "200": {
      content: { "application/json": { schema: { type: "object" } } },
      description: "MCP JSON-RPC response",
      headers: {
        "RateLimit-Limit": { $ref: "#/components/headers/RateLimitLimit" },
        "RateLimit-Policy": { $ref: "#/components/headers/RateLimitPolicy" },
        "RateLimit-Remaining": {
          $ref: "#/components/headers/RateLimitRemaining",
        },
        "RateLimit-Reset": { $ref: "#/components/headers/RateLimitReset" },
      },
    },
    "406": { $ref: "#/components/responses/NotAcceptable" },
    "429": { $ref: "#/components/responses/RateLimited" },
    ...stdErrorResponses,
  },
  summary: "MCP Streamable HTTP transport",
  tags: ["mcp"],
};

const chatOperation = {
  description: "Sidebar assistant (Vercel AI SDK UI stream).",
  operationId: "starterChat",
  parameters: [{ $ref: "#/components/parameters/ApiVersionHeader" }],
  requestBody: {
    content: {
      "application/json": {
        schema: {
          properties: {
            messages: {
              items: {
                properties: {
                  content: { type: "string" },
                  role: { enum: ["user", "assistant"], type: "string" },
                },
                required: ["role", "content"],
                type: "object",
              },
              type: "array",
            },
          },
          required: ["messages"],
          type: "object",
        },
      },
    },
    required: true,
  },
  responses: {
    "200": { description: "text/event-stream UI message stream" },
    "400": { $ref: "#/components/responses/BadRequest" },
    "405": { $ref: "#/components/responses/MethodNotAllowed" },
    "503": { $ref: "#/components/responses/ServiceUnavailable" },
  },
  summary: "Chat assistant",
  tags: ["chat"],
};

const genuiOperation = {
  description: "GenUI composition stream (NDJSON). Uses synthetic demo data.",
  operationId: "genuiCompose",
  parameters: [{ $ref: "#/components/parameters/ApiVersionHeader" }],
  requestBody: {
    content: {
      "application/json": {
        schema: {
          properties: {
            clientRequestId: { minLength: 1, type: "string" },
            query: { maxLength: 2000, minLength: 1, type: "string" },
            version: { minimum: 1, type: "integer" },
          },
          required: ["clientRequestId", "query", "version"],
          type: "object",
        },
      },
    },
    required: true,
  },
  responses: {
    "200": {
      content: {
        "application/x-ndjson": {
          schema: { type: "object" },
        },
      },
      description: "NDJSON compose events",
    },
    "400": { $ref: "#/components/responses/BadRequest" },
    "405": { $ref: "#/components/responses/MethodNotAllowed" },
    "500": { $ref: "#/components/responses/ServerError" },
  },
  summary: "GenUI compose",
  tags: ["genui"],
};

const versioningDescription = `API versioning (v1): Prefer X-API-Version: v1 or /v1/api/* aliases. Demo starter: no authentication on MCP/HTTP surfaces.`;

export const buildOpenApiDocument = (origin: string) => {
  const paths = {
    "/api/chat": { post: chatOperation },
    "/api/genui/compose": { post: genuiOperation },
    "/api/mcp": { post: mcpOperation },
    "/v1/api/chat": {
      post: { ...chatOperation, operationId: "starterChatV1" },
    },
    "/v1/api/genui/compose": {
      post: { ...genuiOperation, operationId: "genuiComposeV1" },
    },
    "/v1/api/mcp": {
      post: { ...mcpOperation, operationId: "mcpStreamableHttpV1" },
    },
  };

  return {
    components: openApiComponents,
    externalDocs: {
      description: "Developer portal",
      url: `${origin}/dev`,
    },
    info: {
      description: `${versioningDescription}\n\nAgentic application starter — MCP tools via POST /api/mcp; GenUI via POST /api/genui/compose.`,
      title: "Meta Cto API",
      version: "1.0.0",
      "x-api-version": "v1",
    },
    openapi: "3.1.0",
    paths: Object.fromEntries(Object.entries(paths).toSorted(([a], [b]) => a.localeCompare(b))),
    servers: [{ description: "Current v1 base URL", url: origin }],
    tags: [
      { description: "Streamable HTTP MCP", name: "mcp" },
      { description: "GenUI NDJSON compose", name: "genui" },
      { description: "Chat assistant", name: "chat" },
    ],
  };
};
