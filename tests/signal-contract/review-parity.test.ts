/**
 * Contract test: Review queue, decide, undo and scan must produce the same outcome code over
 * REST (with Operator Bearer credentials) and the Operator MCP (POST /api/mcp/operator tools/call),
 * for the demo and for the Pilot Workspace (the Pilot Key header on both, with Operator access).
 * One shared fake review service backs both transports; each scenario runs through the REST route
 * handler and the MCP tool and compares the normalized codes, like transport-parity.test.ts.
 * A new scenario is one table row; drift on any row fails with both codes in the message.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

import type { DecideInput, ReviewService } from "@/lib/signal/contracts";
import { decisionRuleViolation, SignalError } from "@/lib/signal/contracts";
import { resetSignalWriteLimit } from "@/lib/signal/http";
import { PILOT_KEY_HEADER } from "@/lib/signal/pilot";

import {
  actor,
  DECISION_ID,
  FR_ID,
  idParams,
  jsonRequest,
  makeReviewService,
  OTHER_FR_ID,
  reviewDecision,
} from "../signal-api/fixtures";

const runtime = vi.hoisted(() => ({
  pilot: null as ReviewService | null,
  review: null as ReviewService | null,
}));

vi.mock("@/lib/signal/runtime", () => ({
  getReviewService: (origin = "demo") => (origin === "pilot" ? runtime.pilot : runtime.review),
  getSignalService: () => null,
}));

const { POST: postOperatorMcp } = await import("../../app/api/mcp/operator/route");
const { POST: postDecision } = await import("../../app/api/review/decisions/route");
const { POST: postUndo } = await import("../../app/api/review/decisions/[id]/undo/route");
const { GET: getQueue } = await import("../../app/api/review/queue/route");
const { GET: getMetrics } = await import("../../app/api/metrics/route");
const { POST: postScan } = await import("../../app/api/review/scan/route");

const SECRET = "test-operator-secret-16+";
const PILOT_KEY = "pilot-key-for-parity-0123";
const PILOT = { [PILOT_KEY_HEADER]: PILOT_KEY };
const LEAK = "connect ECONNREFUSED postgres://user:secret@db/neon";
const MALFORMED_ID = "decision-nope";

/** Mirrors the real service: a decide that breaks a decision rule is refused with invalid_decision. */
const fakeReview = (): ReviewService => ({
  ...makeReviewService(),
  decide: vi.fn((input: DecideInput) => {
    const violation = decisionRuleViolation(input);
    if (!violation) return Promise.resolve(reviewDecision);
    return Promise.reject(
      new SignalError({
        code: "invalid_decision",
        message: violation,
        resolution: "Fix the decision arguments and call again.",
        status: 400,
      }),
    );
  }),
});

interface Outcome {
  code: string;
  raw: string;
  resolution: string | undefined;
  status?: number;
}

interface McpCall {
  args: Record<string, unknown>;
  tool: string;
}

interface Operation {
  mcp: McpCall;
  name: string;
  rest: (ip: string, headers: Record<string, string>) => Promise<Response>;
}

interface Scenario {
  expected: string;
  name: string;
  op: Operation;
  restStatus: number;
  setup?: (service: ReviewService) => void;
  /** Headers sent on both transports (e.g. the Pilot Key). */
  headers?: Record<string, string>;
  /** Runs after both calls, e.g. to prove which Workspace's service answered. */
  verify?: () => void;
}

const bearer = (request: Request, headers: Record<string, string> = {}) => {
  request.headers.set("authorization", `Bearer ${SECRET}`);
  for (const [name, value] of Object.entries(headers)) request.headers.set(name, value);
  return request;
};

const queueOp: Operation = {
  mcp: { args: {}, tool: "review_queue" },
  name: "queue",
  rest: (_ip, headers) => getQueue(new Request("http://localhost/api/review/queue", { headers })),
};

/** GET /api/metrics and review_metrics (spec 003: metrics accept Origin over MCP). */
const metricsOp = (origin?: string): Operation => ({
  mcp: { args: origin === undefined ? {} : { origin }, tool: "review_metrics" },
  name: "metrics",
  rest: (_ip, headers) =>
    getMetrics(
      new Request(
        `http://localhost/api/metrics${origin === undefined ? "" : `?origin=${origin}`}`,
        { headers },
      ),
    ),
});

/** Both transports pass the same metrics input to the service. */
const metricsCalledWith =
  (input: Record<string, unknown>, service: () => ReviewService | null) => () => {
    assert.deepEqual(vi.mocked(service()?.metrics)?.mock.calls, [[input], [input]]);
  };

const decideOp = (body: Record<string, unknown>): Operation => ({
  mcp: { args: { actor, ...body }, tool: "decide_review" },
  name: "decide",
  rest: (ip, headers) =>
    postDecision(
      bearer(jsonRequest("/api/review/decisions", { body: { actor, ...body }, ip }), headers),
    ),
});

const duplicateBody = {
  canonicalId: OTHER_FR_ID,
  decision: "duplicate",
  featureRequestId: FR_ID,
  otherId: OTHER_FR_ID,
};

