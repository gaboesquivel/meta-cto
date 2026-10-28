import { GENUI_PREVIEW_RESOURCE_URI } from "./genui-preview-resource";

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
];

export const buildMcpServerCard = (origin: string) => ({
  authentication: { required: false },
  description: "Agentic UI starter — compose OpenUI layouts with synthetic data over MCP.",
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
      description: "Meta Cto MCP — GenUI compose and catalog tools.",
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
