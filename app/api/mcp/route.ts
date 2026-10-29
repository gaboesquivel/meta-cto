import { resolvePilotAccess } from "@/lib/auth/pilot-access";
import { createStarterMcpServer } from "@/lib/mcp/create-mcp-server";
import { handleMcpRequest } from "@/lib/mcp/handle-mcp-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The Pilot Key header (x-signal-pilot-key) selects the Pilot Workspace; none is the demo. */
const handleMcp = (request: Request) => {
  const access = resolvePilotAccess(request);
  return handleMcpRequest({ createServer: () => createStarterMcpServer({ access }), request });
};

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
