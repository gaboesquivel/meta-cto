import { operatorAccessDeniedResponse, verifyOperatorRequest } from "@/lib/auth/operator-access";
import { resolvePilotAccess } from "@/lib/auth/pilot-access";
import { createOperatorMcpServer } from "@/lib/mcp/create-operator-mcp-server";
import { handleMcpRequest } from "@/lib/mcp/handle-mcp-request";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handleOperatorMcp = (request: Request) => {
  const access = verifyOperatorRequest(request);
  if (!access.ok) return operatorAccessDeniedResponse({ reason: access.reason });

  // Operator access first; the Pilot Key header then binds the review tools to the Pilot Workspace.
  const pilot = resolvePilotAccess(request);
  return handleMcpRequest({
    createServer: () => createOperatorMcpServer({ access: pilot }),
    request,
  });
};

export const POST = handleOperatorMcp;
export const GET = handleOperatorMcp;
export const DELETE = handleOperatorMcp;
export const OPTIONS = () =>
  new Response(null, {
    headers: {
      Allow: "GET, POST, DELETE, OPTIONS",
    },
    status: 204,
  });
