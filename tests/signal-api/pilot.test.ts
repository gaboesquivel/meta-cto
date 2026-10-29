/**
 * Pilot Workspace over REST (spec 003 task 02): the Pilot Key header selects the Pilot Workspace
 * for every Signal and review route; a request without it is the Crewday demo, unchanged; a wrong
 * key, an empty key, or no key configured is refused with `pilot_key_required`, never demo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Origin, ReviewService, SignalService } from "@/lib/signal/contracts";
import { resetSignalWriteLimit } from "@/lib/signal/http";
import { PILOT_KEY_HEADER } from "@/lib/signal/pilot";

import { GET as getMetrics } from "../../app/api/metrics/route";
import { POST as postUndo } from "../../app/api/review/decisions/[id]/undo/route";
import { POST as postDecision } from "../../app/api/review/decisions/route";
import { GET as getQueue } from "../../app/api/review/queue/route";
import { POST as postScan } from "../../app/api/review/scan/route";
import { POST as postCheck } from "../../app/api/checks/route";
import { POST as postComment } from "../../app/api/feature-requests/[id]/comments/route";
import { GET as getDetail } from "../../app/api/feature-requests/[id]/route";
import { POST as postSupport } from "../../app/api/feature-requests/[id]/supports/route";
import { GET as getSearch, POST as postCreate } from "../../app/api/feature-requests/route";
import {
  actor,
  CHECK_ID,
  DECISION_ID,
  draft,
  FR_ID,
  idParams,
  jsonRequest,
  makeReviewService,
  makeService,
  onBehalfOf,
  OTHER_FR_ID,
} from "./fixtures";

const state = vi.hoisted(() => ({
  review: new Map<string, unknown>(),
  service: new Map<string, unknown>(),
}));

vi.mock("@/lib/signal/runtime", () => ({
  getReviewService: (origin = "demo") => state.review.get(origin) ?? null,
  getSignalService: (origin = "demo") => state.service.get(origin) ?? null,
}));

const PILOT_KEY = "pilot-key-for-tests-0123";
const OPERATOR_SECRET = "test-operator-secret-16+";

const services = {} as Record<Origin, ReturnType<typeof makeService>>;
const reviews = {} as Record<Origin, ReturnType<typeof makeReviewService>>;

beforeEach(() => {
  for (const origin of ["demo", "pilot"] as const) {
    services[origin] = makeService();
    reviews[origin] = makeReviewService();
    state.service.set(origin, services[origin] satisfies SignalService);
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

const withKey = (request: Request, key: string | null = PILOT_KEY) => {
  if (key !== null) request.headers.set(PILOT_KEY_HEADER, key);
  return request;
};

type Call = (key: string | null) => Promise<Response>;

const routes: {
  act: Call;
  name: string;
  signal?: keyof SignalService;
  review?: keyof ReviewService;
}[] = [
  {
    act: (key) => postCheck(withKey(jsonRequest("/api/checks", { body: { actor, draft } }), key)),
    name: "check",
    signal: "check",
  },
  {
    act: (key) =>
      postCreate(
        withKey(
          jsonRequest("/api/feature-requests", { body: { actor, checkId: CHECK_ID, draft } }),
          key,
        ),
      ),
    name: "create",
    signal: "create",
  },
  {
    act: (key) =>
      getSearch(withKey(jsonRequest("/api/feature-requests?q=trades", { method: "GET" }), key)),
    name: "search",
    signal: "search",
  },
  {
    act: (key) =>
      getDetail(
        withKey(jsonRequest(`/api/feature-requests/${FR_ID}`, { method: "GET" }), key),
        idParams(FR_ID),
      ),
    name: "get",
    signal: "get",
  },
  {
    act: (key) =>
      postSupport(
        withKey(
          jsonRequest(`/api/feature-requests/${FR_ID}/supports`, { body: { actor, onBehalfOf } }),
          key,
        ),
        idParams(FR_ID),
      ),
    name: "support",
    signal: "support",
  },
  {
    act: (key) =>
      postComment(
        withKey(
          jsonRequest(`/api/feature-requests/${FR_ID}/comments`, { body: { actor, body: "Seen" } }),
          key,
        ),
        idParams(FR_ID),
      ),
    name: "comment",
    signal: "comment",
  },
  {
    act: (key) => getQueue(withKey(jsonRequest("/api/review/queue", { method: "GET" }), key)),
    name: "review queue",
    review: "queue",
  },
  {
    act: (key) => getMetrics(withKey(jsonRequest("/api/metrics", { method: "GET" }), key)),
    name: "metrics",
    review: "metrics",
  },
  {
    act: (key) =>
      postDecision(
        withKey(
          jsonRequest("/api/review/decisions", {
            body: { actor, decision: "distinct", featureRequestId: FR_ID, otherId: OTHER_FR_ID },
          }),
          key,
        ),
      ),
    name: "review decision",
    review: "decide",
  },
  {
    act: (key) =>
      postUndo(
        withKey(jsonRequest(`/api/review/decisions/${DECISION_ID}/undo`, { body: { actor } }), key),
        idParams(DECISION_ID),
      ),
    name: "undo",
    review: "undo",
  },
  {
    act: (key) => postScan(withKey(jsonRequest("/api/review/scan", { body: {} }), key)),
    name: "scan",
    review: "scan",
  },
];

const target = (route: (typeof routes)[number], origin: Origin) =>
  route.signal ? services[origin][route.signal] : reviews[origin][route.review ?? "queue"];

describe("Pilot Key over REST", () => {
  it.each(routes)("$name with the Pilot Key acts on the Pilot Workspace only", async (route) => {
    const response = await route.act(PILOT_KEY);
    expect(response.status).toBeLessThan(300);
    expect(target(route, "pilot")).toHaveBeenCalledTimes(1);
    expect(target(route, "demo")).not.toHaveBeenCalled();
  });

  it.each(routes)("$name with a wrong key is refused as invalid", async (route) => {
    const response = await route.act("not-the-pilot-key-at-all");
    expect(response.status).toBe(401);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ code: "pilot_key_required", reason: "invalid" });
    expect(body.resolution).toEqual(expect.stringContaining(PILOT_KEY_HEADER));
    expect(target(route, "pilot")).not.toHaveBeenCalled();
    expect(target(route, "demo")).not.toHaveBeenCalled();
  });

  it.each(routes)("$name with an empty key is refused as missing", async (route) => {
    const response = await route.act("");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "pilot_key_required", reason: "missing" });
    expect(target(route, "demo")).not.toHaveBeenCalled();
  });

  it.each(routes)("$name fails closed when no Pilot Key is configured", async (route) => {
    vi.stubEnv("SIGNAL_PILOT_KEY", undefined);
    const response = await route.act(PILOT_KEY);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "pilot_key_required", reason: "disabled" });
    expect(target(route, "pilot")).not.toHaveBeenCalled();
    expect(target(route, "demo")).not.toHaveBeenCalled();
  });

  it.each(routes.filter((route) => route.signal || route.name.match(/queue|metrics/u)))(
    "$name without the header is the Crewday demo, as before",
    async (route) => {
      vi.stubEnv("SIGNAL_PILOT_KEY", undefined);
      const response = await route.act(null);
      expect(response.status).toBeLessThan(300);
      expect(target(route, "demo")).toHaveBeenCalledTimes(1);
      expect(target(route, "pilot")).not.toHaveBeenCalled();
    },
  );

  it("still needs Operator access for demo review writes", async () => {
    const response = await postDecision(
      jsonRequest("/api/review/decisions", {
        body: { actor, decision: "distinct", featureRequestId: FR_ID, otherId: OTHER_FR_ID },
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "operator_required" });
  });

  it("does not let the Operator secret stand in for the Pilot Key", async () => {
    const request = withKey(
      jsonRequest("/api/review/scan", { body: {} }),
      "not-the-pilot-key-at-all",
    );
    request.headers.set("authorization", `Bearer ${OPERATOR_SECRET}`);
    const response = await postScan(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "pilot_key_required" });
    expect(reviews.demo.scan).not.toHaveBeenCalled();
  });

  it("spends the write budget before refusing a bad key", async () => {
    const response = await postCheck(
      withKey(jsonRequest("/api/checks", { body: { actor, draft } }), "wrong-key-wrong-key"),
    );
    expect(
      response.headers.get("RateLimit-Limit") ?? response.headers.get("ratelimit-limit"),
    ).not.toBeNull();
  });
});
