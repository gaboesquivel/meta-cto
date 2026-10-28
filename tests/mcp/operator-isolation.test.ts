import assert from "node:assert/strict";
import { test } from "vitest";

import { POST as postPublicMcp } from "../../app/api/mcp/route";
import { POST as postOperatorMcp } from "../../app/api/mcp/operator/route";
import { operatorMcpToolNames } from "../../lib/mcp/register-operator-tools";

const mcpHeaders = {
  Accept: "application/json, text/event-stream",
  "Content-Type": "application/json",
};

const mcpPost = (
  handler: (request: Request) => Response | Promise<Response>,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) =>
  handler(
    new Request("http://meta-cto.localhost/api/mcp", {
      body: JSON.stringify(body),
      headers: { ...mcpHeaders, ...extraHeaders },
      method: "POST",
    }),
  );

test("public MCP tools/list excludes operator-only tools", async () => {
  const response = await mcpPost(postPublicMcp, {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/list",
    params: {},
  });
  assert.equal(response.status, 200);
  const json = (await response.json()) as {
    result?: { tools?: { name: string }[] };
  };
  const names = new Set((json.result?.tools ?? []).map((tool) => tool.name));
  for (const operatorTool of operatorMcpToolNames) assert.equal(names.has(operatorTool), false);
});

test("operator MCP fails closed when OPERATOR_SECRET unset", async () => {
  const previous = process.env.OPERATOR_SECRET;
  delete process.env.OPERATOR_SECRET;
  delete process.env.OPERATOR_ACCESS_TOKEN;
  try {
    const response = await mcpPost(postOperatorMcp, {
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
        protocolVersion: "2025-03-26",
      },
    });
    assert.equal(response.status, 503);
  } finally {
    if (previous !== undefined) process.env.OPERATOR_SECRET = previous;
  }
});

test("operator MCP rejects missing bearer token when configured", async () => {
  const previous = process.env.OPERATOR_SECRET;
  process.env.OPERATOR_SECRET = "test-operator-token-16chars";
  delete process.env.OPERATOR_ACCESS_TOKEN;
  try {
    const response = await mcpPost(postOperatorMcp, {
      id: 1,
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
        protocolVersion: "2025-03-26",
      },
    });
    assert.equal(response.status, 401);
  } finally {
    if (previous === undefined) delete process.env.OPERATOR_SECRET;
    else process.env.OPERATOR_SECRET = previous;
  }
});
