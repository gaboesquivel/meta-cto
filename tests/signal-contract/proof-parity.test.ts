/**
 * Contract test (spec 003 task 07): the Proof Report reads the same over REST (GET /api/proof),
 * the public MCP (proof_report with the Pilot Key) and the Operator MCP (proof_report with
 * Operator access). Access refusals carry the same code and an actionable resolution on every
 * transport. One mocked report source backs all three; a new scenario is one table row.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

import { PILOT_KEY_HEADER } from "@/lib/signal/pilot";
import { buildProofReport } from "@/lib/signal/proof/report";
import type { ProofReport } from "@/lib/signal/proof/report";

const state = vi.hoisted(() => ({
  report: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@/lib/signal/proof/sources", () => ({ getProofReport: state.report }));
vi.mock("@/lib/signal/runtime", () => ({
  getReviewService: () => null,
  getSignalService: () => null,
}));

const { GET: getProof } = await import("../../app/api/proof/route");
const { POST: postPublicMcp } = await import("../../app/api/mcp/route");
const { POST: postOperatorMcp } = await import("../../app/api/mcp/operator/route");

const PILOT_KEY = "pilot-key-for-proof-0123";
const SECRET = "test-operator-secret-16+";
const LEAK = "connect ECONNREFUSED postgres://user:secret@db/neon";
const PILOT = { [PILOT_KEY_HEADER]: PILOT_KEY };
const OPERATOR = { authorization: `Bearer ${SECRET}` };

const report: ProofReport = buildProofReport({
  answerKeyScores: null,
  generatedAt: "2026-11-01T00:00:00.000Z",
  heldOutV2: { message: "missing", readable: false },
  pilotFiles: { message: "missing", readable: false },
  pilotMetrics: null,
  pilotMetricsError: "the database is not configured on this deployment.",
  promptVersion: null,
  v2LatestReading: null,
  v2Reading: null,
});

interface Outcome {
  body: unknown;
  code: string;
  raw: string;
  reason?: string;
  resolution?: string;
}

const restOutcome = async (
  headers: Record<string, string>,
): Promise<Outcome & { status: number }> => {
  const response = await getProof(new Request("http://localhost/api/proof", { headers }));
  const raw = await response.text();
  const body = JSON.parse(raw) as { code?: string; reason?: string; resolution?: string };
  if (response.ok) return { body, code: "ok", raw, status: response.status };
  assert.equal(response.headers.get("cache-control"), "no-store");
  return {
    body,
    code: body.code ?? "<missing>",
    raw,
    reason: body.reason,
    resolution: body.resolution,
    status: response.status,
  };
};

const rpc = async (
  handler: (request: Request) => Promise<Response> | Response,
  body: Record<string, unknown>,
  headers: Record<string, string>,
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
  assert.equal(response.status, 200, `MCP transport status ${response.status}`);
  const raw = await response.text();
  const json = JSON.parse(raw) as {
    result?: {
      content?: { text?: string }[];
      isError?: boolean;
      structuredContent?: unknown;
      tools?: { name: string }[];
    };
  };
  assert.ok(json.result, `no JSON-RPC result in ${raw}`);
  return { raw, result: json.result };
};

const mcpOutcome = async (
  handler: (request: Request) => Promise<Response> | Response,
  headers: Record<string, string>,
): Promise<Outcome> => {
  const { raw, result } = await rpc(
    handler,
    { method: "tools/call", params: { arguments: {}, name: "proof_report" } },
    headers,
  );
  if (result.isError !== true) return { body: result.structuredContent, code: "ok", raw };
  const { error } = JSON.parse(result.content?.[0]?.text ?? "{}") as {
    error?: { code?: string; details?: { reason?: string }; resolution?: string };
  };
  return {
    body: error,
    code: error?.code ?? "<missing>",
    raw,
    reason: error?.details?.reason,
    resolution: error?.resolution,
  };
};

interface Scenario {
  env?: () => void;
  expected: string;
  /** Headers for REST and the public MCP. */
  headers: Record<string, string>;
  name: string;
  reason?: string;
  restStatus: number;
  setup?: () => void;
}

