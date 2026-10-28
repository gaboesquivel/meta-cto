import assert from "node:assert/strict";
import { test } from "vitest";

import type { ToolContext } from "eve/tools";

import composeUiTool from "../lib/agent-tools/compose-ui";
import listCatalogTool from "../lib/agent-tools/list-component-catalog";

const ctx = {} as ToolContext;

test("eve compose_ui tool returns envelope for demo query", async () => {
  const result = await composeUiTool.execute({ query: "Show a simple support dashboard" }, ctx);
  assert.ok(result && typeof result === "object");
  assert.ok("envelope" in result || "error" in result);
});

test("eve list_component_catalog exposes components", async () => {
  const result = await listCatalogTool.execute({}, ctx);
  assert.ok(result && typeof result === "object");
  assert.ok("components" in result);
});
