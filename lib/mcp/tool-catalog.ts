import { GENUI_PREVIEW_RESOURCE_URI } from "./genui-preview-resource";
import { PROOF_REPORT_TOOL, proofReportToolDescription } from "./register-proof-tools";
import { signalMcpToolNames, signalToolDescriptions } from "./signal-tool-descriptions";

const starterMcpAppResourceUri = GENUI_PREVIEW_RESOURCE_URI;

export interface StarterMcpToolCard {
  description: string;
  name: string;
}

export const starterMcpToolCatalog: StarterMcpToolCard[] = [
  {
    description: "Liveness check for the MCP server.",
    name: "health",
  },
  {
    description: "List registered GenUI root components.",
    name: "list_component_catalog",
  },
  {
    description: "Generate a validated OpenUI composition from a natural-language UI request.",
    name: "compose_ui",
  },
  ...signalMcpToolNames.map((name) => ({ description: signalToolDescriptions[name], name })),
  { description: proofReportToolDescription, name: PROOF_REPORT_TOOL },
];

export const buildMcpServerCard = (origin: string) => ({
  authentication: { required: false },
  description:
    "Signal — check feature requests for the same need before creating them, then support, comment or create over MCP. Also composes OpenUI layouts with synthetic data.",
  resources: [
    {
      description: "GenUI Preview MCP App",
      mimeType: "text/html;profile=mcp-app",
      uri: starterMcpAppResourceUri,
    },
  ],
  serverInfo: {
    name: "meta-cto",
    title: "Meta Cto MCP",
    version: "1.0.0",
  },
  tools: starterMcpToolCatalog,
  transport: {
    endpoint: `${origin}/api/mcp`,
    type: "streamable-http",
  },
  version: "1.0",
});

export const buildMcpRegistryManifest = (origin: string) => ({
  mcpServers: {
    "meta-cto": {
      transport: {
        type: "http",
        url: `${origin}/api/mcp`,
      },
    },
  },
  serverCard: `${origin}/.well-known/mcp/server-card.json`,
});

export const buildAiCatalog = (origin: string) => ({
  servers: [
    {
      description:
        "Meta Cto MCP — Signal feature request tools (check before create) and GenUI compose tools.",
      name: "meta-cto",
      transport: {
        type: "streamable-http",
        url: `${origin}/api/mcp`,
      },
      url: `${origin}/.well-known/mcp/server-card.json`,
    },
  ],
  version: "1.0",
});
