import { createHmac, timingSafeEqual } from "node:crypto";

export const OPERATOR_SESSION_COOKIE = "flow_operator_session";

/** Canonical: `OPERATOR_SECRET`. `OPERATOR_ACCESS_TOKEN` is accepted for older env files. */
export const getOperatorAccessToken = () =>
  process.env.OPERATOR_SECRET?.trim() ?? process.env.OPERATOR_ACCESS_TOKEN?.trim() ?? "";

export const isOperatorAccessConfigured = () => getOperatorAccessToken().length >= 16;

export const signOperatorSession = ({ token }: { token: string }) =>
  createHmac("sha256", token).update("flow-template-operator-v1").digest("hex");

export const readOperatorSessionCookie = (request: Request) => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${OPERATOR_SESSION_COOKIE}=([^;]+)`, "u"),
  );
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
};

const readBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) return;
  const token = authorization.slice(7).trim();
  if (token.length === 0) return;
  return token;
};

export const verifyOperatorRequest = (request: Request) => {
  if (!isOperatorAccessConfigured()) return { ok: false as const, reason: "disabled" as const };

  const configured = getOperatorAccessToken();
  const bearer = readBearerToken(request);
  const headerSecret = request.headers.get("x-operator-secret")?.trim();
  const token = bearer ?? headerSecret ?? "";

  if (token) {
    if (!safeEqual(token, configured))
      return { ok: false as const, reason: "unauthorized" as const };
    return { ok: true as const };
  }

  const session = readOperatorSessionCookie(request);
  const expected = signOperatorSession({ token: configured });
  if (!session || !safeEqual(session, expected))
    return { ok: false as const, reason: "unauthorized" as const };

  return { ok: true as const };
};

const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};

export const operatorAccessDeniedResponse = ({
  reason,
}: {
  reason: "disabled" | "unauthorized";
}) => {
  if (reason === "disabled")
    return Response.json(
      {
        code: "operator_disabled",
        message: "Operator access is not configured.",
        resolution: "Set OPERATOR_SECRET (min 16 characters) in the deployment environment.",
      },
      { status: 503 },
    );

  return Response.json(
    {
      code: "operator_unauthorized",
      message: "Operator credentials are invalid or missing.",
      resolution: "Send Authorization: Bearer <OPERATOR_SECRET> or establish an operator session.",
    },
    { status: 401 },
  );
};
