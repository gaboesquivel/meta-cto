import { jsonError, withExtraHeaders } from "@/lib/api/json-error";
import { discoveryRateLimitHeaders } from "@/lib/api/rate-limit-headers";

export const dynamic = "force-dynamic";

const handler = () =>
  withExtraHeaders(
    jsonError({
      code: "api_route_not_found",
      message: "No API route matches this path.",
      resolution: "See /openapi.json and /developers for supported endpoints.",
      status: 404,
    }),
    discoveryRateLimitHeaders(),
  );

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
