import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";

import type { Embedder, Judge } from "@/lib/signal/contracts";
import { createTestDb } from "@/lib/signal/test-db";

import { PILOT_WORKSPACE } from "@/lib/signal/pilot";
import { featureRequests, workspaces } from "@/lib/signal/schema";
import { DEFAULT_JUDGE_TIMEOUT_MS } from "@/lib/signal/service/context";

import {
  createRuntimeReviewService,
  createRuntimeService,
  getSignalService,
  judgeTimeoutFromEnv,
} from "./index";

const embedder: Embedder = {
  embed: (text) => {
    const vector = Array.from({ length: 1536 }, () => 0);
    vector[text.length % 1536] = 1;
    return Promise.resolve(vector);
  },
};

const judge: Judge = {
  judge: () => Promise.resolve({ judgments: [], underlyingNeed: "Reliable shift trades" }),
};

const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe("signal runtime", () => {
  it("returns null when the database is not configured", () => {
    delete process.env.DATABASE_URL;
    assert.equal(getSignalService(), null);
  });

  it("returns null when AI keys are missing", () => {
    process.env.DATABASE_URL = "postgres://user:pass@localhost/db";
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    assert.equal(getSignalService(), null);
  });

  it("composes a working service on the Crewday workspace", async () => {
    const db = await createTestDb();
    const service = createRuntimeService({ db, embedder, judge });

    const result = await service.check({
      actor: { name: "Ana", type: "staff" },
      draft: { description: "Trades don't show up for my manager", title: "Trades not syncing" },
    });

    assert.equal(result.degraded, false);
    assert.equal(result.nextAction, "create");
  });

  it("retries the workspace lookup after a transient database error", async () => {
    const db = await createTestDb();
    let failures = 1;
    const flaky = new Proxy(db, {
      get(target, property, receiver) {
        if (property === "insert" && failures > 0) {
          failures -= 1;
          return () => {
            throw new Error("connection reset");
          };
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const service = createRuntimeService({ db: flaky, embedder, judge });

    await assert.rejects(service.search({}), /connection reset/u);
    const page = await service.search({});
    assert.deepEqual(page.items, []);
  });
});

describe("pilot runtime", () => {
  const filing = {
    actor: { name: "pilot-agent", type: "agent" as const },
    draft: { description: "Trades don't show up for my manager", title: "Trades not syncing" },
  };

  const fileThroughCheck = async (service: ReturnType<typeof createRuntimeService>) => {
    const check = await service.check(filing);
    return await service.create({ ...filing, checkId: check.checkId });
  };

  it("acts on the Pilot Workspace with Origin pilot, not the Crewday demo", async () => {
    const db = await createTestDb();
    const pilot = createRuntimeService({ db, embedder, judge, origin: "pilot" });
    const created = await fileThroughCheck(pilot);

    const rows = await db.select().from(workspaces);
    const pilotRow = rows.find((row) => row.slug === PILOT_WORKSPACE.slug);
    assert.ok(pilotRow, "the Pilot Workspace row exists");
    const [stored] = await db.select().from(featureRequests);
    assert.equal(stored?.id, created.id);
    assert.equal(stored?.workspaceId, pilotRow.id);
    assert.equal(stored?.origin, "pilot");
    // Pilot rows are not demo data: the demo seed reset never deletes them.
    assert.equal(stored?.isDemo, false);
  });

  it("keeps demo and pilot rows apart in both directions", async () => {
    const db = await createTestDb();
    const demo = createRuntimeService({ db, embedder, judge });
    const pilot = createRuntimeService({ db, embedder, judge, origin: "pilot" });
    const demoRequest = await fileThroughCheck(demo);
    const pilotRequest = await fileThroughCheck(pilot);

    const demoPage = await demo.search({});
    const pilotPage = await pilot.search({});
    assert.deepEqual(
      demoPage.items.map((item) => item.id),
      [demoRequest.id],
    );
    assert.deepEqual(
      pilotPage.items.map((item) => item.id),
      [pilotRequest.id],
    );
    await assert.rejects(pilot.get(demoRequest.id), { code: "not_found" });
    await assert.rejects(demo.get(pilotRequest.id), { code: "not_found" });
  });

  it("scopes review and metrics to the Pilot Workspace, defaulting to Origin pilot", async () => {
    const db = await createTestDb();
    await fileThroughCheck(createRuntimeService({ db, embedder, judge }));
    await fileThroughCheck(createRuntimeService({ db, embedder, judge, origin: "pilot" }));
    await createRuntimeService({ db, embedder, judge, origin: "pilot" }).check(filing);

    const demoReview = createRuntimeReviewService({ db });
    const pilotReview = createRuntimeReviewService({ db, origin: "pilot" });
    const demoMetrics = await demoReview.metrics();
    const pilotMetrics = await pilotReview.metrics();
    assert.equal(demoMetrics.origin, "demo");
    assert.equal(demoMetrics.checks, 1);
    assert.equal(pilotMetrics.origin, "pilot");
    assert.equal(pilotMetrics.checks, 2);
    // Reading demo Origin inside the Pilot Workspace finds nothing: the Workspace bounds it too.
    const demoInPilot = await pilotReview.metrics({ origin: "demo" });
    const pilotInDemo = await demoReview.metrics({ origin: "pilot" });
    assert.equal(demoInPilot.checks, 0);
    assert.equal(pilotInDemo.checks, 0);

    const demoQueue = await demoReview.queue();
    const pilotQueue = await pilotReview.queue();
    assert.equal(demoQueue.counts.new, 1);
    assert.equal(pilotQueue.counts.new, 1);
    assert.notEqual(demoQueue.items[0]?.featureRequest.id, pilotQueue.items[0]?.featureRequest.id);
  });
});

describe("judgeTimeoutFromEnv", () => {
  it("reads SIGNAL_JUDGE_TIMEOUT_MS and ignores invalid values", () => {
    process.env.SIGNAL_JUDGE_TIMEOUT_MS = "15000";
    assert.equal(judgeTimeoutFromEnv(), 15_000);
    process.env.SIGNAL_JUDGE_TIMEOUT_MS = "nope";
    assert.equal(judgeTimeoutFromEnv(), undefined);
    delete process.env.SIGNAL_JUDGE_TIMEOUT_MS;
    assert.equal(judgeTimeoutFromEnv(), undefined);
  });

  it("defaults the service judge timeout to 20 seconds", () => {
    assert.equal(DEFAULT_JUDGE_TIMEOUT_MS, 20_000);
  });
});

describe("review runtime", () => {
  it("returns null without a database", async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();
    const fresh = await import("./index");
    assert.equal(fresh.getReviewService(), null);
  });

  it("composes a working review service on the Crewday workspace", async () => {
    const db = await createTestDb();
    const review = createRuntimeReviewService({ db, judge });
    const queue = await review.queue();
    assert.deepEqual(queue.counts, { backlog: 0, new: 0 });
    const result = await review.scan({ limit: 5 });
    assert.equal(result.scanned, 0);
  });

  it("reports metrics with only a database", async () => {
    const db = await createTestDb();
    const service = createRuntimeService({ db, embedder, judge });
    await service.check({
      actor: { name: "Ana", type: "staff" },
      draft: { description: "Trades don't show up for my manager", title: "Trades not syncing" },
    });

    const review = createRuntimeReviewService({ db });
    const metrics = await review.metrics();
    assert.equal(metrics.checks, 1);
    assert.deepEqual(metrics.intakeDuplicateRate, { duplicates: 0, rate: null, reviewed: 0 });
  });

  it("keeps an eval runtime's Checks out of demo metrics", async () => {
    const db = await createTestDb();
    const evalService = createRuntimeService({ db, embedder, judge, origin: "eval" });
    await evalService.check({
      actor: { name: "eval", type: "agent" },
      draft: { description: "Trades don't show up for my manager", title: "Trades not syncing" },
    });

    const review = createRuntimeReviewService({ db });
    const demo = await review.metrics();
    const evalRun = await review.metrics({ origin: "eval" });
    assert.equal(demo.checks, 0);
    assert.equal(evalRun.checks, 1);
  });

  it("reports the scan unavailable without a judge", async () => {
    const db = await createTestDb();
    const review = createRuntimeReviewService({ db });
    await assert.rejects(review.scan({ limit: 5 }), (error: Error & { code?: string }) => {
      assert.equal(error.code, "service_unavailable");
      return true;
    });
  });
});
