/**
 * Contract test (spec 004 task 03, decision 0004): no REST operation or MCP tool returns Answer
 * Key entries, feedback items or Held-Out Set v2 pairs. Every OpenAPI operation and every tool on
 * the public and Operator MCP is enumerated and its schemas walked for item-level ground-truth
 * fields; the Proof Report, the only reader of the stored ground truth, is built from a database
 * holding marked pilot data and v2 runs, and its REST and MCP payloads carry aggregates only.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test, vi } from "vitest";

import { buildOpenApiDocument } from "@/lib/openapi/build-openapi-document";
import { PILOT_KEY_HEADER, PILOT_WORKSPACE } from "@/lib/signal/pilot";
import type { HeldOutV2Lock, PilotLock } from "@/lib/signal/proof/locks";
import { createRepository } from "@/lib/signal/repository";
import type { SignalRepository } from "@/lib/signal/repository";
import type * as Sources from "@/lib/signal/proof/sources";
import { createTestDb } from "@/lib/signal/test-db";

const state = vi.hoisted(() => ({ repo: null as unknown }));

vi.mock("@/lib/signal/runtime", () => ({
  getReviewService: () => null,
  getSignalService: () => null,
}));

vi.mock("@/lib/signal/proof/sources", async (importOriginal) => {
  const actual = await importOriginal<typeof Sources>();
  return {
    ...actual,
    getProofReport: () =>
      actual.getProofReport({
        ...actual.runtimeProofDeps(),
        locks: () => ({
          pilot: { lock: PILOT_LOCK, ok: true },
          v2: { lock: V2_LOCK, ok: true },
        }),
        promptVersion: () => "pv-current00000",
        store: () => actual.repositoryProofStore(state.repo as SignalRepository),
      }),
  };
});

const { GET: getProof } = await import("../../app/api/proof/route");
const { POST: postPublicMcp } = await import("../../app/api/mcp/route");
const { POST: postOperatorMcp } = await import("../../app/api/mcp/operator/route");

const PILOT_KEY = "pilot-key-for-exposure-0123";
const SECRET = "test-operator-secret-16+";
const PILOT = { [PILOT_KEY_HEADER]: PILOT_KEY };
const OPERATOR = { authorization: `Bearer ${SECRET}` };

const PILOT_LOCK: PilotLock = {
  accounts: 1,
  expectedBacklogDuplicateRate: 0.2,
  featureRequests: 1,
  feedback: 2,
  fingerprint: `sha256:${"a".repeat(64)}`,
  frozenAt: "2026-10-30T09:00:00.000Z",
  sharesNeed: 1,
};
const V2_LOCK: HeldOutV2Lock = {
  fingerprint: `sha256:${"b".repeat(64)}`,
  frozenAt: "2026-10-30T12:00:00.000Z",
  pairs: 2,
  sameNeedPositives: 1,
  set: "held-out-v2",
};

/** Marks planted in every stored ground-truth item; none may appear in any response. */
const MARK = "zz-ground-truth";

/** Field names that only item-level ground truth carries. */
const ITEM_FIELDS = new Set([
  "answerKey",
  "answerKeyEntries",
  "confirmedAt",
  "confirmedBy",
  "failureDetails",
  "feedbackItems",
  "labels",
  "needId",
  "results",
]);
/** Fields that may appear only as counts, never as lists of items. */
const COUNT_FIELDS = new Set(["feedback", "pairs"]);

interface Finding {
  at: string;
  field: string;
}

/** Walks a JSON Schema (or any JSON) and reports item-level ground-truth fields. */
const findItemFields = (node: unknown, at: string, found: Finding[] = []): Finding[] => {
  if (Array.isArray(node)) {
    for (const [i, child] of node.entries()) findItemFields(child, `${at}[${i}]`, found);
    return found;
  }
  if (node === null || typeof node !== "object") return found;
  const record = node as Record<string, unknown>;
  const properties = record.properties as Record<string, Record<string, unknown>> | undefined;
  if (properties && typeof properties === "object") {
    for (const [field, schema] of Object.entries(properties)) {
      if (ITEM_FIELDS.has(field)) found.push({ at, field });
      if (COUNT_FIELDS.has(field) && schema?.type !== "integer" && schema?.type !== "number") {
        found.push({ at, field: `${field} (not a count)` });
      }
    }
  }
  for (const [key, child] of Object.entries(record)) findItemFields(child, `${at}.${key}`, found);
  return found;
};