const undoOp = (id: string): Operation => ({
  mcp: { args: { actor, decisionId: id }, tool: "undo_review_decision" },
  name: "undo",
  rest: (ip, headers) =>
    postUndo(
      bearer(jsonRequest(`/api/review/decisions/${id}/undo`, { body: { actor }, ip }), headers),
      idParams(id),
    ),
});

const scanOp: Operation = {
  mcp: { args: { limit: 10 }, tool: "scan_backlog" },
  name: "scan",
  rest: (ip, headers) =>
    postScan(bearer(jsonRequest("/api/review/scan", { body: { limit: 10 }, ip }), headers)),
};

/** Each pilot write reaches the Pilot Workspace's service on both transports, never the demo's. */
const onPilotOnly = (method: "decide" | "metrics" | "queue" | "scan" | "undo") => () => {
  assert.equal(vi.mocked(runtime.pilot?.[method])?.mock.calls.length, 2);
  assert.equal(vi.mocked(runtime.review?.[method])?.mock.calls.length, 0);
};

const scenarios: Scenario[] = [
  { expected: "ok", name: "queue succeeds", op: queueOp, restStatus: 200 },
  { expected: "ok", name: "duplicate decision", op: decideOp(duplicateBody), restStatus: 201 },
  {
    expected: "invalid_decision",
    name: "service refuses the pair",
    op: decideOp(duplicateBody),
    restStatus: 422,
    setup: (service) => {
      vi.mocked(service.decide).mockRejectedValue(
        new SignalError({
          code: "invalid_decision",
          message: "These Feature Requests are not a Suspected Duplicate pair.",
          resolution: "Pass the suggestionId from the Review Queue.",
          status: 400,
        }),
      );
    },
  },
  {
    // MCP rejects before the service; REST lets the service refuse it. Same code either way.
    expected: "invalid_decision",
    name: "related without sharedDimension",
    op: decideOp({ decision: "related", featureRequestId: FR_ID, otherId: OTHER_FR_ID }),
    restStatus: 422,
  },
  {
    expected: "already_undone",
    name: "second undo",
    op: undoOp(DECISION_ID),
    restStatus: 409,
    setup: (service) => {
      vi.mocked(service.undo).mockRejectedValue(
        new SignalError({
          code: "already_undone",
          message: "This decision was already undone.",
          resolution: "Read the Review Queue and decide again if needed.",
          status: 400,
        }),
      );
    },
  },
  {
    expected: "not_found",
    name: "malformed decision id",
    op: undoOp(MALFORMED_ID),
    restStatus: 404,
  },
  { expected: "ok", name: "scan succeeds", op: scanOp, restStatus: 200 },
  {
    expected: "ok",
    name: "metrics, caller's own Origin",
    op: metricsOp(),
    restStatus: 200,
    verify: metricsCalledWith({}, () => runtime.review),
  },
  {
    expected: "ok",
    name: "metrics for Origin eval",
    op: metricsOp("eval"),
    restStatus: 200,
    verify: metricsCalledWith({ origin: "eval" }, () => runtime.review),
  },
  {
    expected: "service_unavailable",
    name: "review service not configured",
    op: decideOp(duplicateBody),
    restStatus: 503,
    // Nulls the shared runtime for this row only; beforeEach rebuilds it for the next one.
    setup: () => {
      runtime.review = null;
    },
  },
  {
    expected: "internal_error",
    name: "unexpected error",
    op: scanOp,
    restStatus: 500,
    setup: (service) => {
      vi.mocked(service.scan).mockRejectedValue(new Error(LEAK));
    },
  },
  // Pilot Workspace (spec 003 task 02): Operator access plus the Pilot Key on both transports.
  {
    expected: "ok",
    headers: PILOT,
    name: "pilot queue",
    op: queueOp,
    restStatus: 200,
    verify: onPilotOnly("queue"),
  },
  {
    expected: "ok",
    headers: PILOT,
    name: "pilot decision",
    op: decideOp(duplicateBody),
    restStatus: 201,
    verify: onPilotOnly("decide"),
  },
  {
    expected: "ok",
    headers: PILOT,
    name: "pilot undo",
    op: undoOp(DECISION_ID),
    restStatus: 200,
    verify: onPilotOnly("undo"),
  },
  {
    expected: "ok",
    headers: PILOT,
    name: "pilot scan",
    op: scanOp,
    restStatus: 200,
    verify: onPilotOnly("scan"),
  },
  {
    expected: "ok",
    headers: PILOT,
    name: "pilot metrics",
    op: metricsOp(),
    restStatus: 200,
    verify: onPilotOnly("metrics"),
  },
  {
    expected: "pilot_key_required",
    headers: { [PILOT_KEY_HEADER]: "not-the-pilot-key-at-all" },
    name: "metrics with a wrong Pilot Key",
    op: metricsOp(),
    restStatus: 401,
  },
  {
    expected: "pilot_key_required",
    headers: { [PILOT_KEY_HEADER]: "not-the-pilot-key-at-all" },
    name: "wrong Pilot Key",
    op: decideOp(duplicateBody),
    restStatus: 401,
  },
  {
    expected: "pilot_key_required",
    headers: PILOT,
    name: "Pilot Key not configured",
    op: scanOp,
    restStatus: 503,
    setup: () => {
      vi.stubEnv("SIGNAL_PILOT_KEY", undefined);
    },
  },
];

