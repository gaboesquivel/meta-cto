import assert from "node:assert/strict";
import { afterEach, describe, it, vi } from "vitest";

import type { Embedder, Judge } from "@/lib/signal/contracts";
import { createTestDb } from "@/lib/signal/test-db";

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
