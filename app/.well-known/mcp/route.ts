import { resolveSiteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => {
  const origin = resolveSiteOrigin(request);
  const serverCard = `${origin}/.well-known/mcp/server-card.json`;
  return Response.json(
    {
      serverCard,
      serverCards: [serverCard],
    },
    {
      headers: {
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
};
