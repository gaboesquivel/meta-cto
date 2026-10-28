import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { test } from "vitest";

import { createStarterMcpServer } from "../../lib/mcp/create-mcp-server";
import {
  genuiPreviewHtmlPath,
  GENUI_PREVIEW_RESOURCE_URI,
} from "../../lib/mcp/genui-preview-resource";

test("GenUI preview bundle exists on disk after build:mcp-app", async () => {
  await access(genuiPreviewHtmlPath());
});

test("MCP server registers GenUI preview resource", () => {
  const server = createStarterMcpServer();
  assert.ok(server);
  assert.equal(GENUI_PREVIEW_RESOURCE_URI, "ui://genui/preview");
});
