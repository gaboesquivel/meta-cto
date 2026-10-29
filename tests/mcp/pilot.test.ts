/**
 * Pilot Workspace over the public MCP (spec 003 task 02): the Pilot Key header on /api/mcp
 * selects the Pilot Workspace for the Signal tools (unchanged in shape) and adds the review tools
 * bound to the Pilot Workspace. Without the header the public MCP is the demo, unchanged.
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

  it("lists the review tools, bound to the Pilot Workspace, and accepts pilot decisions", async () => {
    const names = await listNames(key(PILOT_KEY));
    for (const name of REVIEW_TOOLS) assert.ok(names.has(name), `${name} missing with Pilot Key`);

    const queue = await call("review_queue", {}, key(PILOT_KEY));
    assert.notEqual(queue.isError, true);
    const decided = await call(
      "decide_review",
      { actor, decision: "distinct", featureRequestId: FR_ID, otherId: OTHER_FR_ID },
      key(PILOT_KEY),
    );
    assert.notEqual(decided.isError, true);
    assert.equal(reviews.pilot.queue.mock.calls.length, 1);
    assert.equal(reviews.pilot.decide.mock.calls.length, 1);
    assert.equal(reviews.demo.decide.mock.calls.length, 0);
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

  it("leaves the Operator MCP review tools on the demo Workspace", async () => {
    await rpc(
      postOperatorMcp,
      { method: "tools/call", params: { arguments: {}, name: "review_queue" } },
      { Authorization: `Bearer ${OPERATOR_SECRET}` },
    );
    assert.equal(reviews.demo.queue.mock.calls.length, 1);
    assert.equal(reviews.pilot.queue.mock.calls.length, 0);
  });
});