const restOutcome = async (response: Response): Promise<Outcome> => {
  const raw = await response.text();
  if (response.ok) return { code: "ok", raw, resolution: undefined, status: response.status };
  const body = JSON.parse(raw) as { code?: string; resolution?: string };
  return {
    code: body.code ?? "<missing code>",
    raw,
    resolution: body.resolution,
    status: response.status,
  };
};

interface ToolCallJson {
  result?: { content?: { text?: string }[]; isError?: boolean };
}

const operatorRpc = ({ args, tool }: McpCall, headers: Record<string, string>) =>
  postOperatorMcp(
    new Request("http://meta-cto.localhost/api/mcp/operator", {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: args, name: tool },
      }),
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...headers,
      },
      method: "POST",
    }),
  );

const callMcp = async (call: McpCall, headers: Record<string, string> = {}) => {
  const response = await operatorRpc(call, { Authorization: `Bearer ${SECRET}`, ...headers });
  assert.equal(response.status, 200, `MCP ${call.tool}: transport status ${response.status}`);
  return await response.text();
};

const mcpOutcome = (raw: string, tool: string): Outcome => {
  const { result } = JSON.parse(raw) as ToolCallJson;
  assert.ok(result, `MCP ${tool}: no tool result in ${raw}`);
  if (result.isError !== true) return { code: "ok", raw, resolution: undefined };
  const text = result.content?.[0]?.text ?? "{}";
  const { error } = JSON.parse(text) as { error?: { code?: string; resolution?: string } };
  return { code: error?.code ?? "<missing code>", raw, resolution: error?.resolution };
};

const runScenario = async (scenario: Scenario, ip: string) => {
  if (runtime.review) scenario.setup?.(runtime.review);

  const headers = scenario.headers ?? {};
  const rest = await restOutcome(await scenario.op.rest(ip, headers));
  const mcp = mcpOutcome(await callMcp(scenario.op.mcp, headers), scenario.op.mcp.tool);
  scenario.verify?.();
  const label = `${scenario.op.name} (${scenario.name})`;

  assert.equal(
    mcp.code,
    rest.code,
    `Transport drift on ${label}: REST returned "${rest.code}" but MCP returned "${mcp.code}"`,
  );
  assert.equal(
    rest.code,
    scenario.expected,
    `${label}: both transports returned "${rest.code}", expected "${scenario.expected}"`,
  );
  assert.equal(
    rest.status,
    scenario.restStatus,
    `${label}: REST status ${rest.status}, expected ${scenario.restStatus}`,
  );
  if (scenario.expected === "ok") return;
  assert.ok(rest.resolution?.trim(), `${label}: REST error body has no resolution`);
  assert.ok(mcp.resolution?.trim(), `${label}: MCP error body has no resolution`);
  assert.doesNotMatch(rest.raw, /secret|ECONNREFUSED/u, `${label}: REST leaked raw error text`);
  assert.doesNotMatch(mcp.raw, /secret|ECONNREFUSED/u, `${label}: MCP leaked raw error text`);
};

beforeEach(() => {
  runtime.review = fakeReview();
  runtime.pilot = fakeReview();
  resetSignalWriteLimit();
  vi.stubEnv("SIGNAL_PILOT_KEY", PILOT_KEY);
  vi.stubEnv("OPERATOR_SECRET", SECRET);
  vi.stubEnv("OPERATOR_ACCESS_TOKEN", undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Review REST and Operator MCP transport parity", () => {
  for (const [index, scenario] of scenarios.entries()) {
    test(`${scenario.op.name}: ${scenario.name} -> ${scenario.expected}`, () =>
      runScenario(scenario, `198.51.100.${index + 1}`));
  }

  test("accepted transport-level difference: unauthenticated decide is refused with 401 on both, codes differ", async () => {
    const service = runtime.review;
    assert.ok(service);
    const op = decideOp(duplicateBody);

    const restResponse = await postDecision(
      jsonRequest("/api/review/decisions", {
        body: { actor, ...duplicateBody },
        ip: "198.51.100.200",
      }),
    );
    const rest = await restOutcome(restResponse);
    assert.equal(rest.status, 401);
    // REST refuses inside handleReview with the Signal code.
    assert.equal(rest.code, "operator_required");
    assert.ok(rest.resolution?.trim());

    const mcpResponse = await operatorRpc(op.mcp, {});
    // The Operator MCP route guard refuses before JSON-RPC, with the template's auth code.
    assert.equal(mcpResponse.status, 401);
    const mcp = (await mcpResponse.json()) as { code?: string; resolution?: string };
    assert.equal(mcp.code, "operator_unauthorized");
    assert.ok(mcp.resolution?.trim());

    assert.equal(vi.mocked(service.decide).mock.calls.length, 0);
  });
});
