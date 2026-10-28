import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "@/lib/openapi/build-openapi-document";

describe("OpenAPI document for Signal routes", () => {
  const doc = buildOpenApiDocument("https://example.com");

  it.each([
    ["/api/checks", "post", "checkFeatureRequest"],
    ["/api/feature-requests", "post", "createFeatureRequest"],
    ["/api/feature-requests", "get", "searchFeatureRequests"],
    ["/api/feature-requests/{id}", "get", "getFeatureRequest"],
    ["/api/feature-requests/{id}/supports", "post", "supportFeatureRequest"],
    ["/api/feature-requests/{id}/comments", "post", "commentOnFeatureRequest"],
    ["/api/metrics", "get", "getSignalMetrics"],
  ])("lists %s %s as %s", (path, method, operationId) => {
    const item = (doc.paths as Record<string, Record<string, { operationId: string }>>)[path];
    expect(item?.[method]?.operationId).toBe(operationId);
  });

  it("documents the error codes for create", () => {
    const create = (
      doc.paths as Record<string, Record<string, { responses: Record<string, unknown> }>>
    )["/api/feature-requests"]?.post;
    expect(Object.keys(create?.responses ?? {})).toEqual(
      expect.arrayContaining(["201", "400", "409", "410", "422", "429", "503"]),
    );
  });

  it.each([
    "check_feature_request",
    "create_feature_request",
    "support_feature_request",
    "comment_on_feature_request",
    "search_feature_requests",
    "get_feature_request",
  ])("catalogs MCP tool %s with x-mcp-tool and a description", (tool) => {
    const schemas = doc.components.schemas as Record<string, Record<string, unknown>>;
    const schema = schemas[`McpTool_${tool}`];
    expect(schema?.["x-mcp-tool"]).toBe(tool);
    expect(schema?.description).toEqual(expect.any(String));
    expect(schema?.type).toBe("object");
  });
});
