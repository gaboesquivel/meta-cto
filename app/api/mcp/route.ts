import { createStarterMcpServer } from "@/lib/mcp/create-mcp-server";
import { handleMcpRequest } from "@/lib/mcp/handle-mcp-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handleMcp = (request: Request) =>
  handleMcpRequest({ createServer: createStarterMcpServer, request });

export const POST = handleMcp;
export const GET = handleMcp;
export const DELETE = handleMcp;
export const OPTIONS = () =>
  new Response(null, {
    headers: {
      Allow: "GET, POST, DELETE, OPTIONS",
    },
    status: 204,
  });
