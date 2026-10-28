export const mcpRateLimitPolicy = { limit: 120, windowSeconds: 60 };

export const buildRateLimitHeaders = ({
  limit = mcpRateLimitPolicy.limit,
  remaining,
  resetAt,
  windowSeconds = mcpRateLimitPolicy.windowSeconds,
}: {
  limit?: number;
  remaining: number;
  resetAt: number;
  windowSeconds?: number;
}) => {
  const resetSeconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
  return {
    "RateLimit-Limit": String(limit),
    "RateLimit-Policy": `${limit};w=${windowSeconds}`,
    "RateLimit-Remaining": String(Math.max(0, remaining)),
    "RateLimit-Reset": String(resetSeconds),
  };
};

export const discoveryRateLimitHeaders = () =>
  buildRateLimitHeaders({
    remaining: mcpRateLimitPolicy.limit - 1,
    resetAt: Date.now() + mcpRateLimitPolicy.windowSeconds * 1000,
  });

export const mergeResponseHeaders = (response: Response, headers: Record<string, string>) => {
  const merged = new Response(response.body, response);
  for (const [key, value] of Object.entries(headers)) merged.headers.set(key, value);
  return merged;
};
