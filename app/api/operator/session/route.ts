import {
  OPERATOR_SESSION_COOKIE,
  getOperatorAccessToken,
  isOperatorAccessConfigured,
  operatorAccessDeniedResponse,
  signOperatorSession,
  verifyOperatorRequest,
} from "@/lib/auth/operator-access";

export const runtime = "nodejs";

export const GET = (request: Request) => {
  const access = verifyOperatorRequest(request);
  if (!access.ok) return operatorAccessDeniedResponse({ reason: access.reason });
  return Response.json({ ok: true, role: "operator" });
};

export const POST = async (request: Request) => {
  if (!isOperatorAccessConfigured()) return operatorAccessDeniedResponse({ reason: "disabled" });

  let token = "";
  try {
    const body = (await request.json()) as { token?: string };
    token = body.token?.trim() ?? "";
  } catch {
    return Response.json(
      {
        code: "invalid_json",
        message: "Expected JSON body with token.",
      },
      { status: 400 },
    );
  }

  const configured = getOperatorAccessToken();
  if (token !== configured) return operatorAccessDeniedResponse({ reason: "unauthorized" });

  const session = signOperatorSession({ token: configured });
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": `${OPERATOR_SESSION_COOKIE}=${encodeURIComponent(session)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
      },
    },
  );
};

export const DELETE = () =>
  new Response(null, {
    headers: {
      "Set-Cookie": `${OPERATOR_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
    },
    status: 204,
  });
