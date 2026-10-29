import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";

import { PILOT_KEY_HEADER } from "@/lib/signal/pilot";

import { pilotKeyRefusal, requirePilotAccess, resolvePilotAccess } from "./pilot-access";

const KEY = "pilot-key-for-tests-0123";

const request = (key?: string) =>
  new Request("http://localhost/api/checks", {
    headers: key === undefined ? {} : { [PILOT_KEY_HEADER]: key },
  });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolvePilotAccess", () => {
  it("is the demo caller when no Pilot Key header is sent", () => {
    vi.stubEnv("SIGNAL_PILOT_KEY", KEY);
    assert.deepEqual(resolvePilotAccess(request()), { kind: "demo" });
  });

  it("selects the Pilot Workspace with the configured key", () => {
    vi.stubEnv("SIGNAL_PILOT_KEY", KEY);
    assert.deepEqual(resolvePilotAccess(request(KEY)), { kind: "pilot" });
  });

  it("refuses a wrong key", () => {
    vi.stubEnv("SIGNAL_PILOT_KEY", KEY);
    assert.deepEqual(resolvePilotAccess(request("not-the-pilot-key-at-all")), {
      kind: "refused",
      reason: "invalid",
    });
  });

  it("refuses an empty key header as missing", () => {
    vi.stubEnv("SIGNAL_PILOT_KEY", KEY);
    assert.deepEqual(resolvePilotAccess(request("  ")), { kind: "refused", reason: "missing" });
  });

  it("fails closed when the key is not configured, even for the right-looking key", () => {
    vi.stubEnv("SIGNAL_PILOT_KEY", undefined);
    assert.deepEqual(resolvePilotAccess(request(KEY)), { kind: "refused", reason: "disabled" });
  });

  it("treats a key shorter than 16 characters as not configured", () => {
    vi.stubEnv("SIGNAL_PILOT_KEY", "short");
    assert.deepEqual(resolvePilotAccess(request("short")), {
      kind: "refused",
      reason: "disabled",
    });
  });
});

describe("requirePilotAccess", () => {
  it("refuses a request without the header as missing (pilot-only reads)", () => {
    vi.stubEnv("SIGNAL_PILOT_KEY", KEY);
    assert.deepEqual(requirePilotAccess(request()), { kind: "refused", reason: "missing" });
    assert.deepEqual(requirePilotAccess(request(KEY)), { kind: "pilot" });
  });
});

describe("pilotKeyRefusal", () => {
  it("says which problem it is, with a distinct code and a resolution", () => {
    const missing = pilotKeyRefusal("missing");
    const invalid = pilotKeyRefusal("invalid");
    const disabled = pilotKeyRefusal("disabled");
    for (const error of [missing, invalid, disabled]) {
      assert.equal(error.code, "pilot_key_required");
      assert.ok(error.resolution.length > 0);
    }
    assert.equal(missing.status, 401);
    assert.equal(invalid.status, 401);
    assert.equal(disabled.status, 503);
    assert.deepEqual(missing.details, { reason: "missing" });
    assert.match(missing.message, /missing/iu);
    assert.match(invalid.message, /wrong|invalid/iu);
    assert.match(disabled.message, /not configured/iu);
    assert.doesNotMatch(disabled.resolution + invalid.resolution, new RegExp(KEY, "u"));
  });
});
