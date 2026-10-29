/**
 * The Operator's Workspace selector (spec 003, Exposure: the Pilot Workspace "with Operator access
 * in the UI"). `/review` sends `?workspace=pilot` with the Operator session cookie; the server
 * resolves the Pilot Workspace itself, so the browser never holds the Pilot Key. Without Operator
 * access the selector is refused and no pilot data is read; with no Pilot Key configured it fails
 * closed. No selector (or `workspace=demo`) is the Crewday demo, unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OPERATOR_SESSION_COOKIE, signOperatorSession } from "@/lib/auth/operator-access";
import type { Origin, ReviewService } from "@/lib/signal/contracts";
import { resetSignalWriteLimit } from "@/lib/signal/http";
import { PILOT_KEY_HEADER } from "@/lib/signal/pilot";

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
  OTHER_FR_ID,
} from "./fixtures";

const state = vi.hoisted(() => ({ review: new Map<string, unknown>() }));

vi.mock("@/lib/signal/runtime", () => ({
  getReviewService: (origin = "demo") => state.review.get(origin) ?? null,
  getSignalService: () => null,
}));

const PILOT_KEY = "pilot-key-for-tests-0123";
const OPERATOR_SECRET = "test-operator-secret-16+";

const reviews = {} as Record<Origin, ReturnType<typeof makeReviewService>>;

beforeEach(() => {
  for (const origin of ["demo", "pilot"] as const) {
    reviews[origin] = makeReviewService();
    state.review.set(origin, reviews[origin] satisfies ReviewService);
  }
  resetSignalWriteLimit();
  vi.stubEnv("SIGNAL_PILOT_KEY", PILOT_KEY);
  vi.stubEnv("OPERATOR_SECRET", OPERATOR_SECRET);
  vi.stubEnv("OPERATOR_ACCESS_TOKEN", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const asOperator = (request: Request) => {
  const session = signOperatorSession({ token: OPERATOR_SECRET });
  request.headers.set("cookie", `${OPERATOR_SESSION_COOKIE}=${encodeURIComponent(session)}`);
  return request;
};

type Call = (query: string, operator: boolean) => Promise<Response>;

const build = (
  path: string,
  query: string,
  operator: boolean,
  init: { body?: unknown; method?: string },
) => {
  const request = jsonRequest(`${path}${query}`, init);
  return operator ? asOperator(request) : request;
};

const routes: { act: Call; method: keyof ReviewService; name: string; write?: boolean }[] = [
  {
    act: (query, operator) =>
      getQueue(build("/api/review/queue", query, operator, { method: "GET" })),
    method: "queue",
    name: "review queue",
  },
  {
    act: (query, operator) => getMetrics(build("/api/metrics", query, operator, { method: "GET" })),
    method: "metrics",
    name: "metrics",
  },
  {
    act: (query, operator) =>
      postDecision(
        build("/api/review/decisions", query, operator, {
          body: { actor, decision: "distinct", featureRequestId: FR_ID, otherId: OTHER_FR_ID },
        }),
      ),
    method: "decide",
    name: "review decision",
    write: true,
  },
  {
    act: (query, operator) =>
      postUndo(
        build(`/api/review/decisions/${DECISION_ID}/undo`, query, operator, { body: { actor } }),
        idParams(DECISION_ID),
      ),
    method: "undo",
    name: "undo",
    write: true,
  },
  {
    act: (query, operator) => postScan(build("/api/review/scan", query, operator, { body: {} })),
    method: "scan",
    name: "scan",
    write: true,
  },
];

const reads = routes.filter((route) => !route.write);

const queueAs = (query: string, operator: boolean) =>
  getQueue(build("/api/review/queue", query, operator, { method: "GET" }));
const metricsAs = (query: string, operator: boolean) =>
  getMetrics(build("/api/metrics", query, operator, { method: "GET" }));

describe("?workspace=pilot with an Operator session", () => {
  it.each(routes)("$name acts on the Pilot Workspace only", async (route) => {
    const response = await route.act("?workspace=pilot", true);
    expect(response.status).toBeLessThan(300);
    expect(reviews.pilot[route.method]).toHaveBeenCalledTimes(1);
    expect(reviews.demo[route.method]).not.toHaveBeenCalled();
  });

  it("metrics default to Origin pilot (the service bound to the Pilot Workspace)", async () => {
    await metricsAs("?workspace=pilot", true);
    expect(reviews.pilot.metrics).toHaveBeenCalledWith({});
  });

  it.each(routes)("$name fails closed when no Pilot Key is configured", async (route) => {
    vi.stubEnv("SIGNAL_PILOT_KEY", undefined);
    const response = await route.act("?workspace=pilot", true);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "pilot_key_required", reason: "disabled" });
    expect(reviews.pilot[route.method]).not.toHaveBeenCalled();
    expect(reviews.demo[route.method]).not.toHaveBeenCalled();
  });
});

describe("?workspace=pilot without Operator access", () => {
  it.each(routes)("$name is refused and reads no pilot data", async (route) => {
    const response = await route.act("?workspace=pilot", false);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "operator_required" });
    expect(reviews.pilot[route.method]).not.toHaveBeenCalled();
    expect(reviews.demo[route.method]).not.toHaveBeenCalled();
  });

  it("is refused with a forged session cookie", async () => {
    const request = jsonRequest("/api/review/queue?workspace=pilot", { method: "GET" });
    request.headers.set("cookie", `${OPERATOR_SESSION_COOKIE}=forged`);
    const response = await getQueue(request);
    expect(response.status).toBe(401);
    expect(reviews.pilot.queue).not.toHaveBeenCalled();
  });

  it("stays fail-closed when Operator access is not configured", async () => {
    vi.stubEnv("OPERATOR_SECRET", undefined);
    const response = await queueAs("?workspace=pilot", false);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "operator_required" });
    expect(reviews.pilot.queue).not.toHaveBeenCalled();
  });
});

describe("demo, unchanged", () => {
  it.each(reads)("$name with no selector reads the demo", async (route) => {
    const response = await route.act("", false);
    expect(response.status).toBeLessThan(300);
    expect(reviews.demo[route.method]).toHaveBeenCalledTimes(1);
    expect(reviews.pilot[route.method]).not.toHaveBeenCalled();
  });

  it.each(reads)("$name with workspace=demo reads the demo", async (route) => {
    const response = await route.act("?workspace=demo", true);
    expect(response.status).toBeLessThan(300);
    expect(reviews.demo[route.method]).toHaveBeenCalledTimes(1);
    expect(reviews.pilot[route.method]).not.toHaveBeenCalled();
  });

  it("refuses an unknown workspace as invalid_input", async () => {
    const response = await queueAs("?workspace=prod", true);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_input" });
    expect(reviews.demo.queue).not.toHaveBeenCalled();
    expect(reviews.pilot.queue).not.toHaveBeenCalled();
  });

  it("refuses workspace=demo together with the Pilot Key (conflict)", async () => {
    const request = jsonRequest("/api/review/queue?workspace=demo", { method: "GET" });
    request.headers.set(PILOT_KEY_HEADER, PILOT_KEY);
    const response = await getQueue(request);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_input" });
    expect(reviews.demo.queue).not.toHaveBeenCalled();
    expect(reviews.pilot.queue).not.toHaveBeenCalled();
  });

  it("accepts workspace=pilot with the agents' Pilot Key for reads, as the key alone does", async () => {
    const request = jsonRequest("/api/review/queue?workspace=pilot", { method: "GET" });
    request.headers.set(PILOT_KEY_HEADER, PILOT_KEY);
    const response = await getQueue(request);
    expect(response.status).toBe(200);
    expect(reviews.pilot.queue).toHaveBeenCalledTimes(1);
  });
});
