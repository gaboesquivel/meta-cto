import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildOpenApiDocument } from "@/lib/openapi/build-openapi-document";
import { OPERATOR_SESSION_COOKIE, signOperatorSession } from "@/lib/auth/operator-access";
import { SignalError } from "@/lib/signal/contracts";
import type { ReviewService, SignalService } from "@/lib/signal/contracts";
import { resetSignalWriteLimit, SIGNAL_WRITE_LIMIT } from "@/lib/signal/http";

import { GET as getMetrics } from "../../app/api/metrics/route";
import { POST as postUndo } from "../../app/api/review/decisions/[id]/undo/route";
import { POST as postDecision } from "../../app/api/review/decisions/route";
import { GET as getQueue } from "../../app/api/review/queue/route";
import { POST as postScan } from "../../app/api/review/scan/route";
import {
  actor,
  DECISION_ID,
  FR_ID,
  idParams,
  jsonRequest,
  makeReviewService,
  makeService,
  metrics,
  OTHER_FR_ID,
  reviewDecision,
  reviewQueue,
  scanResult,
} from "./fixtures";

const state = vi.hoisted(() => ({
  review: null as ReviewService | null,
  service: null as SignalService | null,
}));

vi.mock("@/lib/signal/runtime", () => ({
  getReviewService: () => state.review,
  getSignalService: () => state.service,
}));

const SECRET = "test-operator-secret-16+";

let review: ReturnType<typeof makeReviewService>;

