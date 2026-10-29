import { withExtraHeaders } from "@/lib/api/json-error";
import { resolveProofAccess } from "@/lib/auth/proof-access";
import { toErrorResponse } from "@/lib/signal/http";
import { getProofReport } from "@/lib/signal/proof/sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The Proof Report (spec 003): each preset bar with its value, counts, 95% interval where it
 * applies, and pass, fail or inconclusive, plus the consequences. Read-only. Needs the Pilot Key
 * (x-signal-pilot-key) or Operator access; refused otherwise with pilot_key_required (503 when no
 * Pilot Key is configured and the caller is not an Operator).
 */
export const GET = async (request: Request) => {
  const access = resolveProofAccess(request);
  if (!access.ok) return withExtraHeaders(await toErrorResponse(access.error), NO_STORE);
  try {
    return Response.json(await getProofReport(), { headers: NO_STORE });
  } catch (error) {
    return withExtraHeaders(await toErrorResponse(error), NO_STORE);
  }
};
