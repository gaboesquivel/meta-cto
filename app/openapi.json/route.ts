import { discoveryRateLimitHeaders } from "@/lib/api/rate-limit-headers";
import { buildOpenApiDocument } from "@/lib/openapi/build-openapi-document";
import { resolveSiteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export const GET = (request: Request) => {
  const doc = buildOpenApiDocument(resolveSiteOrigin(request));
  return Response.json(doc, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "application/json; charset=utf-8",
      ...discoveryRateLimitHeaders(),
    },
  });
};