beforeEach(() => {
  review = makeReviewService();
  state.review = review;
  state.service = makeService();
  resetSignalWriteLimit();
  vi.stubEnv("OPERATOR_SECRET", SECRET);
  vi.stubEnv("OPERATOR_ACCESS_TOKEN", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const readBody = async (response: Response) => (await response.json()) as Record<string, unknown>;

const codeOf = async (response: Response) => {
  const body = await readBody(response);
  return body.code;
};

type Auth = "bearer" | "cookie" | "header" | "none" | "wrong";

const operatorRequest = (
  path: string,
  { auth = "bearer", body, ip }: { auth?: Auth; body?: unknown; ip?: string } = {},
) => {
  const request = jsonRequest(path, { body, ip });
  const { headers } = request;
  if (auth === "bearer") headers.set("authorization", `Bearer ${SECRET}`);
  if (auth === "wrong") headers.set("authorization", "Bearer not-the-operator-secret");
  if (auth === "header") headers.set("x-operator-secret", SECRET);
  if (auth === "cookie")
    headers.set("cookie", `${OPERATOR_SESSION_COOKIE}=${signOperatorSession({ token: SECRET })}`);
  return request;
};

const decideBody = {
  actor,
  canonicalId: OTHER_FR_ID,
  decision: "duplicate",
  featureRequestId: FR_ID,
  otherId: OTHER_FR_ID,
};

const decide = (auth?: Auth, body: unknown = decideBody, ip?: string) =>
  postDecision(operatorRequest("/api/review/decisions", { auth, body, ip }));
const undo = (auth?: Auth, id = DECISION_ID, ip?: string) =>
  postUndo(
    operatorRequest(`/api/review/decisions/${id}/undo`, { auth, body: { actor }, ip }),
    idParams(id),
  );
const scanBody = { limit: 20 };
const scan = (auth?: Auth, body: unknown = scanBody, ip?: string) =>
  postScan(operatorRequest("/api/review/scan", { auth, body, ip }));

const writes: [string, (auth?: Auth, ip?: string) => Promise<Response>][] = [
  ["decide", (auth, ip) => decide(auth, decideBody, ip)],
  ["undo", (auth, ip) => undo(auth, DECISION_ID, ip)],
  ["scan", (auth, ip) => scan(auth, {}, ip)],
];

describe("GET /api/review/queue", () => {
  it("returns 200 with the Review Queue without credentials", async () => {
    const response = await getQueue();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(reviewQueue);
  });

  it("returns 503 service_unavailable when the review service is not configured", async () => {
    state.review = null;
    const response = await getQueue();
    expect(response.status).toBe(503);
    expect(await codeOf(response)).toBe("service_unavailable");
  });
});

describe("POST /api/review/decisions", () => {
  it.each(["bearer", "header", "cookie"] as const)(
    "returns 201 with the decision for Operator access via %s",
    async (auth) => {
      const response = await decide(auth);
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual({ decision: reviewDecision });
      const { actor: _actor, ...input } = decideBody;
      expect(review.decide).toHaveBeenCalledWith(input, actor);
    },
  );

  it("returns 400 invalid_input for a bad body", async () => {
    const response = await decide("bearer", { actor, decision: "maybe" });
    expect(response.status).toBe(400);
    expect(await codeOf(response)).toBe("invalid_input");
    expect(review.decide).not.toHaveBeenCalled();
  });

  it("maps invalid_decision to 422", async () => {
    review.decide.mockRejectedValueOnce(
      new SignalError({
        code: "invalid_decision",
        message: "Related needs the Shared Dimension you see in both.",
        resolution: "State the Shared Dimension.",
        status: 400,
      }),
    );
    const response = await decide("bearer", {
      ...decideBody,
      canonicalId: undefined,
      decision: "related",
    });
    expect(response.status).toBe(422);
    expect(await codeOf(response)).toBe("invalid_decision");
  });

  it("maps not_found to 404", async () => {
    review.decide.mockRejectedValueOnce(
      new SignalError({
        code: "not_found",
        message: "Feature Request not found.",
        resolution: "Use the queue.",
        status: 404,
      }),
    );
    const response = await decide();
    expect(response.status).toBe(404);
  });
});

describe("POST /api/review/decisions/{id}/undo", () => {
  it("returns 200 with the undone decision", async () => {
    const response = await undo();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      decision: { ...reviewDecision, undoneAt: expect.any(String), undoneBy: actor },
    });
    expect(review.undo).toHaveBeenCalledWith(DECISION_ID, actor);
  });

  it("maps already_undone to 409", async () => {
    review.undo.mockRejectedValueOnce(
      new SignalError({
        code: "already_undone",
        message: "This decision was already undone.",
        resolution: "Record a new decision instead.",
        status: 400,
      }),
    );
    const response = await undo();
    expect(response.status).toBe(409);
    expect(await codeOf(response)).toBe("already_undone");
  });

  it("returns 404 for a malformed decision id without calling the service", async () => {
    const response = await undo("bearer", "not-a-uuid");
    expect(response.status).toBe(404);
    const body = await readBody(response);
    expect(body.code).toBe("not_found");
    expect(String(body.error)).toMatch(/decision/iu);
    expect(review.undo).not.toHaveBeenCalled();
  });
});

describe("POST /api/review/scan", () => {
  it("returns 200 with the ScanResult", async () => {
    const response = await scan();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(scanResult);
    expect(review.scan).toHaveBeenCalledWith({ limit: 20 });
  });

  it("accepts an empty body", async () => {
    const response = await postScan(operatorRequest("/api/review/scan"));
    expect(response.status).toBe(200);
    expect(review.scan).toHaveBeenCalledWith({});
  });

  it("returns 400 invalid_input for a bad limit", async () => {
    const response = await scan("bearer", { limit: 0 });
    expect(response.status).toBe(400);
    expect(review.scan).not.toHaveBeenCalled();
  });

  it("accepts the REST cap of 50", async () => {
    const response = await scan("bearer", { limit: 50 });
    expect(response.status).toBe(200);
    expect(review.scan).toHaveBeenCalledWith({ limit: 50 });
  });

  it("returns 400 invalid_input naming the cap for a limit above 50", async () => {
    const response = await scan("bearer", { limit: 51 });
    expect(response.status).toBe(400);
    const body = await readBody(response);
    expect(body.code).toBe("invalid_input");
    expect(`${String(body.error)} ${String(body.resolution)}`).toMatch(/50/u);
    expect(review.scan).not.toHaveBeenCalled();
  });
});

describe.each(writes)("Operator access on %s", (_name, call) => {
  it.each(["none", "wrong"] as const)(
    "returns 401 operator_required with %s credentials before calling the service",
    async (auth) => {
      const response = await call(auth);
      expect(response.status).toBe(401);
      const body = await readBody(response);
      expect(body.code).toBe("operator_required");
      expect(body.resolution).toBe(
        "Sign in as Operator (/operator/access) or send Authorization: Bearer <OPERATOR_SECRET>.",
      );
      expect(review.decide).not.toHaveBeenCalled();
      expect(review.undo).not.toHaveBeenCalled();
      expect(review.scan).not.toHaveBeenCalled();
    },
  );

  it("fails closed with 503 operator_required naming the setting when OPERATOR_SECRET is unset", async () => {
    vi.stubEnv("OPERATOR_SECRET", undefined);
    const response = await call("bearer");
    expect(response.status).toBe(503);
    const body = await readBody(response);
    expect(body.code).toBe("operator_required");
    expect(body.resolution).toMatch(/OPERATOR_SECRET/u);
  });

  it("returns 503 service_unavailable when the review service is not configured", async () => {
    state.review = null;
    const response = await call("bearer");
    expect(response.status).toBe(503);
    expect(await codeOf(response)).toBe("service_unavailable");
  });

  it("spends the per-client write budget", async () => {
    const ip = "10.9.9.9";
    const send = () => call("bearer", ip);
    for (let index = 0; index < SIGNAL_WRITE_LIMIT; index += 1) {
      // oxlint-disable-next-line no-await-in-loop -- sequential requests fill one bucket
      const ok = await send();
      expect(ok.status).toBeLessThan(300);
      expect(ok.headers.get("ratelimit-limit")).toBe(String(SIGNAL_WRITE_LIMIT));
    }
    const limited = await send();
    expect(limited.status).toBe(429);
    expect(await codeOf(limited)).toBe("rate_limited");
  });
});

describe("OpenAPI document for review routes", () => {
  const doc = buildOpenApiDocument("https://example.com");
  const paths = doc.paths as Record<
    string,
    Record<string, { operationId: string; responses: Record<string, unknown> }>
  >;

  it.each([
    ["/api/review/queue", "get", "getReviewQueue", ["200", "503"]],
    [
      "/api/review/decisions",
      "post",
      "decideReview",
      ["201", "400", "401", "404", "422", "429", "503"],
    ],
    [
      "/api/review/decisions/{id}/undo",
      "post",
      "undoReviewDecision",
      ["200", "401", "404", "409", "429", "503"],
    ],
    ["/api/review/scan", "post", "scanBacklog", ["200", "400", "401", "429", "503"]],
  ])("lists %s %s as %s with its responses", (path, method, operationId, statuses) => {
    const operation = paths[path]?.[method];
    expect(operation?.operationId).toBe(operationId);
    expect(Object.keys(operation?.responses ?? {})).toEqual(expect.arrayContaining(statuses));
  });

  it("documents the ReviewMetrics shape on GET /api/metrics", () => {
    const metricsRef = JSON.stringify(paths["/api/metrics"]?.get);
    expect(metricsRef).toContain("#/components/schemas/SignalMetrics");
    const schemas = JSON.stringify(
      (doc.components.schemas as Record<string, unknown>).SignalMetrics,
    );
    for (const field of [
      "intakeDuplicateRate",
      "backlogBaseline",
      "reviewCoverage",
      "suspectedDuplication",
      "undoRate",
      "suggestionAcceptance",
    ])
      expect(schemas).toContain(field);
  });

  it("documents canonical evidence on the Feature Request detail", () => {
    const schemas = doc.components.schemas as Record<
      string,
      { properties?: Record<string, unknown> }
    >;
    const detail = JSON.stringify(schemas.SignalFeatureRequestDetail);
    for (const field of ["duplicates", "duplicateOf", "reviewHistory", "via"])
      expect(detail).toContain(field);
  });

  it("documents each duplicate's origin evidence on the detail", () => {
    const schemas = doc.components.schemas as Record<string, { allOf?: unknown[] }>;
    const [, extension] = (schemas.SignalFeatureRequestDetail?.allOf ?? []) as {
      properties: Record<
        string,
        { items: { properties: Record<string, unknown>; required: string[] } }
      >;
    }[];
    const item = extension?.properties.duplicates?.items;
    expect(Object.keys(item?.properties ?? {}).toSorted()).toEqual([
      "account",
      "createdAt",
      "createdBy",
      "description",
      "id",
      "requester",
      "title",
    ]);
    expect(item?.required.toSorted()).toEqual([
      "account",
      "createdAt",
      "createdBy",
      "description",
      "id",
      "requester",
      "title",
    ]);
  });
});

describe("GET /api/metrics", () => {
  it("returns 200 with the review service's metrics, needing only a database", async () => {
    state.service = null;
    const response = await getMetrics(new Request("http://localhost/api/metrics"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(metrics);
    expect(review.metrics).toHaveBeenCalledExactlyOnceWith({});
  });

  it("passes the requested Origin to the review service", async () => {
    const response = await getMetrics(new Request("http://localhost/api/metrics?origin=seed"));
    expect(response.status).toBe(200);
    expect(review.metrics).toHaveBeenCalledExactlyOnceWith({ origin: "seed" });
  });

  it("returns 503 when the review service is not configured", async () => {
    state.review = null;
    const response = await getMetrics(new Request("http://localhost/api/metrics"));
    expect(response.status).toBe(503);
    expect(((await response.json()) as { code?: string }).code).toBe("service_unavailable");
  });
});
