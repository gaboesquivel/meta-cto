import { discoveryRateLimitHeaders } from "@/lib/api/rate-limit-headers";
import { resolveSiteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => {
  const origin = resolveSiteOrigin(request);
  return Response.json(
    {
      description: "Starter HTTP APIs for chat, GenUI compose, and MCP",
      documentation: `${origin}/dev`,
      links: {
        chat: `${origin}/api/chat`,
        mcp: `${origin}/api/mcp`,
        openapi: `${origin}/openapi.json`,
      },
      title: "Meta Cto API",
    },
    {
      headers: discoveryRateLimitHeaders(),
    },
  );
};
