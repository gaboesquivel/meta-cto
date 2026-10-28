import assert from "node:assert/strict";
import { beforeEach, test, vi } from "vitest";

import type {
  CheckResult,
  FeatureRequestDetail,
  SignalService,
  SupportView,
} from "../../lib/signal/contracts";
import { SignalError } from "../../lib/signal/contracts";

const runtime = vi.hoisted(() => ({ service: null as SignalService | null }));

vi.mock("@/lib/signal/runtime", () => ({
  getSignalService: () => runtime.service,
}));

const { POST: postApiMcp } = await import("../../app/api/mcp/route");
const { starterMcpToolCatalog } = await import("../../lib/mcp/tool-catalog");
const { signalMcpToolNames } = await import("../../lib/mcp/register-signal-tools");

const FR_ID = "fr-sofia";
const CHECK_ID = "8a6e0f4e-1d2b-4c3a-9f8e-7d6c5b4a3e21";

const actor = { name: "support-bot", type: "agent" as const };
const draft = {
  description: "When two employees trade shifts the schedule does not update for one of them.",
  title: "Traded shifts sometimes don't show on my schedule",
};
const onBehalfOf = { account: { name: "Cedar Market", segment: "retail", size: "24 stores" } };

const checkResult: CheckResult = {
  candidates: [
    {
      featureRequestId: FR_ID,
      reason: "Both ask for reliable shift-trade updates.",
      sharedDimension: null,
      title: "Shift trades missing from schedule",
      verdict: "same_need",
    },
  ],
  checkId: CHECK_ID,
  consideredCount: 10,
  degraded: false,
  expiresAt: "2026-10-28T12:30:00.000Z",
  nextAction: "support_or_comment",
  underlyingNeed: "Reliable shift-trade updates",
};

const detail: FeatureRequestDetail = {
  accountCount: 1,
  comments: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  createdBy: { name: "Sofia", type: "staff" },
  description: "Shift trades are not reflected on the schedule.",
  id: FR_ID,
  onBehalfOf: { account: "Harbor Foods", requester: null },
  relatedLinks: [],
  skipReason: null,
  supportCount: 1,
  supports: [],
  title: "Shift trades missing from schedule",
  underlyingNeed: "Reliable shift-trade updates",
};

const supportView: SupportView = {
  account: { name: "Cedar Market", plan: null, segment: "retail", size: "24 stores" },
  actor,
  createdAt: "2026-10-28T12:00:00.000Z",
  id: "support-1",
  quote: null,
  requester: null,
};

const fakeService = (): SignalService => ({
  check: vi.fn(() => Promise.resolve(checkResult)),
  comment: vi.fn(() =>
    Promise.resolve({
      account: "Cedar Market",
      actor,
      body: "Also affects Cedar Market",
      createdAt: "2026-10-28T12:00:00.000Z",
      id: "comment-1",
    }),
  ),
  create: vi.fn(() => Promise.resolve({ ...detail, id: "fr-new" })),
  get: vi.fn(() => Promise.resolve(detail)),
  metrics: vi.fn(() =>
    Promise.resolve({
      checks: 1,
      checksWithSameNeed: 1,
      createsAfterSameNeed: 0,
      fragmentationRate: null,
      reviewCoverage: 0 as const,
      suggestionAcceptance: null,
    }),
  ),
  search: vi.fn(() => Promise.resolve({ items: [detail], nextCursor: null })),
  support: vi.fn(() =>
    Promise.resolve({ created: true, featureRequest: detail, support: supportView }),
  ),
});

interface ToolCallJson {
  result?: {
    content?: { text?: string; type: string }[];
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  };
}

interface ToolError {
  code: string;
  message: string;
  resolution: string;
}

const callTool = async (name: string, args: unknown) => {
  const response = await postApiMcp(
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
      },
      method: "POST",
    }),
  );
  assert.equal(response.status, 200);
  const json = (await response.json()) as ToolCallJson;
  assert.ok(json.result, `no result for ${name}`);
  return json.result;
};

const errorOf = (result: NonNullable<ToolCallJson["result"]>): ToolError => {
  assert.equal(result.isError, true);
  const text = result.content?.[0]?.text ?? "";
  const parsed = JSON.parse(text) as { error: ToolError };
  return parsed.error;
};

