import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";

import { jsonError, withExtraHeaders } from "@/lib/api/json-error";
import { mergeResponseHeaders } from "@/lib/api/rate-limit-headers";

import { consumeMcpRateLimit } from "./rate-limit";

export const handleMcpRequest = async ({
  createServer,
  request,
}: {
  createServer: () => McpServer;
  request: Request;
}) => {
  const { headers: rateHeaders, limited } = consumeMcpRateLimit(request);
  if (limited) return mergeResponseHeaders(limited, rateHeaders);

  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request);
    return mergeResponseHeaders(response, rateHeaders);
  } catch (error) {
    return withExtraHeaders(
      jsonError({
        code: "mcp_handler_error",
        message: error instanceof Error ? error.message : "MCP request failed",
        resolution: "Verify JSON-RPC body and Accept headers for Streamable HTTP.",
        status: 500,
      }),
      rateHeaders,
    );
  } finally {
    await transport.close();
    await server.close();
  }
};
