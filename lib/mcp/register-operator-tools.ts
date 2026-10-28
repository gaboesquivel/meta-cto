import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { getOperatorAccessToken, isOperatorAccessConfigured } from "@/lib/auth/operator-access";

import { starterMcpToolCatalog } from "./tool-catalog";
import { asToolResult } from "./tool-result";

const plainToolMeta = { _meta: {} };

export const operatorMcpToolNames = [
  "operator_health",
  "config_status",
  "public_tool_catalog",
] as const;

export const registerOperatorMcpTools = (server: McpServer) => {
  registerAppTool(
    server,
    "operator_health",
    {
      ...plainToolMeta,
      description: "Protected liveness check for the Operator MCP server (owner only).",
      inputSchema: { ping: z.boolean().optional() },
    },
    () =>
      asToolResult({
        ok: true,
        role: "operator",
        service: "meta-cto-operator-mcp",
      }),
  );

  registerAppTool(
    server,
    "config_status",
    {
      ...plainToolMeta,
      description: "Report non-secret configuration status for diagnostics (owner only).",
      inputSchema: { verbose: z.boolean().optional() },
    },
    ({ verbose }) =>
      asToolResult({
        aiGateway: Boolean(process.env.AI_GATEWAY_API_KEY?.trim()),
        anthropicChat: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
        eveModel: process.env.EVE_AGENT_MODEL?.trim() ?? "anthropic/claude-sonnet-4-20250514",
        operatorConfigured: isOperatorAccessConfigured(),
        operatorTokenLength: getOperatorAccessToken().length,
        verbose: verbose ?? false,
      }),
  );

  registerAppTool(
    server,
    "public_tool_catalog",
    {
      ...plainToolMeta,
      description: "List public Assistant MCP tools (diagnostic; does not expose operator tools).",
      inputSchema: { detail: z.boolean().optional() },
    },
    () =>
      asToolResult({
        publicTools: starterMcpToolCatalog.map((tool) => tool.name),
      }),
  );
};
