import { SignalError } from "@/lib/signal/contracts";
import { PILOT_KEY_ENV, PILOT_KEY_HEADER, PILOT_KEY_MIN_LENGTH } from "@/lib/signal/pilot";

import { verifyOperatorRequest } from "./operator-access";
import { pilotKeyRefusal, requirePilotAccess } from "./pilot-access";
import type { PilotAccess, PilotRefusalReason } from "./pilot-access";

/**
 * Proof Report access (spec 003): the Pilot Key or Operator access, nothing else. Operator access
 * works even when no Pilot Key is configured; without either, the read is refused (503 when the
 * Pilot Key is unset, so it fails closed).
 */
export type ProofAccess =
  | { error: SignalError; ok: false }
  | { ok: true; via: "operator" | "pilot" };

const EITHER = `Send the Pilot Key in the ${PILOT_KEY_HEADER} header (REST or the public MCP), or use Operator access: Authorization: Bearer <OPERATOR_SECRET> on REST or the Operator MCP (/api/mcp/operator), or sign in at /operator/access to open /proof.`;

const MESSAGES: Record<PilotRefusalReason, { message: string; resolution: string }> = {
  disabled: {
    message:
      "The Pilot Workspace is not configured on this deployment, so the Proof Report is readable only with Operator access.",
    resolution: `Ask the operator to set ${PILOT_KEY_ENV} (min ${PILOT_KEY_MIN_LENGTH} characters), or use Operator access: Authorization: Bearer <OPERATOR_SECRET> on REST or the Operator MCP, or sign in at /operator/access.`,
  },
  invalid: {
    message: "The Pilot Key is wrong (invalid); the Proof Report was refused.",
    resolution: `Check the key with the operator and retry. ${EITHER}`,
  },
  missing: {
    message: "The Proof Report needs the Pilot Key or Operator access; neither was sent.",
    resolution: EITHER,
  },
};

/** `pilot_key_required` with the Proof Report's wording; status and `details.reason` as for pilot reads. */
export const proofRefusal = (reason: PilotRefusalReason): SignalError =>
  new SignalError({
    code: "pilot_key_required",
    details: { reason },
    ...MESSAGES[reason],
    status: pilotKeyRefusal(reason).status,
  });

/** Public MCP: only the Pilot Key grants the report there (no header is refused as missing). */
export const proofAccessForPilot = (access: PilotAccess): ProofAccess => {
  if (access.kind === "pilot") return { ok: true, via: "pilot" };
  return { error: proofRefusal(access.kind === "demo" ? "missing" : access.reason), ok: false };
};

/** REST: Operator access (Bearer, X-Operator-Secret or session) or the Pilot Key. */
export const resolveProofAccess = (request: Request): ProofAccess => {
  if (verifyOperatorRequest(request).ok) return { ok: true, via: "operator" };
  const pilot = requirePilotAccess(request);
  if (pilot.kind === "pilot") return { ok: true, via: "pilot" };
  return { error: proofRefusal(pilot.kind === "refused" ? pilot.reason : "missing"), ok: false };
};