/** Walks a JSON payload: item fields as keys, and count fields that are not numbers. */
const findPayloadItems = (node: unknown, at: string, found: Finding[] = []): Finding[] => {
  if (Array.isArray(node)) {
    for (const [i, child] of node.entries()) findPayloadItems(child, `${at}[${i}]`, found);
    return found;
  }
  if (node === null || typeof node !== "object") return found;
  for (const [key, child] of Object.entries(node)) {
    if (ITEM_FIELDS.has(key)) found.push({ at, field: key });
    if (COUNT_FIELDS.has(key) && typeof child !== "number") found.push({ at, field: key });
    findPayloadItems(child, `${at}.${key}`, found);
  }
  return found;
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
      isError?: boolean;
      structuredContent?: unknown;
      tools?: {
        description?: string;
        inputSchema?: unknown;
        name: string;
        outputSchema?: unknown;
      }[];
    };
  };
  assert.ok(json.result, `no JSON-RPC result in ${raw}`);
  return { raw, result: json.result };
};

const seed = async (repo: SignalRepository) => {
  const { id: workspaceId } = await repo.ensureWorkspace(PILOT_WORKSPACE);
  await repo.storePilotGroundTruth({
    answerKey: [
      {
        confirmedAt: "2026-10-27",
        confirmedBy: `${MARK}-person`,
        key: `${MARK}-fr`,
        kind: "feature_request",
        needId: `${MARK}-need-swap`,
      },
      {
        confirmedAt: "2026-10-27",
        confirmedBy: `${MARK}-person`,
        key: `${MARK}-fb-1`,
        kind: "feedback",
        needId: `${MARK}-need-swap`,
      },
    ],
    counts: { accounts: 1, featureRequests: 1, feedback: 2, sharesNeed: 1 },
    expectedBacklogDuplicateRate: 0.2,
    feedback: [1, 2].map((n) => ({
      accountId: null,
      accountKey: `${MARK}-acme`,
      customerName: `${MARK}-customer`,
      customerRole: "Owner",
      description: `${MARK}-feedback-description-${n}`,
      key: `${MARK}-fb-${n}`,
      title: `${MARK}-feedback-title-${n}`,
    })),
    fingerprint: PILOT_LOCK.fingerprint,
    manifest: { backlogAuthor: `${MARK}-author` },
    workspaceId,
  });
  await repo.recordEvalRun({
    completed: 2,
    failureDetails: [{ error: `${MARK}-error`, id: `${MARK}-pair-x` }],
    failures: 0,
    fingerprint: V2_LOCK.fingerprint,
    message: null,
    model: "judge",
    pairs: 2,
    promptVersion: "pv-current00000",
    readings: {
      failures: 0,
      relatedNeed: { predicted: 1, truePositives: 1 },
      sameNeed: { predicted: 1, truePositives: 1 },
      sameNeedPositives: 1,
    },
    repeat: false,
    results: [{ expected: "same_need", id: `${MARK}-pair-1`, predicted: "same_need" }],
    sameNeedPositives: 1,
    setName: "held-out-v2",
    status: "completed",
  });
};

