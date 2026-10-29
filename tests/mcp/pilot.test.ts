/**
 * Pilot Workspace over the public MCP (spec 003 task 02): the Pilot Key header on /api/mcp
 * selects the Pilot Workspace for the Signal tools (unchanged in shape) and adds the read-only
 * review_queue bound to it; review writes stay off the public MCP. The Operator MCP honors the same
 * header to bind its (Operator-gated) review tools to the Pilot Workspace. Without the header both
 * are the demo, unchanged.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

import type { Origin, ReviewService, SignalService } from "@/lib/signal/contracts";
import { resetSignalWriteLimit } from "@/lib/signal/http";
import { PILOT_KEY_HEADER } from "@/lib/signal/pilot";

import {
  actor,
  draft,
  FR_ID,
  makeReviewService,
  makeService,
  OTHER_FR_ID,
} from "../signal-api/fixtures";

const state = vi.hoisted(() => ({
  review: new Map<string, unknown>(),
  service: new Map<string, unknown>(),
}));

vi.mock("@/lib/signal/runtime", () => ({
  getReviewService: (origin = "demo") => state.review.get(origin) ?? null,
  getSignalService: (origin = "demo") => state.service.get(origin) ?? null,
}));

const { POST: postPublicMcp } = await import("../../app/api/mcp/route");
const { POST: postOperatorMcp } = await import("../../app/api/mcp/operator/route");

const PILOT_KEY = "pilot-key-for-tests-0123";
const OPERATOR_SECRET = "test-operator-secret-16+";
const REVIEW_TOOLS = ["decide_review", "review_queue", "scan_backlog", "undo_review_decision"];
const REVIEW_WRITES = ["decide_review", "scan_backlog", "undo_review_decision"];
const OPERATOR = { Authorization: `Bearer ${OPERATOR_SECRET}` };

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
});

afterEach(() => {
  vi.unstubAllEnvs();
});

interface RpcResult {
  content?: { text?: string }[];
  isError?: boolean;
  tools?: { name: string }[];
}

const rpc = async (
  handler: (request: Request) => Promise<Response> | Response,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) => {
  const response = await handler(
    new Request("http://meta-cto.localhost/api/mcp", {
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", ...body }),
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...headers,
      },
      method: "POST",
    }),
  );
  assert.equal(response.status, 200);
  const json = (await response.json()) as { result?: RpcResult };
  assert.ok(json.result, "no JSON-RPC result");
  return json.result;
};

const key = (value: string) => ({ [PILOT_KEY_HEADER]: value });

const call = (name: string, args: unknown, headers: Record<string, string> = {}) =>
  rpc(postPublicMcp, { method: "tools/call", params: { arguments: args, name } }, headers);

const errorOf = (result: RpcResult) => {
  assert.equal(result.isError, true);
  return (
    JSON.parse(result.content?.[0]?.text ?? "{}") as {
      error: { code: string; details?: { reason?: string }; message: string; resolution: string };
    }
  ).error;
};

const listNames = async (headers: Record<string, string> = {}) => {
  const result = await rpc(postPublicMcp, { method: "tools/list", params: {} }, headers);
  return new Set((result.tools ?? []).map((tool) => tool.name));
};

describe("public MCP with the Pilot Key", () => {
  it("runs the Signal tools on the Pilot Workspace", async () => {
    const result = await call("check_feature_request", { actor, draft }, key(PILOT_KEY));
    assert.notEqual(result.isError, true);
    assert.equal(services.pilot.check.mock.calls.length, 1);
    assert.equal(services.demo.check.mock.calls.length, 0);

    await call("get_feature_request", { featureRequestId: FR_ID }, key(PILOT_KEY));
    assert.equal(services.pilot.get.mock.calls.length, 1);
    assert.equal(services.demo.get.mock.calls.length, 0);
  });

  it("lists only the review queue read, bound to the Pilot Workspace", async () => {
    const names = await listNames(key(PILOT_KEY));
    assert.ok(names.has("review_queue"), "review_queue missing with Pilot Key");
    for (const name of REVIEW_WRITES)
      assert.equal(names.has(name), false, `${name} on the public MCP with the Pilot Key`);

    const queue = await call("review_queue", {}, key(PILOT_KEY));
    assert.notEqual(queue.isError, true);
    assert.equal(reviews.pilot.queue.mock.calls.length, 1);
    assert.equal(reviews.demo.queue.mock.calls.length, 0);
  });

  it.each([
    [
      "decide_review",
      { actor, decision: "distinct", featureRequestId: FR_ID, otherId: OTHER_FR_ID },
    ],
    ["undo_review_decision", { actor, decisionId: FR_ID }],
    ["scan_backlog", { limit: 5 }],
  ])("refuses %s from the agents' Pilot Key", async (name, args) => {
    const response = await postPublicMcp(
      new Request("http://meta-cto.localhost/api/mcp", {
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "tools/call",
          params: { arguments: args, name },
        }),
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
          ...key(PILOT_KEY),
        },
        method: "POST",
      }),
    );
    const json = (await response.json()) as { error?: unknown; result?: RpcResult };
    assert.ok(json.error ?? json.result?.isError, `public MCP ran ${name}`);
    for (const review of [reviews.pilot, reviews.demo]) {
      assert.equal(review.decide.mock.calls.length, 0);
      assert.equal(review.undo.mock.calls.length, 0);
      assert.equal(review.scan.mock.calls.length, 0);
    }
  });

  it("keeps the demo public MCP without review tools and on the demo Workspace", async () => {
    const names = await listNames();
    for (const name of REVIEW_TOOLS) assert.equal(names.has(name), false, `${name} on demo MCP`);
    await call("check_feature_request", { actor, draft });
    assert.equal(services.demo.check.mock.calls.length, 1);
    assert.equal(services.pilot.check.mock.calls.length, 0);
  });

  it("refuses a wrong key with pilot_key_required, saying it is invalid", async () => {
    const error = errorOf(
      await call("check_feature_request", { actor, draft }, key("not-the-pilot-key-at-all")),
    );
    assert.equal(error.code, "pilot_key_required");
    assert.equal(error.details?.reason, "invalid");
    assert.match(error.resolution, new RegExp(PILOT_KEY_HEADER, "u"));
    assert.equal(services.demo.check.mock.calls.length, 0);
    assert.equal(services.pilot.check.mock.calls.length, 0);
  });

  it("refuses an empty key as missing and lists no review tools", async () => {
    const error = errorOf(await call("get_feature_request", { featureRequestId: FR_ID }, key("")));
    assert.equal(error.details?.reason, "missing");
    const names = await listNames(key(""));
    for (const name of REVIEW_TOOLS) assert.equal(names.has(name), false);
  });

  it("fails closed when no Pilot Key is configured", async () => {
    vi.stubEnv("SIGNAL_PILOT_KEY", undefined);
    const error = errorOf(await call("search_feature_requests", {}, key(PILOT_KEY)));
    assert.equal(error.code, "pilot_key_required");
    assert.equal(error.details?.reason, "disabled");
    assert.equal(services.demo.search.mock.calls.length, 0);
    const names = await listNames(key(PILOT_KEY));
    for (const name of REVIEW_TOOLS) assert.equal(names.has(name), false);
  });
});

const operatorCall = (name: string, args: unknown, headers: Record<string, string>) =>
  rpc(postOperatorMcp, { method: "tools/call", params: { arguments: args, name } }, headers);

describe("Operator MCP with the Pilot Key", () => {
  const decideArgs = {
    actor,
    decision: "distinct",
    featureRequestId: FR_ID,
    otherId: OTHER_FR_ID,
  };

  it("binds the review tools to the Pilot Workspace", async () => {
    const decided = await operatorCall("decide_review", decideArgs, {
      ...OPERATOR,
      ...key(PILOT_KEY),
    });
    assert.notEqual(decided.isError, true);
    await operatorCall("scan_backlog", { limit: 5 }, { ...OPERATOR, ...key(PILOT_KEY) });
    assert.equal(reviews.pilot.decide.mock.calls.length, 1);
    assert.equal(reviews.pilot.scan.mock.calls.length, 1);
    assert.equal(reviews.demo.decide.mock.calls.length, 0);
    assert.equal(reviews.demo.scan.mock.calls.length, 0);
  });

  it("stays on the demo Workspace without the Pilot Key", async () => {
    await operatorCall("review_queue", {}, OPERATOR);
    await operatorCall("decide_review", decideArgs, OPERATOR);
    assert.equal(reviews.demo.queue.mock.calls.length, 1);
    assert.equal(reviews.demo.decide.mock.calls.length, 1);
    assert.equal(reviews.pilot.queue.mock.calls.length, 0);
    assert.equal(reviews.pilot.decide.mock.calls.length, 0);
  });

  it("refuses a wrong Pilot Key with pilot_key_required, never falling back to demo", async () => {
    const error = errorOf(
      await operatorCall("decide_review", decideArgs, {
        ...OPERATOR,
        ...key("not-the-pilot-key-at-all"),
      }),
    );
    assert.equal(error.code, "pilot_key_required");
    assert.equal(error.details?.reason, "invalid");
    assert.equal(reviews.demo.decide.mock.calls.length, 0);
    assert.equal(reviews.pilot.decide.mock.calls.length, 0);
  });

  it("still needs Operator access with the Pilot Key", async () => {
    const response = await postOperatorMcp(
      new Request("http://meta-cto.localhost/api/mcp/operator", {
        body: JSON.stringify({
          id: 1,
          jsonrpc: "2.0",
          method: "tools/call",
          params: { arguments: decideArgs, name: "decide_review" },
        }),
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
          ...key(PILOT_KEY),
        },
        method: "POST",
      }),
    );
    assert.equal(response.status, 401);
    assert.equal(reviews.pilot.decide.mock.calls.length, 0);
  });
});

describe("review_metrics (same metrics as GET /api/metrics)", () => {
  it("is on the public MCP and reads the demo by default", async () => {
    const names = await listNames();
    assert.ok(names.has("review_metrics"), "review_metrics missing on the demo public MCP");
    const result = await call("review_metrics", {});
    assert.notEqual(result.isError, true);
    assert.deepEqual(reviews.demo.metrics.mock.calls, [[{}]]);
    assert.equal(reviews.pilot.metrics.mock.calls.length, 0);
  });

  it("reads the Pilot Workspace with the Pilot Key and passes origin through", async () => {
    await call("review_metrics", { origin: "pilot" }, key(PILOT_KEY));
    assert.deepEqual(reviews.pilot.metrics.mock.calls, [[{ origin: "pilot" }]]);
    assert.equal(reviews.demo.metrics.mock.calls.length, 0);
  });

  it("refuses a wrong key with pilot_key_required (reason invalid)", async () => {
    const error = errorOf(await call("review_metrics", {}, key("not-the-pilot-key-at-all")));
    assert.equal(error.code, "pilot_key_required");
    assert.equal(error.details?.reason, "invalid");
    assert.equal(reviews.demo.metrics.mock.calls.length, 0);
    assert.equal(reviews.pilot.metrics.mock.calls.length, 0);
  });

  it("refuses an unknown origin as invalid_input", async () => {
    const error = errorOf(await call("review_metrics", { origin: "prod" }));
    assert.equal(error.code, "invalid_input");
    assert.equal(reviews.demo.metrics.mock.calls.length, 0);
  });

  it("is on the Operator MCP, bound to the Pilot Workspace by the Pilot Key", async () => {
    await operatorCall("review_metrics", {}, OPERATOR);
    await operatorCall("review_metrics", { origin: "eval" }, { ...OPERATOR, ...key(PILOT_KEY) });
    assert.deepEqual(reviews.demo.metrics.mock.calls, [[{}]]);
    assert.deepEqual(reviews.pilot.metrics.mock.calls, [[{ origin: "eval" }]]);
  });
});
