/**
 * Contract test: Signal check, create, support and get must produce the same outcome code over
 * REST and MCP, for the demo and for the Pilot Workspace (Pilot Key header on both transports) (comment and search share the same error mapping and write budget; add rows here
 * when they gain transport-specific behavior).
 * One shared fake service backs both transports; each scenario runs through the REST route
 * handler and the MCP tool (via POST /api/mcp tools/call) and compares the normalized codes.
 * A new scenario is one table row; drift on any row fails with both codes in the message.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

import type { CreateInput, SignalService } from "@/lib/signal/contracts";
import { SignalError } from "@/lib/signal/contracts";
import { resetSignalWriteLimit, SIGNAL_WRITE_LIMIT } from "@/lib/signal/http";
import { PILOT_KEY_HEADER } from "@/lib/signal/pilot";

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

const runtime = vi.hoisted(() => ({
  pilot: null as SignalService | null,
  service: null as SignalService | null,
}));

vi.mock("@/lib/signal/runtime", () => ({
  getSignalService: (origin = "demo") => (origin === "pilot" ? runtime.pilot : runtime.service),
}));

const PILOT_KEY = "pilot-key-for-parity-0123";

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
  rest: (ip: string, headers: Record<string, string>) => Promise<Response>;
}

/** A fixture request plus the scenario's headers (the Pilot Key, when the row sends one). */
const req = (
  path: string,
  options: Parameters<typeof jsonRequest>[1],
  headers: Record<string, string>,
) => {
  const request = jsonRequest(path, options);
  for (const [name, value] of Object.entries(headers)) request.headers.set(name, value);
  return request;
};

interface Scenario {
  expected: string;
  name: string;
  op: Operation;
  restStatus: number;
  setup?: (service: SignalService) => void;
  /** Spend the write budget for this IP before the compared calls. */
  exhaustBudget?: boolean;
  /** Headers sent on both transports (e.g. the Pilot Key). */
  headers?: Record<string, string>;
  /** Runs after both calls, e.g. to prove which Workspace's service answered. */
  verify?: () => void;
}

const checkOp: Operation = {
  mcp: { args: { actor, draft, onBehalfOf }, tool: "check_feature_request" },
  name: "check",
  rest: (ip, headers) =>
    postCheck(req("/api/checks", { body: { actor, draft, onBehalfOf }, ip }, headers)),
};

const createOp = (extra: Record<string, unknown>): Operation => ({
  mcp: { args: { actor, draft, onBehalfOf, ...extra }, tool: "create_feature_request" },
  name: "create",
  rest: (ip, headers) =>
    postCreate(
      req("/api/feature-requests", { body: { actor, draft, onBehalfOf, ...extra }, ip }, headers),
    ),
});

const supportOp: Operation = {
  mcp: { args: { actor, featureRequestId: FR_ID, onBehalfOf }, tool: "support_feature_request" },
  name: "support",
  rest: (ip, headers) =>
    postSupport(
      req(`/api/feature-requests/${FR_ID}/supports`, { body: { actor, onBehalfOf }, ip }, headers),
      idParams(FR_ID),
    ),
};

const getOp = (id: string): Operation => ({
  mcp: { args: { featureRequestId: id }, tool: "get_feature_request" },
  name: "get",
  rest: (ip, headers) =>
    getDetail(req(`/api/feature-requests/${id}`, { ip, method: "GET" }, headers), idParams(id)),
});

const invalidCheckOp: Operation = {
  mcp: { args: { actor, draft: { ...draft, title: "" } }, tool: "check_feature_request" },
  name: "check (empty title)",
  rest: (ip, headers) =>
    postCheck(req("/api/checks", { body: { actor, draft: { ...draft, title: "" } }, ip }, headers)),
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

/** A create the service refuses with `code`; REST must surface `status` (the SignalError status). */
const rejectedCreate = (
  name: string,
  code: "check_expired" | "check_mismatch" | "skip_reason_required",
  status: number,
): Scenario => ({
  expected: code,
  name,
  op: createOp({ checkId: CHECK_ID }),
  restStatus: status,
  setup: rejectCreate(code, status),
});

const scenarios: Scenario[] = [
  { expected: "ok", name: "check succeeds", op: checkOp, restStatus: 200 },
  {
    expected: "check_required",
    name: "create without checkId",
    op: createOp({}),
    restStatus: 409,
  },
  rejectedCreate("create with a mismatched check", "check_mismatch", 409),
  rejectedCreate("create with an expired check", "check_expired", 410),
  rejectedCreate(
    "create past a same_need candidate without skipReason",
    "skip_reason_required",
    422,
  ),
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
    // Nulls the shared runtime for this row only; beforeEach rebuilds it for the next one.
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
  // Pilot Workspace (spec 003 task 02): the Pilot Key header selects it on both transports.
  {
    expected: "ok",
    headers: { [PILOT_KEY_HEADER]: PILOT_KEY },
    name: "check with the Pilot Key acts on the Pilot Workspace",
    op: checkOp,
    restStatus: 200,
    verify: () => {
      assert.equal(vi.mocked(runtime.pilot?.check)?.mock.calls.length, 2);
      assert.equal(vi.mocked(runtime.service?.check)?.mock.calls.length, 0);
    },
  },
  {
    expected: "check_required",
    headers: { [PILOT_KEY_HEADER]: PILOT_KEY },
    name: "create without checkId in the Pilot Workspace",
    op: createOp({}),
    restStatus: 409,
  },
  {
    expected: "pilot_key_required",
    headers: { [PILOT_KEY_HEADER]: "not-the-pilot-key-at-all" },
    name: "wrong Pilot Key",
    op: supportOp,
    restStatus: 401,
  },
  {
    expected: "pilot_key_required",
    headers: { [PILOT_KEY_HEADER]: "" },
    name: "empty Pilot Key",
    op: getOp(FR_ID),
    restStatus: 401,
  },
  {
    expected: "pilot_key_required",
    headers: { [PILOT_KEY_HEADER]: PILOT_KEY },
    name: "Pilot Key not configured",
    op: checkOp,
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

const callMcp = async ({ args, tool }: McpCall, ip: string, extra: Record<string, string> = {}) => {
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
        ...extra,
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
  if (viaRest) return await restOutcome(await checkOp.rest(ip, {}));
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

  const headers = scenario.headers ?? {};
  const rest = await restOutcome(await scenario.op.rest(ip, headers));
  const mcp = mcpOutcome(await callMcp(scenario.op.mcp, ip, headers), scenario.op.mcp.tool);
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
  runtime.service = fakeService();
  runtime.pilot = fakeService();
  resetSignalWriteLimit();
  vi.stubEnv("SIGNAL_PILOT_KEY", PILOT_KEY);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Signal REST and MCP transport parity", () => {
  for (const [index, scenario] of scenarios.entries()) {
    test(`${scenario.op.name}: ${scenario.name} -> ${scenario.expected}`, () =>
      runScenario(scenario, `192.0.2.${index + 1}`));
  }
});
