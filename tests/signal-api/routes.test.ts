import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignalError } from "@/lib/signal/contracts";
import type { SignalService } from "@/lib/signal/contracts";
import { resetSignalWriteLimit, SIGNAL_WRITE_LIMIT } from "@/lib/signal/http";

import { POST as postCheck } from "../../app/api/checks/route";
import { POST as postComment } from "../../app/api/feature-requests/[id]/comments/route";
import { GET as getFeatureRequest } from "../../app/api/feature-requests/[id]/route";
import { POST as postSupport } from "../../app/api/feature-requests/[id]/supports/route";
import {
  GET as listFeatureRequests,
  POST as postFeatureRequest,
} from "../../app/api/feature-requests/route";
import { GET as getMetrics } from "../../app/api/metrics/route";
import {
  actor,
  CHECK_ID,
  checkResult,
  comment,
  draft,
  featureRequest,
  FR_ID,
  idParams,
  jsonRequest,
  makeService,
  metrics,
  onBehalfOf,
  support,
} from "./fixtures";

const state = vi.hoisted(() => ({ service: null as SignalService | null }));

vi.mock("@/lib/signal/runtime", () => ({
  getSignalService: () => state.service,
}));

let service: ReturnType<typeof makeService>;

beforeEach(() => {
  service = makeService();
  state.service = service;
  resetSignalWriteLimit();
});

const readBody = async (response: Response) => (await response.json()) as Record<string, unknown>;

const codeOf = async (response: Response) => {
  const body = await readBody(response);
  return body.code;
};

