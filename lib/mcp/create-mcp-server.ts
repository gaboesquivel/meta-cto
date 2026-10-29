import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";
import type { PilotAccess } from "@/lib/auth/pilot-access";

import {
  GENUI_PREVIEW_RESOURCE_URI,
  genuiPreviewResourceDescription,
  readGenuiPreviewHtml,
} from "./genui-preview-resource";
import { registerReviewMcpTools } from "./register-review-tools";
import { registerSignalMcpTools } from "./register-signal-tools";
import { registerStarterMcpTools } from "./register-tools";

/**
 * The public MCP. `access` comes from the Pilot Key header: the demo (default) gets the Signal
 * tools on the Crewday Demo Workspace; the Pilot Key gets them on the Pilot Workspace plus the
 * review tools bound to it; a refused key gets Signal tools that each return `pilot_key_required`.
 */
export const createStarterMcpServer = ({
  access = { kind: "demo" },
}: { access?: PilotAccess } = {}) => {
  const server = new McpServer({
    name: "meta-cto",
    version: "1.0.0",
  });

  registerAppResource(
    server,
    "GenUI Preview",
    GENUI_PREVIEW_RESOURCE_URI,
    {
      description: genuiPreviewResourceDescription,
    },
    async () => ({
      contents: [
        {
          mimeType: RESOURCE_MIME_TYPE,
          text: await readGenuiPreviewHtml(),
          uri: GENUI_PREVIEW_RESOURCE_URI,
        },
      ],
    }),
  );

  registerStarterMcpTools(server);
  registerSignalMcpTools(server, access);
  if (access.kind === "pilot") registerReviewMcpTools(server, { origin: "pilot" });
  return server;
};
