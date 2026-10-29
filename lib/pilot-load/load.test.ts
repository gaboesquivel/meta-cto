import assert from "node:assert/strict";
import { and, count, eq } from "drizzle-orm";
import { beforeEach, describe, it } from "vitest";

import { workspace as crewdayWorkspace } from "@/data/crewday/seed";
import type { Embedder } from "@/lib/signal/contracts";
import type { SignalDb } from "@/lib/signal/db";
import { PILOT_WORKSPACE } from "@/lib/signal/pilot";
import { createRepository } from "@/lib/signal/repository";
import type { SignalRepository } from "@/lib/signal/repository";
import { accounts, featureRequests, workspaces } from "@/lib/signal/schema";
import { seedCrewday } from "@/lib/signal/seed";
import { createTestDb } from "@/lib/signal/test-db";

import { freezePilot } from "./files";
import { at, pilotFixture } from "./fixture";
import { loadPilot, pilotSeedKey } from "./load";

const fakeEmbedder = (): Embedder & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    embed: (text: string) => {
      calls.push(text);
      const vector = Array.from({ length: 1536 }, () => 0);
      vector[text.length % 1536] = 1;
      return Promise.resolve(vector);
    },
  };
};

const workspaceId = async (db: SignalDb, slug: string) => {
  const [row] = await db.select().from(workspaces).where(eq(workspaces.slug, slug));
  assert.ok(row);
  return row.id;
};

const requestCount = async (db: SignalDb, id: string) => {
  const [row] = await db
    .select({ value: count() })
    .from(featureRequests)
    .where(eq(featureRequests.workspaceId, id));
  return row?.value ?? 0;
};

describe("loadPilot", () => {
  let db: SignalDb;
  let repo: SignalRepository;

  beforeEach(async () => {
    db = await createTestDb();
    repo = createRepository(db);
  });

  it("loads accounts and backlog as seed rows in the Pilot Workspace, with embeddings", async () => {
    const embedder = fakeEmbedder();
    const result = await loadPilot({ embedder, files: pilotFixture(), lock: null, repo });
    assert.equal(result.ok, true);
    assert.ok(result.ok);
    const pilotId = await workspaceId(db, PILOT_WORKSPACE.slug);
    assert.equal(result.workspaceId, pilotId);
    assert.deepEqual(
      { accounts: result.accounts, embedded: result.embedded, requests: result.featureRequests },
      { accounts: 1, embedded: 1, requests: 1 },
    );
    const [row] = await db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.seedKey, pilotSeedKey("fr-swap")));
    assert.ok(row);
    assert.equal(row.workspaceId, pilotId);
    assert.equal(row.origin, "seed");
    assert.equal(row.createdViaCheck, false);
    assert.ok(row.embedding);
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.workspaceId, pilotId), eq(accounts.name, "Acme Diner")));
    assert.equal(account?.id, row.onBehalfOfAccountId);
    assert.equal(embedder.calls.length, 1);
  });

  it("is idempotent and does not overwrite rows or recompute embeddings", async () => {
    const embedder = fakeEmbedder();
    await loadPilot({ embedder, files: pilotFixture(), lock: null, repo });
    const pilotId = await workspaceId(db, PILOT_WORKSPACE.slug);
    await db
      .update(featureRequests)
      .set({ title: "Edited by a Product Manager" })
      .where(eq(featureRequests.seedKey, pilotSeedKey("fr-swap")));

    const again = await loadPilot({ embedder, files: pilotFixture(), lock: null, repo });
    assert.ok(again.ok);
    assert.equal(again.embedded, 0);
    assert.equal(embedder.calls.length, 1);
    assert.equal(await requestCount(db, pilotId), 1);
    const [row] = await db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.seedKey, pilotSeedKey("fr-swap")));
    assert.equal(row?.title, "Edited by a Product Manager");
    assert.deepEqual(again.drifted, ["fr-swap"]);
  });

  it("never touches the Crewday workspace, even with a colliding key", async () => {
    await seedCrewday({ embedder: null, repo });
    const crewdayId = await workspaceId(db, crewdayWorkspace.slug);
    const before = await requestCount(db, crewdayId);
    const [crewdayRow] = await db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.workspaceId, crewdayId))
      .limit(1);
    assert.ok(crewdayRow?.seedKey);

    const files = pilotFixture();
    at(files.backlog.featureRequests, 0).key = crewdayRow.seedKey;
    at(files.answerKey, 0).sharesNeedWith = crewdayRow.seedKey;
    const result = await loadPilot({ embedder: fakeEmbedder(), files, lock: null, repo });
    assert.ok(result.ok);
    assert.equal(await requestCount(db, crewdayId), before);
    assert.equal(await requestCount(db, result.workspaceId), 1);
    const [unchanged] = await db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.id, crewdayRow.id));
    assert.equal(unchanged?.embedding, null);
  });

  it("refuses to load a set changed after freeze, and invalid files", async () => {
    const files = pilotFixture();
    const frozen = freezePilot({ files, lock: null, now: new Date() });
    assert.ok(frozen.ok);
    at(files.backlog.featureRequests, 0).description = "changed";
    const changed = await loadPilot({ embedder: null, files, lock: frozen.lock, repo });
    assert.equal(changed.ok, false);
    assert.match(changed.ok ? "" : changed.message, /changed after freeze: reading reset/u);

    const invalid = pilotFixture();
    at(invalid.backlog.featureRequests, 0).account = "nobody";
    const refused = await loadPilot({ embedder: null, files: invalid, lock: null, repo });
    assert.equal(refused.ok, false);

    const [pilot] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.slug, PILOT_WORKSPACE.slug));
    assert.equal(pilot, undefined);
  });

  it("reports readiness alongside the load", async () => {
    const files = pilotFixture();
    at(files.answerKey, 0).confirmedBy = null;
    const result = await loadPilot({ embedder: null, files, lock: null, repo });
    assert.ok(result.ok);
    assert.deepEqual(result.status.unconfirmed, ["fb-1"]);
    assert.equal(result.status.frozen, false);
  });
});
