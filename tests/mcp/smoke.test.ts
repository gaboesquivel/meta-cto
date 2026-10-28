import assert from "node:assert/strict";
import { test } from "vitest";

import { createStarterMcpServer } from "../../lib/mcp/create-mcp-server";

test("createStarterMcpServer constructs without throw", () => {
  const server = createStarterMcpServer();
  assert.ok(server);
});
