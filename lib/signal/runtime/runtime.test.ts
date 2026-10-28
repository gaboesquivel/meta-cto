import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";

import type { Embedder, Judge } from "@/lib/signal/contracts";
import { createTestDb } from "@/lib/signal/test-db";

import { DEFAULT_JUDGE_TIMEOUT_MS } from "@/lib/signal/service/context";

import { createRuntimeService, getSignalService, judgeTimeoutFromEnv } from "./index";

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
    const metrics = await service.metrics();
    assert.equal(metrics.checks, 1);
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
