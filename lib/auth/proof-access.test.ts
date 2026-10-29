import { afterEach, describe, expect, it, vi } from "vitest";

import { PILOT_KEY_HEADER } from "@/lib/signal/pilot";

import { OPERATOR_SESSION_COOKIE, signOperatorSession } from "./operator-access";
import { proofAccessForPilot, resolveProofAccess } from "./proof-access";

const KEY = "pilot-key-for-tests-0123";
const SECRET = "test-operator-secret-16+";

const request = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/proof", { headers });

const refusal = (headers: Record<string, string> = {}) => {
  const access = resolveProofAccess(request(headers));
  if (access.ok) throw new Error("expected a refusal");
  return access.error;
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveProofAccess", () => {
  it("grants the Pilot Key", () => {
    vi.stubEnv("SIGNAL_PILOT_KEY", KEY);
    expect(resolveProofAccess(request({ [PILOT_KEY_HEADER]: KEY }))).toEqual({
      ok: true,
      via: "pilot",
    });
  });

  it("grants Operator access by Bearer or session, even with no Pilot Key configured", () => {
    vi.stubEnv("SIGNAL_PILOT_KEY", undefined);
    vi.stubEnv("OPERATOR_SECRET", SECRET);
    expect(resolveProofAccess(request({ authorization: `Bearer ${SECRET}` }))).toEqual({
      ok: true,
      via: "operator",
    });
    const cookie = `${OPERATOR_SESSION_COOKIE}=${signOperatorSession({ token: SECRET })}`;
    expect(resolveProofAccess(request({ cookie }))).toEqual({ ok: true, via: "operator" });
  });

  it("refuses with neither, naming both ways in", () => {
    vi.stubEnv("SIGNAL_PILOT_KEY", KEY);
    vi.stubEnv("OPERATOR_SECRET", SECRET);
    const error = refusal();
    expect(error.code).toBe("pilot_key_required");
    expect(error.status).toBe(401);
    expect(error.details).toEqual({ reason: "missing" });
    expect(error.message).toMatch(/Pilot Key or Operator access/u);
    expect(error.resolution).toMatch(new RegExp(PILOT_KEY_HEADER, "u"));
    expect(error.resolution).toMatch(/OPERATOR_SECRET/u);
  });

  it("refuses a wrong Pilot Key or a wrong Operator secret", () => {
    vi.stubEnv("SIGNAL_PILOT_KEY", KEY);
    vi.stubEnv("OPERATOR_SECRET", SECRET);
    expect(refusal({ [PILOT_KEY_HEADER]: "not-the-pilot-key-at-all" }).details).toEqual({
      reason: "invalid",
    });
    expect(refusal({ authorization: "Bearer wrong-operator-secret-000" }).status).toBe(401);
  });

  it("fails closed (503) when no Pilot Key is configured and the caller is not an Operator", () => {
    vi.stubEnv("SIGNAL_PILOT_KEY", undefined);
    vi.stubEnv("OPERATOR_SECRET", undefined);
    vi.stubEnv("OPERATOR_ACCESS_TOKEN", undefined);
    const error = refusal({ [PILOT_KEY_HEADER]: KEY });
    expect(error.status).toBe(503);
    expect(error.details).toEqual({ reason: "disabled" });
    expect(error.resolution).toMatch(/SIGNAL_PILOT_KEY/u);
  });
});

describe("proofAccessForPilot (public MCP)", () => {
  it("grants only the Pilot Workspace caller", () => {
    expect(proofAccessForPilot({ kind: "pilot" })).toEqual({ ok: true, via: "pilot" });
  });

  it("refuses the demo caller as a missing key, and passes a refusal reason through", () => {
    const demo = proofAccessForPilot({ kind: "demo" });
    expect(demo.ok).toBe(false);
    if (!demo.ok) expect(demo.error.details).toEqual({ reason: "missing" });
    const invalid = proofAccessForPilot({ kind: "refused", reason: "invalid" });
    if (invalid.ok) throw new Error("expected a refusal");
    expect(invalid.error.details).toEqual({ reason: "invalid" });
  });
});
