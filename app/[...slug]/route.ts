import { notFound } from "next/navigation";

import { markdownResponse, wantsMarkdown } from "@/lib/markdown-negotiation";
import { resolveSiteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";

const knownPath = (pathname: string) => {
  if (pathname === "/" || pathname === "/favicon.ico") return true;
  const prefixes = [
    "/dev",
    "/genui",
    "/developers",
    "/operator",
    "/api",
    "/llms.txt",
    "/openapi.json",
    "/.well-known",
    "/sitemap.xml",
    "/markdown",
    "/eve",
    "/mcp",
  ];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
};

const notFoundMarkdown = (pathname: string, origin: string) =>
  `# Not found

The path \`${pathname}\` is not part of this app.

- Agent instructions: ${origin}/llms.txt
- Sitemap: ${origin}/sitemap.xml
- Home: ${origin}/
`;

export const GET = async (request: Request, context: { params: Promise<{ slug: string[] }> }) => {
  const { slug } = await context.params;
  const pathname = `/${slug.join("/")}`;
  if (knownPath(pathname)) notFound();

  const accept = request.headers.get("accept");
  if (!wantsMarkdown(accept)) notFound();
  const origin = resolveSiteOrigin(request);
  return markdownResponse(notFoundMarkdown(pathname, origin), 404);
};
