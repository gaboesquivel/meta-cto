import assert from "node:assert/strict";
import { afterEach, beforeEach, test, vi } from "vitest";

import type { ReviewDecision, ReviewQueue, ReviewService } from "../../lib/signal/contracts";
import { SignalError } from "../../lib/signal/contracts";

const runtime = vi.hoisted(() => ({ review: null as ReviewService | null }));

vi.mock("@/lib/signal/runtime", () => ({
  getReviewService: () => runtime.review,
  getSignalService: () => null,
}));

const { POST: postOperatorMcp } = await import("../../app/api/mcp/operator/route");
const { POST: postPublicMcp } = await import("../../app/api/mcp/route");
const { operatorMcpToolNames } = await import("../../lib/mcp/register-operator-tools");
const { reviewMcpToolNames } = await import("../../lib/mcp/register-review-tools");
const { starterMcpToolCatalog } = await import("../../lib/mcp/tool-catalog");

const SECRET = "test-operator-token-16chars";
const FR_ID = "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const OTHER_ID = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
const DECISION_ID = "8a6e0f4e-1d2b-4c3a-9f8e-7d6c5b4a3e21";
const actor = { name: "review-bot", type: "agent" as const };

const REVIEW_TOOLS = ["decide_review", "review_queue", "scan_backlog", "undo_review_decision"];

const decision: ReviewDecision = {
  actor,
  canonicalId: OTHER_ID,
  createdAt: "2026-10-28T12:00:00.000Z",
  decision: "duplicate",
  featureRequestId: FR_ID,
  id: DECISION_ID,
  otherId: OTHER_ID,
  sharedDimension: null,
  suggestionId: null,
  undoneAt: null,
  undoneBy: null,
};

const queue: ReviewQueue = { counts: { backlog: 0, new: 0 }, items: [] };

const fakeReview = (): ReviewService => ({
  decide: vi.fn(() => Promise.resolve(decision)),
  metrics: vi.fn(() =>
    Promise.resolve({
      backlogBaseline: { duplicates: 0, rate: null, reviewed: 0 },
      checks: 0,
      checksWithSameNeed: 0,
      createsAfterSameNeed: 0,
      intakeDuplicateRate: { duplicates: 0, rate: null, reviewed: 0 },
      reviewCoverage: { rate: null, reviewed: 0, total: 0 },
      suggestionAcceptance: null,
      suspectedDuplication: { open: 0, rate: null, total: 0 },
      undoRate: { decisions: 0, rate: null, undone: 0 },
    }),
  ),
  queue: vi.fn(() => Promise.resolve(queue)),
  scan: vi.fn(() => Promise.resolve({ pairsFound: 2, remaining: 5, scanned: 10 })),
  undo: vi.fn(() =>
    Promise.resolve({ ...decision, undoneAt: "2026-10-28T13:00:00.000Z", undoneBy: actor }),
  ),
});

interface RpcJson {
  result?: {
    content?: { text?: string; type: string }[];
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
    tools?: { description?: string; name: string }[];
  };
}

interface ToolError {
  code: string;
  message: string;
  resolution: string;
}

const rpc = (
  handler: (request: Request) => Response | Promise<Response>,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  handler(
    new Request("http://meta-cto.localhost/api/mcp/operator", {
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", ...(body as object) }),
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...headers,
      },
      method: "POST",
    }),
  );

const auth = { Authorization: `Bearer ${SECRET}` };

const callOperator = async (name: string, args: unknown) => {
  const response = await rpc(
    postOperatorMcp,
    { method: "tools/call", params: { arguments: args, name } },
    auth,
  );
  assert.equal(response.status, 200);
  const json = (await response.json()) as RpcJson;
  assert.ok(json.result, `no result for ${name}`);
  return json.result;
};

const errorOf = (result: NonNullable<RpcJson["result"]>): ToolError => {
  assert.equal(result.isError, true);
  return (JSON.parse(result.content?.[0]?.text ?? "") as { error: ToolError }).error;
};