describe("POST /api/checks", () => {
  it("returns 200 with the CheckResult", async () => {
    const response = await postCheck(
      jsonRequest("/api/checks", { body: { actor, draft, onBehalfOf } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(checkResult);
    expect(service.check).toHaveBeenCalledWith({ actor, draft, onBehalfOf });
  });

  it("returns 400 invalid_input with issues for a bad body", async () => {
    const response = await postCheck(
      jsonRequest("/api/checks", { body: { actor, draft: { title: "x" } } }),
    );
    expect(response.status).toBe(400);
    const body = await readBody(response);
    expect(body.code).toBe("invalid_input");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.resolution).toEqual(expect.any(String));
    expect(service.check).not.toHaveBeenCalled();
  });

  it("returns 400 invalid_input for malformed JSON", async () => {
    const response = await postCheck(jsonRequest("/api/checks", { body: "{not json" }));
    expect(response.status).toBe(400);
    expect(await codeOf(response)).toBe("invalid_input");
  });

  it("returns 503 service_unavailable when the service is not configured", async () => {
    state.service = null;
    const response = await postCheck(jsonRequest("/api/checks", { body: { actor, draft } }));
    expect(response.status).toBe(503);
    const body = await readBody(response);
    expect(body.code).toBe("service_unavailable");
    expect(body.resolution).toBe("Set DATABASE_URL and AI_GATEWAY_API_KEY");
  });

  it("returns 500 internal_error for unexpected failures", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    service.check.mockRejectedValueOnce(new Error("boom"));
    const response = await postCheck(jsonRequest("/api/checks", { body: { actor, draft } }));
    expect(response.status).toBe(500);
    const body = await readBody(response);
    expect(body.code).toBe("internal_error");
    expect(body.error).not.toContain("boom");
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it("rate-limits writes per client IP with 429 and Retry-After", async () => {
    const ip = "203.0.113.9";
    const allowed = await Promise.all(
      Array.from({ length: SIGNAL_WRITE_LIMIT }, () =>
        postCheck(jsonRequest("/api/checks", { body: { actor, draft }, ip })),
      ),
    );
    expect(allowed.map((response) => response.status)).toEqual(
      Array.from({ length: SIGNAL_WRITE_LIMIT }, () => 200),
    );
    const limited = await postCheck(jsonRequest("/api/checks", { body: { actor, draft }, ip }));
    expect(limited.status).toBe(429);
    expect(await codeOf(limited)).toBe("rate_limited");
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);

    const otherIp = await postCheck(
      jsonRequest("/api/checks", { body: { actor, draft }, ip: "203.0.113.10" }),
    );
    expect(otherIp.status).toBe(200);
  });
});

describe("POST /api/feature-requests", () => {
  const body = { actor, checkId: CHECK_ID, draft, onBehalfOf };

  it("returns 201 with the created feature request", async () => {
    const response = await postFeatureRequest(jsonRequest("/api/feature-requests", { body }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ featureRequest });
    expect(service.create).toHaveBeenCalledWith(body);
  });

  it.each([
    ["check_required", 409],
    ["check_mismatch", 409],
    ["check_expired", 410],
    ["skip_reason_required", 422],
  ] as const)("maps SignalError %s to %i", async (code, status) => {
    service.create.mockRejectedValueOnce(
      new SignalError({ code, message: `msg ${code}`, resolution: `fix ${code}`, status }),
    );
    const response = await postFeatureRequest(jsonRequest("/api/feature-requests", { body }));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({
      code,
      error: `msg ${code}`,
      resolution: `fix ${code}`,
    });
  });

  it("returns 400 invalid_input when checkId is missing", async () => {
    const response = await postFeatureRequest(
      jsonRequest("/api/feature-requests", { body: { actor, draft } }),
    );
    expect(response.status).toBe(400);
    expect(await codeOf(response)).toBe("invalid_input");
  });
});

describe("GET /api/feature-requests", () => {
  it("returns 200 with items and nextCursor and passes parsed query", async () => {
    const response = await listFeatureRequests(
      jsonRequest("/api/feature-requests?q=shift%20swap&limit=20&cursor=0", { method: "GET" }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [featureRequest], nextCursor: 20 });
    expect(service.search).toHaveBeenCalledWith({ cursor: 0, limit: 20, q: "shift swap" });
  });

  it("returns 400 invalid_input for an out-of-range limit", async () => {
    const response = await listFeatureRequests(
      jsonRequest("/api/feature-requests?limit=500", { method: "GET" }),
    );
    expect(response.status).toBe(400);
    expect(await codeOf(response)).toBe("invalid_input");
  });

  it("is not rate-limited as a write", async () => {
    const ip = "198.51.100.1";
    const responses = await Promise.all(
      Array.from({ length: SIGNAL_WRITE_LIMIT + 1 }, () =>
        listFeatureRequests(jsonRequest("/api/feature-requests", { ip, method: "GET" })),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
  });

  it("rate-limits semantic search (q) as a write because it costs an embedding", async () => {
    const ip = "198.51.100.2";
    const allowed = await Promise.all(
      Array.from({ length: SIGNAL_WRITE_LIMIT }, () =>
        listFeatureRequests(jsonRequest("/api/feature-requests?q=shifts", { ip, method: "GET" })),
      ),
    );
    expect(allowed.every((response) => response.status === 200)).toBe(true);
    const limited = await listFeatureRequests(
      jsonRequest("/api/feature-requests?q=shifts", { ip, method: "GET" }),
    );
    expect(limited.status).toBe(429);
    expect(await codeOf(limited)).toBe("rate_limited");
  });

  it("does not rate-limit a blank q", async () => {
    const ip = "198.51.100.3";
    const responses = await Promise.all(
      Array.from({ length: SIGNAL_WRITE_LIMIT + 1 }, () =>
        listFeatureRequests(jsonRequest("/api/feature-requests?q=%20", { ip, method: "GET" })),
      ),
    );
    expect(responses.every((response) => response.status === 200)).toBe(true);
  });
});

describe("GET /api/feature-requests/[id]", () => {
  it("returns 200 with the detail", async () => {
    const response = await getFeatureRequest(
      jsonRequest(`/api/feature-requests/${FR_ID}`, { method: "GET" }),
      idParams(FR_ID),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(featureRequest);
    expect(service.get).toHaveBeenCalledWith(FR_ID);
  });

  it("returns 404 not_found from the service", async () => {
    service.get.mockRejectedValueOnce(
      new SignalError({
        code: "not_found",
        message: "No such",
        resolution: "Search first",
        status: 404,
      }),
    );
    const response = await getFeatureRequest(
      jsonRequest(`/api/feature-requests/${FR_ID}`, { method: "GET" }),
      idParams(FR_ID),
    );
    expect(response.status).toBe(404);
    expect(await codeOf(response)).toBe("not_found");
  });

  it("returns 404 not_found for a non-uuid id without calling the service", async () => {
    const response = await getFeatureRequest(
      jsonRequest("/api/feature-requests/nope", { method: "GET" }),
      idParams("nope"),
    );
    expect(response.status).toBe(404);
    expect(await codeOf(response)).toBe("not_found");
    expect(service.get).not.toHaveBeenCalled();
  });
});

describe("POST /api/feature-requests/[id]/supports", () => {
  const body = { actor, onBehalfOf, quote: "Our managers hit this weekly." };

  it("returns 201 with support and feature request", async () => {
    const response = await postSupport(
      jsonRequest(`/api/feature-requests/${FR_ID}/supports`, { body }),
      idParams(FR_ID),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ featureRequest, support });
    expect(service.support).toHaveBeenCalledWith(FR_ID, body);
  });

  it("returns 409 already_supported with the existing support", async () => {
    service.support.mockResolvedValueOnce({ created: false, featureRequest, support });
    const response = await postSupport(
      jsonRequest(`/api/feature-requests/${FR_ID}/supports`, { body }),
      idParams(FR_ID),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "already_supported",
      featureRequest,
      resolution: expect.any(String),
      support,
    });
  });

  it("returns 404 not_found from the service", async () => {
    service.support.mockRejectedValueOnce(
      new SignalError({
        code: "not_found",
        message: "No such",
        resolution: "Search first",
        status: 404,
      }),
    );
    const response = await postSupport(
      jsonRequest(`/api/feature-requests/${FR_ID}/supports`, { body }),
      idParams(FR_ID),
    );
    expect(response.status).toBe(404);
  });

  it("returns 400 invalid_input when onBehalfOf is missing", async () => {
    const response = await postSupport(
      jsonRequest(`/api/feature-requests/${FR_ID}/supports`, { body: { actor } }),
      idParams(FR_ID),
    );
    expect(response.status).toBe(400);
    expect(await codeOf(response)).toBe("invalid_input");
  });
});

describe("POST /api/feature-requests/[id]/comments", () => {
  const body = { actor, body: "Seen at three stores." };

  it("returns 201 with the comment", async () => {
    const response = await postComment(
      jsonRequest(`/api/feature-requests/${FR_ID}/comments`, { body }),
      idParams(FR_ID),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ comment });
    expect(service.comment).toHaveBeenCalledWith(FR_ID, body);
  });

  it("returns 404 not_found from the service", async () => {
    service.comment.mockRejectedValueOnce(
      new SignalError({
        code: "not_found",
        message: "No such",
        resolution: "Search first",
        status: 404,
      }),
    );
    const response = await postComment(
      jsonRequest(`/api/feature-requests/${FR_ID}/comments`, { body }),
      idParams(FR_ID),
    );
    expect(response.status).toBe(404);
    expect(await codeOf(response)).toBe("not_found");
  });

  it("returns 400 invalid_input for an empty body", async () => {
    const response = await postComment(
      jsonRequest(`/api/feature-requests/${FR_ID}/comments`, { body: { actor, body: "" } }),
      idParams(FR_ID),
    );
    expect(response.status).toBe(400);
  });
});

describe("GET /api/metrics", () => {
  it("returns 200 with metrics", async () => {
    const response = await getMetrics();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(metrics);
  });

  it("returns 503 when the service is not configured", async () => {
    state.service = null;
    const response = await getMetrics();
    expect(response.status).toBe(503);
    expect(await codeOf(response)).toBe("service_unavailable");
  });
});
