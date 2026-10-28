type HeaderLike = Pick<Headers, "get">;

const requestFromHeaderList = (headerList: HeaderLike) => {
  const host = headerList.get("host") ?? headerList.get("x-forwarded-host");
  const normalizedHost = host?.split(",")[0]?.trim();
  if (!normalizedHost) return;
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  return new Request(`${proto}://${normalizedHost}/`);
};

export const resolveSiteOriginFromHeaderList = (headerList: HeaderLike) =>
  resolveSiteOrigin(requestFromHeaderList(headerList));

export const resolveSiteOrigin = (request?: Request) => {
  const fromEnv = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/u, "");

  if (request) {
    try {
      const { hostname, origin } = new URL(request.url);
      if (hostname) return origin;
    } catch {
      // fall through to headers / env
    }

    const host = request.headers.get("host") ?? request.headers.get("x-forwarded-host");
    if (host) {
      const normalizedHost = host.split(",")[0]?.trim();
      if (normalizedHost) {
        const proto = request.headers.get("x-forwarded-proto") ?? "https";
        return `${proto}://${normalizedHost}`;
      }
    }
  }

  const vercelProduction = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercelProduction) {
    const host = vercelProduction.replace(/^https?:\/\//u, "").replace(/\/$/u, "");
    return `https://${host}`;
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/u, "")}`;

  const agentic = process.env.AGENTIC_CHECK_URL?.trim();
  if (agentic) {
    const host = agentic.replace(/^https?:\/\//u, "").replace(/\/$/u, "");
    return `https://${host}`;
  }

  return "http://localhost:3000";
};