const listTools = async () => {
  const response = await postApiMcp(
    new Request("http://meta-cto.localhost/api/mcp", {
      body: JSON.stringify({ id: 2, jsonrpc: "2.0", method: "tools/list", params: {} }),
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  );
  const json = (await response.json()) as {
    result?: { tools?: { description?: string; inputSchema?: unknown; name: string }[] };
  };
  return json.result?.tools ?? [];
};

beforeEach(() => {
  runtime.service = fakeService();
});

test("signal tools are in the catalog and tools/list", async () => {
  const expected = [
    "check_feature_request",
    "comment_on_feature_request",
    "create_feature_request",
    "get_feature_request",
    "search_feature_requests",
    "support_feature_request",
  ];
  assert.deepEqual([...signalMcpToolNames].toSorted(), expected);
  const catalogNames = new Set(starterMcpToolCatalog.map((tool) => tool.name));
  const tools = await listTools();
  const listed = new Set(tools.map((tool) => tool.name));
  for (const name of expected) {
    assert.ok(catalogNames.has(name), `${name} missing from catalog`);
    assert.ok(listed.has(name), `${name} missing from tools/list`);
  }
});

test("descriptions tell agents to check before create", async () => {
  const tools = await listTools();
  const create = tools.find((tool) => tool.name === "create_feature_request");
  const check = tools.find((tool) => tool.name === "check_feature_request");
  assert.match(create?.description ?? "", /check_feature_request/u);
  assert.match(create?.description ?? "", /skipReason/u);
  assert.match(create?.description ?? "", /support_feature_request/u);
  assert.match(check?.description ?? "", /before create_feature_request/u);
  const createSchema = create?.inputSchema as { properties?: Record<string, unknown> };
  assert.ok(createSchema.properties?.checkId);
  assert.ok(createSchema.properties?.draft);
});

test("check_feature_request returns the CheckResult", async () => {
  const result = await callTool("check_feature_request", { actor, draft, onBehalfOf });
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent?.checkId, CHECK_ID);
  assert.equal(result.structuredContent?.nextAction, "support_or_comment");
  assert.ok(runtime.service?.check);
  assert.equal(vi.mocked(runtime.service.check).mock.calls[0]?.[0].draft.title, draft.title);
});

test("create_feature_request with a checkId creates", async () => {
  const result = await callTool("create_feature_request", {
    actor,
    checkId: CHECK_ID,
    draft,
    onBehalfOf,
    skipReason: "Different store type",
  });
  assert.notEqual(result.isError, true);
  assert.equal(
    (result.structuredContent?.featureRequest as { id?: string } | undefined)?.id,
    "fr-new",
  );
});

test("create_feature_request without a check returns check_required", async () => {
  const result = await callTool("create_feature_request", { actor, draft, onBehalfOf });
  const error = errorOf(result);
  assert.equal(error.code, "check_required");
  assert.match(error.resolution, /check_feature_request/u);
  assert.equal(vi.mocked(runtime.service?.create ?? vi.fn()).mock.calls.length, 0);
});

test("support_feature_request supports by id", async () => {
  const result = await callTool("support_feature_request", {
    actor,
    checkId: CHECK_ID,
    featureRequestId: FR_ID,
    onBehalfOf,
    quote: "My traded shifts vanish",
  });
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent?.created, true);
  assert.equal(vi.mocked(runtime.service?.support ?? vi.fn()).mock.calls[0]?.[0], FR_ID);
});

test("comment_on_feature_request comments by id", async () => {
  const result = await callTool("comment_on_feature_request", {
    actor,
    body: "Also affects Cedar Market",
    featureRequestId: FR_ID,
  });
  assert.notEqual(result.isError, true);
  assert.equal((result.structuredContent?.comment as { id?: string } | undefined)?.id, "comment-1");
});

test("search_feature_requests lists items", async () => {
  const result = await callTool("search_feature_requests", { limit: 5, q: "shift trade" });
  assert.notEqual(result.isError, true);
  const items = result.structuredContent?.items as unknown[] | undefined;
  assert.equal(items?.length, 1);
});

test("get_feature_request returns detail", async () => {
  const result = await callTool("get_feature_request", { featureRequestId: FR_ID });
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent?.id, FR_ID);
});

test("SignalError is returned as an actionable tool error", async () => {
  vi.mocked(runtime.service?.get ?? vi.fn()).mockRejectedValueOnce(
    new SignalError({
      code: "not_found",
      message: "Feature request not found",
      resolution: "Call search_feature_requests to find a valid id.",
      status: 404,
    }),
  );
  const error = errorOf(await callTool("get_feature_request", { featureRequestId: "missing" }));
  assert.equal(error.code, "not_found");
  assert.equal(error.message, "Feature request not found");
  assert.match(error.resolution, /search_feature_requests/u);
});

test("invalid input is returned as invalid_input", async () => {
  const error = errorOf(
    await callTool("check_feature_request", { actor, draft: { description: "", title: "x" } }),
  );
  assert.equal(error.code, "invalid_input");
  assert.ok(error.resolution.length > 0);
});

test("missing service is returned as service_unavailable", async () => {
  runtime.service = null;
  const error = errorOf(await callTool("check_feature_request", { actor, draft }));
  assert.equal(error.code, "service_unavailable");
  assert.ok(error.resolution.length > 0);
});
