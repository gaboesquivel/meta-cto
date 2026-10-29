import { timingSafeEqual } from "node:crypto";

import { SignalError } from "@/lib/signal/contracts";
import { PILOT_KEY_ENV, PILOT_KEY_HEADER, PILOT_KEY_MIN_LENGTH } from "@/lib/signal/pilot";

/** Why a pilot request was refused: no key sent, the wrong key, or no key configured. */
export type PilotRefusalReason = "disabled" | "invalid" | "missing";

/**
 * Whom a request acts for. No Pilot Key header is the Crewday demo caller, exactly as before
 * spec 003; a valid key is the Pilot Workspace; anything else is refused, never demo.
 */
export type PilotAccess =
  | { kind: "demo" }
  | { kind: "pilot" }
  | { kind: "refused"; reason: PilotRefusalReason };

export const getPilotKey = () => process.env[PILOT_KEY_ENV]?.trim() ?? "";

export const isPilotAccessConfigured = () => getPilotKey().length >= PILOT_KEY_MIN_LENGTH;

const safeEqual = (left: string, right: string) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

const checkKey = (sent: string): PilotAccess => {
  if (!isPilotAccessConfigured()) return { kind: "refused", reason: "disabled" };
  if (!sent) return { kind: "refused", reason: "missing" };
  if (!safeEqual(sent, getPilotKey())) return { kind: "refused", reason: "invalid" };
  return { kind: "pilot" };
};

/** Resolves the caller from the Pilot Key header; a request without the header is the demo. */
export const resolvePilotAccess = (request: Request): PilotAccess => {
  const sent = request.headers.get(PILOT_KEY_HEADER);
  if (sent === null) return { kind: "demo" };
  return checkKey(sent.trim());
};

/** For pilot-only surfaces (e.g. the Proof Report): no header is refused as `missing`. */
export const requirePilotAccess = (request: Request): PilotAccess =>
  checkKey(request.headers.get(PILOT_KEY_HEADER)?.trim() ?? "");

const SEND_KEY = `Send the Pilot Key in the ${PILOT_KEY_HEADER} header (REST and the public MCP endpoint), or drop the header to use the Crewday Demo Workspace.`;

/** Actionable refusal: one code, with `details.reason` and a message that says which problem. */
export const pilotKeyRefusal = (reason: PilotRefusalReason) => {
  if (reason === "disabled")
    return new SignalError({
      code: "pilot_key_required",
      details: { reason },
      message: "The Pilot Workspace is not configured on this deployment, so pilot access is off.",
      resolution: `Ask the operator to set ${PILOT_KEY_ENV} (min ${PILOT_KEY_MIN_LENGTH} characters), or drop the ${PILOT_KEY_HEADER} header to use the Crewday Demo Workspace.`,
      status: 503,
    });
  if (reason === "missing")
    return new SignalError({
      code: "pilot_key_required",
      details: { reason },
      message: "The Pilot Key is missing; the Pilot Workspace needs it.",
      resolution: SEND_KEY,
      status: 401,
    });
  return new SignalError({
    code: "pilot_key_required",
    details: { reason },
    message: "The Pilot Key is wrong (invalid); the request was refused.",
    resolution: `Check the key with the operator and retry. ${SEND_KEY}`,
    status: 401,
  });
};
