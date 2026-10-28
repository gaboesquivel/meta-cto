import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";

import { resolveSiteOriginFromHeaderList } from "@/lib/site-url";

export const metadata: Metadata = {
  title: "Developers",
};

export default async function DevPage() {
  const headerList = await headers();
  const origin = resolveSiteOriginFromHeaderList(headerList);

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-8">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Developers</h1>
        <p className="text-muted-foreground text-sm">
          MCP-first and API-first surfaces for agents and integrations.
        </p>
      </header>
      <ul className="space-y-3 text-sm">
        <li>
          <Link className="text-primary underline" href="/genui">
            GenUI playground
          </Link>
        </li>
        <li>
          <a className="text-primary underline" href={`${origin}/llms.txt`}>
            llms.txt
          </a>
        </li>
        <li>
          <a className="text-primary underline" href={`${origin}/openapi.json`}>
            OpenAPI
          </a>
        </li>
        <li>
          <a className="text-primary underline" href={`${origin}/.well-known/mcp/server-card.json`}>
            MCP server card
          </a>
        </li>
        <li>
          <code className="bg-muted rounded px-1 py-0.5 text-xs">POST {origin}/api/mcp</code>
        </li>
        <li>
          <code className="bg-muted rounded px-1 py-0.5 text-xs">
            POST {origin}/api/genui/compose
          </code>
        </li>
      </ul>
    </main>
  );
}
