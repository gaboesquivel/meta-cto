import assert from "node:assert/strict";
import { afterEach, describe, it } from "vitest";

import type { Embedder, Judge } from "@/lib/signal/contracts";
import { createTestDb } from "@/lib/signal/test-db";

import { createRuntimeService, getSignalService } from "./index";

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