const scenarios: Scenario[] = [
  { expected: "ok", headers: PILOT, name: "Pilot Key", restStatus: 200 },
  {
    expected: "pilot_key_required",
    headers: {},
    name: "no Pilot Key",
    reason: "missing",
    restStatus: 401,
  },
  {
    expected: "pilot_key_required",
    headers: { [PILOT_KEY_HEADER]: "not-the-pilot-key-at-all" },
    name: "wrong Pilot Key",
    reason: "invalid",
    restStatus: 401,
  },
  {
    env: () => vi.stubEnv("SIGNAL_PILOT_KEY", undefined),
    expected: "pilot_key_required",
    headers: PILOT,
    name: "Pilot Key not configured (fails closed)",
    reason: "disabled",
    restStatus: 503,
  },
  {
    expected: "internal_error",
    headers: PILOT,
    name: "report source throws",
    restStatus: 500,
    setup: () => state.report.mockRejectedValue(new Error(LEAK)),
  },
];

beforeEach(() => {
  state.report.mockReset();
  state.report.mockResolvedValue(report);
  vi.stubEnv("SIGNAL_PILOT_KEY", PILOT_KEY);
  vi.stubEnv("OPERATOR_SECRET", SECRET);
  vi.stubEnv("OPERATOR_ACCESS_TOKEN", undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Proof Report: REST and public MCP parity", () => {
  for (const scenario of scenarios) {
    test(`${scenario.name} -> ${scenario.expected}`, async () => {
      scenario.env?.();
      scenario.setup?.();
      const rest = await restOutcome(scenario.headers);
      const mcp = await mcpOutcome(postPublicMcp, scenario.headers);

      assert.equal(mcp.code, rest.code, `drift: REST ${rest.code}, MCP ${mcp.code}`);
      assert.equal(rest.code, scenario.expected);
      assert.equal(rest.status, scenario.restStatus);
      if (scenario.expected === "ok") {
        assert.deepEqual(mcp.body, rest.body);
        return;
      }
      assert.equal(rest.reason, scenario.reason);
      assert.equal(mcp.reason, scenario.reason);
      assert.ok(rest.resolution?.trim(), "REST error has no resolution");
      assert.ok(mcp.resolution?.trim(), "MCP error has no resolution");
      assert.doesNotMatch(rest.raw, /secret@|ECONNREFUSED/u);
      assert.doesNotMatch(mcp.raw, /secret@|ECONNREFUSED/u);
    });
  }
});

describe("Proof Report: Operator access", () => {
  test("REST with Operator Bearer and the Operator MCP return the same report, with no Pilot Key configured", async () => {
    vi.stubEnv("SIGNAL_PILOT_KEY", undefined);
    const rest = await restOutcome(OPERATOR);
    const mcp = await mcpOutcome(postOperatorMcp, OPERATOR);
    assert.equal(rest.code, "ok");
    assert.equal(mcp.code, "ok");
    assert.deepEqual(mcp.body, rest.body);
    assert.deepEqual(rest.body, structuredClone(report));
  });

  test("the Operator MCP still refuses without Operator access", async () => {
    const response = await postOperatorMcp(
      new Request("http://meta-cto.localhost/api/mcp/operator", {
        body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list", params: {} }),
        headers: {
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );
    assert.equal(response.status, 401);
    assert.equal(state.report.mock.calls.length, 0);
  });
});

describe("proof_report on tools/list", () => {
  test("is listed on the public MCP (with or without the key) and the Operator MCP", async () => {
    const lists = await Promise.all(
      (
        [
          [postPublicMcp, {}],
          [postPublicMcp, PILOT],
          [postOperatorMcp, OPERATOR],
        ] as const
      ).map(([handler, headers]) => rpc(handler, { method: "tools/list", params: {} }, headers)),
    );
    for (const { result } of lists) {
      const names = new Set((result.tools ?? []).map((tool) => tool.name));
      assert.ok(names.has("proof_report"), "proof_report missing from tools/list");
    }
  });

  test("a refused call never reads the report", async () => {
    await mcpOutcome(postPublicMcp, {});
    await restOutcome({});
    assert.equal(state.report.mock.calls.length, 0);
  });
});
