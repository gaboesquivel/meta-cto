import assert from "node:assert/strict";
import { test } from "vitest";

import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";

import { POST as postApiMcp } from "../../app/api/mcp/route";
import { POST as postMcpAlias } from "../../app/mcp/route";
import { GENUI_PREVIEW_RESOURCE_URI } from "../../lib/mcp/genui-preview-resource";
import { starterMcpToolCatalog } from "../../lib/mcp/tool-catalog";

const mcpHeaders = {
  Accept: "application/json, text/event-stream",
  "Content-Type": "application/json",
};

const mcpPost = (handler: typeof postApiMcp, body: unknown, accept?: string) =>
  handler(
    new Request("http://app.localhost/api/mcp", {
      body: JSON.stringify(body),
      headers: {
        ...mcpHeaders,
        ...(accept ? { Accept: accept } : {}),
      },
      method: "POST",
    }),
  );

test("POST /api/mcp initialize returns 200", async () => {
  const response = await mcpPost(postApiMcp, {
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      capabilities: {},
      clientInfo: { name: "route-test", version: "1.0.0" },
      protocolVersion: "2025-03-26",
    },
  });
  assert.equal(response.status, 200);
  const json = (await response.json()) as {
    result?: { serverInfo?: { name?: string } };
  };
  assert.equal(json.result?.serverInfo?.name, "meta-cto");
});

test("POST /api/mcp tools/list returns starter tools", async () => {
  const response = await mcpPost(postApiMcp, {
    id: 2,
    jsonrpc: "2.0",
    method: "tools/list",
    params: {},
  });
  assert.equal(response.status, 200);
  const json = (await response.json()) as {
    result?: {
      tools?: {
        _meta?: { ui?: { resourceUri?: string } };
        name: string;
      }[];
    };
  };
  const tools = json.result?.tools ?? [];
  const names = tools.map((t) => t.name).toSorted();
  const expected = starterMcpToolCatalog.map((t) => t.name).toSorted();
  assert.deepEqual(names, expected);
  const compose = tools.find((t) => t.name === "compose_ui");
  assert.equal(compose?._meta?.ui?.resourceUri, GENUI_PREVIEW_RESOURCE_URI);
});

test("POST /api/mcp resources/list includes GenUI preview", async () => {
  const response = await mcpPost(postApiMcp, {
    id: 10,
    jsonrpc: "2.0",
    method: "resources/list",
    params: {},
  });
  assert.equal(response.status, 200);
  const json = (await response.json()) as {
    result?: { resources?: { uri?: string }[] };
  };
  const uris = (json.result?.resources ?? []).map((r) => r.uri);
  assert.ok(uris.includes(GENUI_PREVIEW_RESOURCE_URI));
});

test("POST /api/mcp resources/read returns MCP App HTML", async () => {
  const response = await mcpPost(postApiMcp, {
    id: 11,
    jsonrpc: "2.0",
    method: "resources/read",
    params: { uri: GENUI_PREVIEW_RESOURCE_URI },
  });
  assert.equal(response.status, 200);
  const json = (await response.json()) as {
    result?: {
      contents?: { mimeType?: string; text?: string; uri?: string }[];
    };
  };
  const content = json.result?.contents?.[0];
  assert.equal(content?.uri, GENUI_PREVIEW_RESOURCE_URI);
  assert.equal(content?.mimeType, RESOURCE_MIME_TYPE);
  assert.match(content?.text ?? "", /<html/iu);
});

test("POST /api/mcp tools/call compose_ui returns envelope", async () => {
  const response = await mcpPost(postApiMcp, {
    id: 3,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      arguments: { query: "customer support dashboard" },
      name: "compose_ui",
    },
  });
  assert.equal(response.status, 200);
  const json = (await response.json()) as {
    result?: { content?: { text?: string }[] };
  };
  const text = json.result?.content?.[0]?.text ?? "";
  assert.match(text, /envelope|openuiText/u);
});

test("POST /api/mcp compose_ui reports failure without credentials for open layout", async () => {
  const prior = process.env.AI_GATEWAY_API_KEY;
  delete process.env.AI_GATEWAY_API_KEY;
  try {
    const response = await mcpPost(postApiMcp, {
      id: 4,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          query: "Design a surprise me custom layout with novel widgets",
        },
        name: "compose_ui",
      },
    });
    assert.equal(response.status, 200);
    const json = (await response.json()) as {
      result?: {
        content?: { text?: string }[];
        structuredContent?: { error?: string; failureCode?: string };
      };
    };
    const structured = json.result?.structuredContent;
    assert.equal(structured?.error, "composition_failed");
    assert.equal(structured?.failureCode, "missing_credentials");
  } finally {
    if (prior === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = prior;
  }
});

test("POST /mcp alias matches /api/mcp initialize", async () => {
  const body = {
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      capabilities: {},
      clientInfo: { name: "alias-test", version: "1.0.0" },
      protocolVersion: "2025-03-26",
    },
  };
  const api = await mcpPost(postApiMcp, body);
  const alias = await mcpPost(postMcpAlias, body);
  assert.equal(api.status, 200);
  assert.equal(alias.status, 200);
});
