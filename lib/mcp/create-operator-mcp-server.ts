import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/server";

import {
  GENUI_PREVIEW_RESOURCE_URI,
  genuiPreviewResourceDescription,
  readGenuiPreviewHtml,
} from "./genui-preview-resource";
import { registerOperatorMcpTools } from "./register-operator-tools";
import { registerReviewMcpTools } from "./register-review-tools";
import { registerStarterMcpTools } from "./register-tools";

export const createOperatorMcpServer = () => {
  const server = new McpServer({
    name: "meta-cto-operator",
    version: "1.0.0",
  });

  registerAppResource(
    server,
    "GenUI Preview (Operator)",
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
  registerOperatorMcpTools(server);
  registerReviewMcpTools(server);
  return server;
};
