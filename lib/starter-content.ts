export const starterHomeMarkdown = `# Agentic application starter

MCP-first and API-first web shell with GenUI composition, Eve agent tools, and agent discovery surfaces.

## Capabilities

- **Web:** prompt-driven UI generation with OpenUI Lang and shadcn components (\`POST /api/genui/compose\`).
- **Chat:** sidebar assistant at \`/api/chat\` (optional Anthropic key).
- **MCP:** Streamable HTTP at \`/api/mcp\` with \`compose_ui\` and catalog tools.
- **Discovery:** \`llms.txt\`, \`.well-known/mcp/*\`, OpenAPI at \`/openapi.json\`.

## Quick start

1. Install dependencies and copy env defaults.
2. Optional: set \`AI_GATEWAY_API_KEY\` for open-ended generation.
3. Run \`pnpm dev\` and open the home page. The GenUI playground is at \`/genui\`.
4. Try: "customer support dashboard", "compare orbit and nova plans", or "pricing comparison".

Database migrations are available when \`DATABASE_URL\` is set; the GenUI demo does not require persisted data.
`;
