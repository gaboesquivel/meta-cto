import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";

import {
  GENUI_PREVIEW_RESOURCE_URI,
  genuiPreviewResourceDescription,
  readGenuiPreviewHtml,
} from "./genui-preview-resource";
import { registerStarterMcpTools } from "./register-tools";

export const createStarterMcpServer = () => {
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
  return server;
};