beforeEach(async () => {
  const repo = createRepository(await createTestDb());
  await seed(repo);
  state.repo = repo;
  vi.stubEnv("SIGNAL_PILOT_KEY", PILOT_KEY);
  vi.stubEnv("OPERATOR_SECRET", SECRET);
  vi.stubEnv("OPERATOR_ACCESS_TOKEN", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const METHODS = ["delete", "get", "patch", "post", "put"] as const;
const GROUND_TRUTH_PATH =
  /answer-?key|ground-?truth|held-?out|pilot-?(?:data|feedback)|eval-?runs?/iu;

describe("REST: no operation returns item-level ground truth", () => {
  const document = buildOpenApiDocument("http://localhost");
  const operations = Object.entries(document.paths).flatMap(([route, item]) =>
    METHODS.filter((method) => method in (item as object)).map((method) => ({
      method,
      operation: (item as Record<string, unknown>)[method],
      route,
    })),
  );

  test("the operation list is enumerated", () => {
    assert.ok(operations.length >= 10, `only ${operations.length} operations`);
    assert.ok(operations.some((op) => op.route === "/api/proof" && op.method === "get"));
  });

  test("no route names Answer Key, feedback items, v2 pairs or eval runs", () => {
    const routes = operations.map((op) => op.route).filter((r) => GROUND_TRUTH_PATH.test(r));
    assert.deepEqual(routes, []);
  });

  test("no operation or component schema carries item-level ground-truth fields", () => {
    const found = [
      ...operations.flatMap((op) => findItemFields(op.operation, `${op.method} ${op.route}`)),
      ...findItemFields(document.components, "components"),
    ];
    assert.deepEqual(found, []);
  });
});

describe("MCP: no tool returns item-level ground truth", () => {
  const surfaces = [
    ["public MCP", postPublicMcp, PILOT],
    ["Operator MCP", postOperatorMcp, OPERATOR],
  ] as const;

  for (const [name, handler, headers] of surfaces) {
    test(`${name}: every tool's name and schemas are free of ground-truth items`, async () => {
      const { result } = await rpc(handler, { method: "tools/list", params: {} }, headers);
      const tools = result.tools ?? [];
      assert.ok(tools.length > 0, "no tools listed");
      assert.ok(tools.some((tool) => tool.name === "proof_report"));
      const named = tools
        .map((t) => t.name)
        .filter((n) => GROUND_TRUTH_PATH.test(n.replaceAll("_", "-")));
      assert.deepEqual(named, []);
      const found = tools.flatMap((tool) => [
        ...findItemFields(tool.inputSchema, `${tool.name}.input`),
        ...findItemFields(tool.outputSchema, `${tool.name}.output`),
      ]);
      assert.deepEqual(found, []);
    });
  }
});

describe("Proof Report: aggregates only, from stored ground truth", () => {
  test("REST, public MCP and Operator MCP payloads carry no stored item or label", async () => {
    const rest = await getProof(new Request("http://localhost/api/proof", { headers: PILOT }));
    assert.equal(rest.status, 200);
    const restRaw = await rest.text();
    const restBody = JSON.parse(restRaw) as {
      readiness: { pilotFiles: { loaded?: boolean }; heldOutV2: { frozen?: boolean } };
    };
    // The report did read the stored data: loaded, frozen, and a v2 reading.
    assert.equal(restBody.readiness.pilotFiles.loaded, true);
    assert.equal(restBody.readiness.heldOutV2.frozen, true);
    assert.match(restRaw, /pv-current00000/u);

    const outcomes = [
      ["REST", restRaw, restBody],
      ...(await Promise.all(
        (
          [
            ["public MCP", postPublicMcp, PILOT],
            ["Operator MCP", postOperatorMcp, OPERATOR],
          ] as const
        ).map(async ([name, handler, headers]) => {
          const { raw, result } = await rpc(
            handler,
            { method: "tools/call", params: { arguments: {}, name: "proof_report" } },
            headers,
          );
          assert.notEqual(result.isError, true, `${name}: ${raw}`);
          return [name, raw, result.structuredContent] as const;
        }),
      )),
    ] as const;

    for (const [name, raw, body] of outcomes) {
      assert.doesNotMatch(raw, new RegExp(MARK, "u"), `${name} leaked a stored item`);
      assert.deepEqual(findPayloadItems(body, name), [], `${name} has item-level fields`);
    }
  });
});