const listTools = async (
  handler: (request: Request) => Response | Promise<Response>,
  headers: Record<string, string> = {},
) => {
  const response = await rpc(handler, { method: "tools/list", params: {} }, headers);
  assert.equal(response.status, 200);
  return ((await response.json()) as RpcJson).result?.tools ?? [];
};

let previousSecret: string | undefined;
let review = fakeReview();

beforeEach(() => {
  previousSecret = process.env.OPERATOR_SECRET;
  process.env.OPERATOR_SECRET = SECRET;
  review = fakeReview();
  runtime.review = review;
});

afterEach(() => {
  if (previousSecret === undefined) delete process.env.OPERATOR_SECRET;
  else process.env.OPERATOR_SECRET = previousSecret;
});

test("review tools are operator tools listed on the operator MCP", async () => {
  assert.deepEqual([...reviewMcpToolNames].toSorted(), REVIEW_TOOLS);
  const operatorNames = new Set<string>(operatorMcpToolNames);
  const listed = await listTools(postOperatorMcp, auth);
  const listedNames = new Set(listed.map((tool) => tool.name));
  for (const name of REVIEW_TOOLS) {
    assert.ok(operatorNames.has(name), `${name} missing from operatorMcpToolNames`);
    assert.ok(listedNames.has(name), `${name} missing from operator tools/list`);
  }
  for (const name of operatorMcpToolNames) assert.ok(listedNames.has(name), `${name} not listed`);
});

test("descriptions keep the Product Manager in charge", async () => {
  const tools = await listTools(postOperatorMcp, auth);
  const describe = (name: string) => tools.find((tool) => tool.name === name)?.description ?? "";
  assert.match(describe("decide_review"), /Product Manager/u);
  assert.match(describe("decide_review"), /canonical/u);
  assert.match(describe("decide_review"), /Shared Dimension/u);
  assert.match(describe("review_queue"), /suggest/u);
  assert.match(describe("undo_review_decision"), /history/u);
  assert.match(describe("scan_backlog"), /only (?:when|on) request/u);
});

test("public MCP and its catalog do not gain review tools", async () => {
  const publicTools = await listTools(postPublicMcp);
  const listed = new Set(publicTools.map((tool) => tool.name));
  const catalog = new Set(starterMcpToolCatalog.map((tool) => tool.name));
  for (const name of REVIEW_TOOLS) {
    assert.equal(listed.has(name), false, `${name} on public tools/list`);
    assert.equal(catalog.has(name), false, `${name} in public catalog`);
  }
});

test("public MCP refuses review tool calls", async () => {
  const response = await rpc(postPublicMcp, {
    method: "tools/call",
    params: {
      arguments: { actor, decision: "none", featureRequestId: FR_ID },
      name: "decide_review",
    },
  });
  const json = (await response.json()) as RpcJson & { error?: unknown };
  assert.ok(json.error ?? json.result?.isError, "public MCP must not run decide_review");
  assert.equal(vi.mocked(review.decide).mock.calls.length, 0);
});

test("decide without Operator credentials is refused before the service runs", async () => {
  const response = await rpc(postOperatorMcp, {
    method: "tools/call",
    params: {
      arguments: {
        actor,
        canonicalId: OTHER_ID,
        decision: "duplicate",
        featureRequestId: FR_ID,
        otherId: OTHER_ID,
      },
      name: "decide_review",
    },
  });
  assert.equal(response.status, 401);
  const body = (await response.json()) as { code: string; resolution: string };
  assert.equal(body.code, "operator_unauthorized");
  assert.ok(body.resolution);
  assert.equal(vi.mocked(review.decide).mock.calls.length, 0);
});

test("review_queue returns the queue", async () => {
  const result = await callOperator("review_queue", {});
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent, queue);
});

test("decide_review records a decision with the actor", async () => {
  const args = {
    actor,
    canonicalId: OTHER_ID,
    decision: "duplicate",
    featureRequestId: FR_ID,
    otherId: OTHER_ID,
  };
  const result = await callOperator("decide_review", args);
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent, { decision });
  const decide = vi.mocked(review.decide);
  assert.deepEqual(decide.mock.calls[0], [
    { canonicalId: OTHER_ID, decision: "duplicate", featureRequestId: FR_ID, otherId: OTHER_ID },
    actor,
  ]);
});

