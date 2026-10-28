import assert from "node:assert/strict";
import { test } from "vitest";

import { GET as getApiCatchAll } from "../app/api/[...path]/route";
import { GET as getChat } from "../app/api/chat/route";
import { GET as getOpenApi } from "../app/openapi.json/route";
import { buildOpenApiDocument } from "../lib/openapi/build-openapi-document";

test("openapi.json route returns OpenAPI 3.1 with MCP and tool paths", async () => {
  const response = getOpenApi(new Request("https://example.com/openapi.json"));
  assert.equal(response.status, 200);
  const doc = await response.json();
  assert.equal(doc.openapi, "3.1.0");
  assert.ok(doc.paths["/api/mcp"]?.post?.operationId === "mcpStreamableHttp");
  assert.ok(doc.paths["/api/chat"]?.post?.operationId === "starterChat");
  assert.ok(doc.paths["/api/genui/compose"]?.post?.operationId === "genuiCompose");
  const composeSchema = doc.components?.schemas?.McpTool_compose_ui as {
    "x-mcp-tool"?: string;
  };
  assert.equal(composeSchema?.["x-mcp-tool"], "compose_ui");
  assert.ok(doc.components?.schemas?.ApiError);
});

test("buildOpenApiDocument catalogs compose_ui with x-mcp-tool", () => {
  const doc = buildOpenApiDocument("https://example.com");
  const schemas = doc.components.schemas as Record<string, unknown>;
  const compose = schemas.McpTool_compose_ui as {
    "x-mcp-tool"?: string;
    description?: string;
  };
  assert.equal(compose["x-mcp-tool"], "compose_ui");
  assert.match(compose.description ?? "", /OpenUI/u);
});

test("GET /api/chat returns JSON error", async () => {
  const response = await getChat();
  assert.equal(response.status, 405);
  const body = await response.json();
  assert.equal(body.code, "method_not_allowed");
});

test("unknown API path returns JSON 404", async () => {
  const response = getApiCatchAll();
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.code, "api_route_not_found");
});
