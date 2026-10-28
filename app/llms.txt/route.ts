import { resolveSiteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const body = (origin: string) => `# Agentic application starter

> MCP-first and API-first web shell with GenUI (OpenUI Lang + shadcn), Eve agent tools, and discovery endpoints.

## When to use this starter

Use when you need a web UI that generates declarative compositions from natural language, exposes the same capability over MCP, and documents agent entrypoints (\`llms.txt\`, OpenAPI, well-known MCP).

## Human routes

- ${origin}/ (home)
- ${origin}/genui (GenUI playground — prompt + chat sidebar + preview)
- ${origin}/dev (MCP and API links)

## Agent interoperability

- OpenAPI 3.1: ${origin}/openapi.json
- MCP server card: ${origin}/.well-known/mcp/server-card.json
- MCP registry: ${origin}/.well-known/mcp.json
- Streamable HTTP MCP: ${origin}/api/mcp
- GenUI compose API: POST ${origin}/api/genui/compose
- Sitemap: ${origin}/sitemap.xml

## Tools (MCP)

compose_ui — generate a validated OpenUI composition from a natural-language UI request (synthetic data).
list_component_catalog — introspect registered GenUI components.
health — liveness for protocol clients.
`;

export const GET = (request: Request) =>
  new Response(body(resolveSiteOrigin(request)), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