test("undo_review_decision undoes by decisionId", async () => {
  const result = await callOperator("undo_review_decision", { actor, decisionId: DECISION_ID });
  assert.notEqual(result.isError, true);
  const undone = (result.structuredContent as { decision: ReviewDecision }).decision;
  assert.equal(undone.undoneAt, "2026-10-28T13:00:00.000Z");
  assert.deepEqual(vi.mocked(review.undo).mock.calls[0], [DECISION_ID, actor]);
});

test("scan_backlog passes the limit through", async () => {
  const result = await callOperator("scan_backlog", { limit: 10 });
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent, { pairsFound: 2, remaining: 5, scanned: 10 });
  assert.deepEqual(vi.mocked(review.scan).mock.calls[0], [{ limit: 10 }]);
});

test("service errors map to actionable tool errors", async () => {
  vi.mocked(review.decide).mockRejectedValueOnce(
    new SignalError({
      code: "invalid_decision",
      message: "These Feature Requests are not a Suspected Duplicate pair.",
      resolution: "Pass the suggestionId from review_queue.",
      status: 422,
    }),
  );
  const invalid = errorOf(
    await callOperator("decide_review", {
      actor,
      decision: "related",
      featureRequestId: FR_ID,
      otherId: OTHER_ID,
      sharedDimension: "Scheduling",
    }),
  );
  assert.equal(invalid.code, "invalid_decision");
  assert.ok(invalid.resolution);

  vi.mocked(review.undo).mockRejectedValueOnce(
    new SignalError({
      code: "already_undone",
      message: "This decision was already undone.",
      resolution: "Read review_queue and decide again if needed.",
      status: 409,
    }),
  );
  const undone = errorOf(
    await callOperator("undo_review_decision", { actor, decisionId: DECISION_ID }),
  );
  assert.equal(undone.code, "already_undone");

  vi.mocked(review.decide).mockRejectedValueOnce(
    new SignalError({
      code: "not_found",
      message: "Feature Request not found.",
      resolution: "Use review_queue for valid ids.",
      status: 404,
    }),
  );
  const missing = errorOf(
    await callOperator("decide_review", { actor, decision: "none", featureRequestId: FR_ID }),
  );
  assert.equal(missing.code, "not_found");
});

test("decision rule violations return invalid_decision before the service runs", async () => {
  const error = errorOf(
    await callOperator("decide_review", {
      actor,
      decision: "related",
      featureRequestId: FR_ID,
      otherId: OTHER_ID,
    }),
  );
  assert.equal(error.code, "invalid_decision");
  assert.match(error.message, /Shared Dimension/u);
  assert.ok(error.resolution);
  assert.equal(vi.mocked(review.decide).mock.calls.length, 0);
});

test("malformed ids map to not_found and bad input to invalid_input", async () => {
  const badDecision = errorOf(
    await callOperator("undo_review_decision", { actor, decisionId: "nope" }),
  );
  assert.equal(badDecision.code, "not_found");
  assert.match(badDecision.resolution, /review_queue/u);

  const badFr = errorOf(
    await callOperator("decide_review", { actor, decision: "none", featureRequestId: "nope" }),
  );
  assert.equal(badFr.code, "not_found");

  const badInput = errorOf(
    await callOperator("decide_review", { decision: "maybe", featureRequestId: FR_ID }),
  );
  assert.equal(badInput.code, "invalid_input");
  assert.equal(vi.mocked(review.decide).mock.calls.length, 0);
});

test("unconfigured review service returns service_unavailable", async () => {
  runtime.review = null;
  const calls = [
    ["review_queue", {}],
    ["decide_review", { actor, decision: "none", featureRequestId: FR_ID }],
    ["undo_review_decision", { actor, decisionId: DECISION_ID }],
    ["scan_backlog", {}],
  ] as const;
  const results = await Promise.all(calls.map(([name, args]) => callOperator(name, args)));
  for (const [index, result] of results.entries()) {
    const error = errorOf(result);
    assert.equal(error.code, "service_unavailable", calls[index]?.[0] ?? "");
    assert.ok(error.resolution);
  }
});
