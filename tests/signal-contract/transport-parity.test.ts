/**
 * Contract test: every Signal operation must produce the same outcome code over REST and MCP.
 * One shared fake service backs both transports; each scenario runs through the REST route
 * handler and the MCP tool (via POST /api/mcp tools/call) and compares the normalized codes.
 * A new scenario is one table row; drift on any row fails with both codes in the message.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

import type { CreateInput, SignalService } from "@/lib/signal/contracts";
import { SignalError } from "@/lib/signal/contracts";
import { resetSignalWriteLimit, SIGNAL_WRITE_LIMIT } from "@/lib/signal/http";

import {
  actor,
  CHECK_ID,
  draft,
  featureRequest,
  FR_ID,
  idParams,
  jsonRequest,
  makeService,
  onBehalfOf,
  support,
} from "../signal-api/fixtures";

const runtime = vi.hoisted(() => ({ service: null as SignalService | null }));

vi.mock("@/lib/signal/runtime", () => ({
  getSignalService: () => runtime.service,
}));

const { POST: postApiMcp } = await import("../../app/api/mcp/route");
const { POST: postCheck } = await import("../../app/api/checks/route");
const { POST: postCreate } = await import("../../app/api/feature-requests/route");
const { GET: getDetail } = await import("../../app/api/feature-requests/[id]/route");
const { POST: postSupport } = await import("../../app/api/feature-requests/[id]/supports/route");

const LEAK = "connect ECONNREFUSED postgres://user:secret@db/neon";
const MALFORMED_ID = "fr-sofia";

/** Mirrors the real service: a create without a checkId is refused with check_required. */
const fakeService = (): SignalService => ({
  ...makeService(),
  create: vi.fn((input: CreateInput) => {
    if (input.checkId) return Promise.resolve(featureRequest);
    return Promise.reject(
      new SignalError({
        code: "check_required",
        message: "Creating a Feature Request requires a recent Check of the same Draft.",
        resolution: "Check this Draft again and use the new checkId.",
        status: 409,
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
  rest: (ip: string) => Promise<Response>;
}

interface Scenario {
  expected: string;
  name: string;
  op: Operation;
  restStatus: number;
  setup?: (service: SignalService) => void;
  /** Spend the write budget for this IP before the compared calls. */
  exhaustBudget?: boolean;
}

const checkOp: Operation = {
  mcp: { args: { actor, draft, onBehalfOf }, tool: "check_feature_request" },
  name: "check",
  rest: (ip) => postCheck(jsonRequest("/api/checks", { body: { actor, draft, onBehalfOf }, ip })),
};

const createOp = (extra: Record<string, unknown>): Operation => ({
  mcp: { args: { actor, draft, onBehalfOf, ...extra }, tool: "create_feature_request" },
  name: "create",
  rest: (ip) =>
    postCreate(
      jsonRequest("/api/feature-requests", { body: { actor, draft, onBehalfOf, ...extra }, ip }),
    ),
});

const supportOp: Operation = {
  mcp: { args: { actor, featureRequestId: FR_ID, onBehalfOf }, tool: "support_feature_request" },
  name: "support",
  rest: (ip) =>
    postSupport(
      jsonRequest(`/api/feature-requests/${FR_ID}/supports`, { body: { actor, onBehalfOf }, ip }),
      idParams(FR_ID),
    ),
};

const getOp = (id: string): Operation => ({
  mcp: { args: { featureRequestId: id }, tool: "get_feature_request" },
  name: "get",
  rest: (ip) =>
    getDetail(jsonRequest(`/api/feature-requests/${id}`, { ip, method: "GET" }), idParams(id)),
});

const invalidCheckOp: Operation = {
  mcp: { args: { actor, draft: { ...draft, title: "" } }, tool: "check_feature_request" },
  name: "check (empty title)",
  rest: (ip) =>
    postCheck(jsonRequest("/api/checks", { body: { actor, draft: { ...draft, title: "" } }, ip })),
};

const rejectCreate =
  (code: "check_expired" | "check_mismatch" | "skip_reason_required", status: number) =>
  (service: SignalService) => {
    vi.mocked(service.create).mockRejectedValue(
      new SignalError({
        code,
        message: `Refused: ${code}`,
        resolution: `Resolve ${code}.`,
        status,
      }),
    );
  };

const scenarios: Scenario[] = [
  { expected: "ok", name: "check succeeds", op: checkOp, restStatus: 200 },
  {
    expected: "check_required",
    name: "create without checkId",
    op: createOp({}),
    restStatus: 409,
  },
  {
    expected: "check_mismatch",
    name: "create with a mismatched check",
    op: createOp({ checkId: CHECK_ID }),
    restStatus: 409,
    setup: rejectCreate("check_mismatch", 409),
  },
  {
    expected: "check_expired",
    name: "create with an expired check",
    op: createOp({ checkId: CHECK_ID }),
    restStatus: 410,
    setup: rejectCreate("check_expired", 410),
  },
  {
    expected: "skip_reason_required",
    name: "create past a same_need candidate without skipReason",
    op: createOp({ checkId: CHECK_ID }),
    restStatus: 422,
    setup: rejectCreate("skip_reason_required", 422),
  },
  {
    expected: "already_supported",
    name: "repeat support",
    op: supportOp,
    restStatus: 409,
    setup: (service) => {
      vi.mocked(service.support).mockResolvedValue({ created: false, featureRequest, support });
    },
  },
  {
    expected: "not_found",
    name: "get with a malformed id",
    op: getOp(MALFORMED_ID),
    restStatus: 404,
  },
  { expected: "invalid_input", name: "invalid input", op: invalidCheckOp, restStatus: 400 },
  {
    expected: "service_unavailable",
    name: "service not configured",
    op: checkOp,
    restStatus: 503,
    setup: () => {
      runtime.service = null;
    },
  },
  {
    expected: "internal_error",
    name: "unexpected error",
    op: getOp(FR_ID),
    restStatus: 500,
    setup: (service) => {
      vi.mocked(service.get).mockRejectedValue(new Error(LEAK));
    },
  },
  {
    exhaustBudget: true,
    expected: "rate_limited",
    name: "write budget exhausted",
    op: supportOp,
    restStatus: 429,
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

const callMcp = async ({ args, tool }: McpCall, ip: string) => {
  const response = await postApiMcp(
    new Request("http://meta-cto.localhost/api/mcp", {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: args, name: tool },
      }),
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "x-forwarded-for": ip,
      },
      method: "POST",
    }),
  );
  assert.equal(response.status, 200, `MCP ${tool}: transport status ${response.status}`);
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

/** Alternates transports so the budget is provably shared across REST and MCP. */
const spendWrite = async (ip: string, viaRest: boolean): Promise<Outcome> => {
  if (viaRest) return await restOutcome(await checkOp.rest(ip));
  return mcpOutcome(await callMcp(checkOp.mcp, ip), checkOp.mcp.tool);
};

const exhaustBudget = async (ip: string) => {
  for (let index = 0; index < SIGNAL_WRITE_LIMIT; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- sequential calls consume the budget in order
    const outcome = await spendWrite(ip, index % 2 === 0);
    assert.equal(outcome.code, "ok", `budget write ${index + 1} was refused: ${outcome.code}`);
  }
};

const runScenario = async (scenario: Scenario, ip: string) => {
  if (runtime.service) scenario.setup?.(runtime.service);
  if (scenario.exhaustBudget) await exhaustBudget(ip);

  const rest = await restOutcome(await scenario.op.rest(ip));
  const mcp = mcpOutcome(await callMcp(scenario.op.mcp, ip), scenario.op.mcp.tool);
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
  runtime.service = fakeService();
  resetSignalWriteLimit();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Signal REST and MCP transport parity", () => {
  for (const [index, scenario] of scenarios.entries()) {
    test(`${scenario.op.name}: ${scenario.name} -> ${scenario.expected}`, () =>
      runScenario(scenario, `192.0.2.${index + 1}`));
  }
});
