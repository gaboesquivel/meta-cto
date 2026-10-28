import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import type { CompositionEnvelope } from "@/lib/genui";
import {
  componentNames,
  composeQueryToEnvelope,
  compositionGuidance,
  GENUI_LIBRARY_VERSION,
  MAX_QUERY_CODE_POINTS,
} from "@/lib/genui";
import { z } from "zod";

import { GENUI_PREVIEW_RESOURCE_URI } from "./genui-preview-resource";
import { asToolResult } from "./tool-result";

const previewToolMeta = {
  _meta: { ui: { resourceUri: GENUI_PREVIEW_RESOURCE_URI } },
};

const plainToolMeta = { _meta: {} };

export const registerStarterMcpTools = (server: McpServer) => {
  registerAppTool(
    server,
    "health",
    {
      ...plainToolMeta,
      description: "Liveness check for the MCP server.",
      inputSchema: { ping: z.boolean().optional() },
    },
    () => asToolResult({ ok: true, service: "meta-cto-mcp" }),
  );

  registerAppTool(
    server,
    "list_component_catalog",
    {
      ...plainToolMeta,
      description: "List registered GenUI root components and composition guidance.",
      inputSchema: { detail: z.boolean().optional() },
    },
    () =>
      asToolResult({
        components: componentNames,
        guidance: compositionGuidance,
      }),
  );

  registerAppTool(
    server,
    "compose_ui",
    {
      description:
        "Generate a validated OpenUI composition from a natural-language UI request using synthetic data.",
      inputSchema: {
        mode: z.enum(["create", "refine"]).optional(),
        priorEnvelope: z
          .object({
            fallbackText: z.string(),
            libraryVersion: z.literal(GENUI_LIBRARY_VERSION),
            openuiText: z.string(),
            records: z.array(z.record(z.string(), z.unknown())),
            requestId: z.string(),
          })
          .optional(),
        query: z.string().min(1).max(MAX_QUERY_CODE_POINTS),
        turns: z
          .array(
            z.object({
              content: z.string(),
              role: z.enum(["assistant", "user"]),
            }),
          )
          .max(12)
          .optional(),
      },
      ...previewToolMeta,
    },
    async ({ mode, priorEnvelope, query, turns }) => {
      const clientRequestId = `mcp-${Date.now()}`;
      const { envelope, result } = await composeQueryToEnvelope({
        input: {
          clientRequestId,
          mode,
          priorEnvelope: priorEnvelope as CompositionEnvelope | undefined,
          query,
          turns,
          version: 1,
        },
      });
      if (!envelope || result.metadata.outcome !== "success")
        return asToolResult({
          error: "composition_failed",
          failureCode: result.metadata.failureCode,
          validationOk: result.metadata.validationOk,
        });
      return asToolResult({
        envelope,
        metadata: result.metadata,
      });
    },
  );
};
