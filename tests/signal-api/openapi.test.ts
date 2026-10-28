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
});
