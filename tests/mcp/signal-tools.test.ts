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
const { POST: postSupportRest } =
  await import("../../app/api/feature-requests/[id]/supports/route");
const { resetSignalWriteLimit, SIGNAL_WRITE_LIMIT } = await import("../../lib/signal/http");

const FR_ID = "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const MISSING_ID = "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a";
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
  duplicateOf: null,
  duplicates: [],
  id: FR_ID,
  onBehalfOf: { account: "Harbor Foods", requester: null },
  relatedLinks: [],
  reviewHistory: [],
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
  details?: unknown;
  message: string;
  resolution: string;
}

const callTool = async (name: string, args: unknown, ip = "203.0.113.1") => {
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
        "x-forwarded-for": ip,
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
  resetSignalWriteLimit();
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
  const error = errorOf(await callTool("get_feature_request", { featureRequestId: MISSING_ID }));
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

test("signal writes over MCP share the per-IP write budget and return rate_limited", async () => {
  const ip = "198.51.100.7";
  for (let index = 0; index < SIGNAL_WRITE_LIMIT; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- sequential calls consume the budget in order
    const result = await callTool("check_feature_request", { actor, draft }, ip);
    assert.notEqual(result.isError, true);
  }
  const error = errorOf(
    await callTool(
      "support_feature_request",
      {
        actor,
        featureRequestId: FR_ID,
        onBehalfOf,
      },
      ip,
    ),
  );
  assert.equal(error.code, "rate_limited");
  assert.ok(error.message.length > 0);
  assert.match(error.resolution, /retry/iu);
  assert.match(error.resolution, /\d+ second/u);
  assert.equal(vi.mocked(runtime.service?.support ?? vi.fn()).mock.calls.length, 0);
  // REST shares the same per-IP budget.
  const rest = await postSupportRest(
    new Request(`http://meta-cto.localhost/api/feature-requests/${FR_ID}/supports`, {
      body: JSON.stringify({ actor, onBehalfOf }),
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      method: "POST",
    }),
    { params: Promise.resolve({ id: FR_ID }) },
  );
  assert.equal(rest.status, 429);
  // Reads stay available, and another client keeps its own budget.
  const read = await callTool("get_feature_request", { featureRequestId: FR_ID }, ip);
  assert.notEqual(read.isError, true);
  const otherClient = await callTool("check_feature_request", { actor, draft }, "198.51.100.8");
  assert.notEqual(otherClient.isError, true);
});

test("search_feature_requests with a query consumes the write budget; without q it does not", async () => {
  const ip = "198.51.100.9";
  for (let index = 0; index < SIGNAL_WRITE_LIMIT + 2; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- sequential calls consume the budget in order
    const result = await callTool("search_feature_requests", { limit: 5 }, ip);
    assert.notEqual(result.isError, true);
  }
  for (let index = 0; index < SIGNAL_WRITE_LIMIT; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- sequential calls consume the budget in order
    const result = await callTool("search_feature_requests", { q: "shift trade" }, ip);
    assert.notEqual(result.isError, true);
  }
  const error = errorOf(await callTool("search_feature_requests", { q: "shift trade" }, ip));
  assert.equal(error.code, "rate_limited");
});

test("a repeat support is refused with already_supported and the existing support", async () => {
  vi.mocked(runtime.service?.support ?? vi.fn()).mockResolvedValueOnce({
    created: false,
    featureRequest: detail,
    support: supportView,
  });
  const error = errorOf(
    await callTool("support_feature_request", { actor, featureRequestId: FR_ID, onBehalfOf }),
  );
  assert.equal(error.code, "already_supported");
  assert.match(error.resolution, /already supports this Feature Request/u);
  assert.match(error.resolution, /Comment/u);
  const details = error.details as { featureRequest?: { id?: string }; support?: { id?: string } };
  assert.equal(details.support?.id, "support-1");
  assert.equal(details.featureRequest?.id, FR_ID);
});

test("support_feature_request description mentions already_supported", async () => {
  const tools = await listTools();
  const support = tools.find((tool) => tool.name === "support_feature_request");
  assert.match(support?.description ?? "", /already_supported/u);
});

test("unexpected errors return a generic internal_error without leaking internals", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(runtime.service?.get ?? vi.fn()).mockRejectedValueOnce(
    new Error("connect ECONNREFUSED postgres://user:secret@db/neon"),
  );
  const result = await callTool("get_feature_request", { featureRequestId: FR_ID });
  const error = errorOf(result);
  assert.equal(error.code, "internal_error");
  assert.equal(error.message, "Unexpected error");
  assert.doesNotMatch(JSON.stringify(result), /secret|ECONNREFUSED/u);
  assert.equal(spy.mock.calls.length, 1);
  spy.mockRestore();
});

test("service_unavailable drops raw string details but keeps structured ones", async () => {
  vi.mocked(runtime.service?.check ?? vi.fn()).mockRejectedValueOnce(
    new SignalError({
      code: "service_unavailable",
      details: "AI Gateway 401: invalid key sk-live-123",
      message: "The embedding provider is unavailable.",
      resolution: "Retry later.",
      status: 503,
    }),
  );
  const raw = await callTool("check_feature_request", { actor, draft });
  assert.equal(errorOf(raw).code, "service_unavailable");
  assert.equal(errorOf(raw).details, undefined);
  assert.doesNotMatch(JSON.stringify(raw), /sk-live-123/u);

  vi.mocked(runtime.service?.check ?? vi.fn()).mockRejectedValueOnce(
    new SignalError({
      code: "service_unavailable",
      details: { retryAfterSeconds: 5 },
      message: "The embedding provider is unavailable.",
      resolution: "Retry later.",
      status: 503,
    }),
  );
  assert.deepEqual(errorOf(await callTool("check_feature_request", { actor, draft })).details, {
    retryAfterSeconds: 5,
  });
});

test("a malformed featureRequestId returns not_found like REST", async () => {
  for (const name of [
    "get_feature_request",
    "support_feature_request",
    "comment_on_feature_request",
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- one tool at a time keeps failures readable
    const result = await callTool(name, {
      actor,
      body: "x",
      featureRequestId: "fr-sofia",
      onBehalfOf,
    });
    const error = errorOf(result);
    assert.equal(error.code, "not_found", name);
    assert.ok(error.resolution.length > 0);
  }
  assert.equal(vi.mocked(runtime.service?.get ?? vi.fn()).mock.calls.length, 0);
});
