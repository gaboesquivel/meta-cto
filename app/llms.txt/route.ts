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

## Signal (feature requests)

Always check a Draft before creating a Feature Request: Signal returns its Underlying Need and a Same Need / Related Need verdict with a Reason for each similar request.

- REST: POST ${origin}/api/checks, GET|POST ${origin}/api/feature-requests, GET ${origin}/api/feature-requests/{id}, POST ${origin}/api/feature-requests/{id}/supports, POST ${origin}/api/feature-requests/{id}/comments, GET ${origin}/api/metrics
- UI: ${origin}/requests

## Tools (MCP)

check_feature_request — check a Draft before creating: Underlying Need and Same Need / Related Need verdicts with Reasons.
create_feature_request — create after a Check; a Skip Reason is required after a Same Need verdict.
support_feature_request — support an existing Feature Request on behalf of an Account.
comment_on_feature_request — comment on a Feature Request.
search_feature_requests — semantic search over Feature Requests.
get_feature_request — a Feature Request with Supports by Account, Comments and Related Links.
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
