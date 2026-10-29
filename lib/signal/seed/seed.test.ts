import assert from "node:assert/strict";
import { count, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, it } from "vitest";

import {
  seedAccounts,
  seedComments,
  seedFeatureRequests,
  seedRelatedLinks,
  seedSupports,
  workspace as seedWorkspace,
} from "../../../data/crewday/seed";
import type { Embedder } from "../contracts";
import type { SignalDb } from "../db";
import { createRepository } from "../repository";
import type { SignalRepository } from "../repository";
import { accounts, comments, featureRequests, relatedLinks, supports, workspaces } from "../schema";
import { createTestDb } from "../test-db";
import { PILOT_WORKSPACE } from "../pilot";
import { seedCrewday } from "./index";

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

type CountedTable =
  | typeof accounts
  | typeof comments
  | typeof featureRequests
  | typeof relatedLinks
  | typeof supports
  | typeof workspaces;

const tableCount = async (db: SignalDb, table: CountedTable) => {
  const [row] = await db.select({ value: count() }).from(table);
  return row?.value ?? 0;
};

const counts = async (db: SignalDb) => ({
  accounts: await tableCount(db, accounts),
  comments: await tableCount(db, comments),
  featureRequests: await tableCount(db, featureRequests),
  relatedLinks: await tableCount(db, relatedLinks),
  supports: await tableCount(db, supports),
  workspaces: await tableCount(db, workspaces),
});

describe("seedCrewday", () => {
  let db: SignalDb;
  let repo: SignalRepository;

  beforeEach(async () => {
    db = await createTestDb();
    repo = createRepository(db);
  });

  it("seeds the Crewday data and is idempotent", async () => {
    await seedCrewday({ embedder: null, repo });
    const first = await counts(db);
    assert.deepEqual(first, {
      accounts: seedAccounts.length,
      comments: seedComments.length,
      featureRequests: seedFeatureRequests.length,
      relatedLinks: seedRelatedLinks.length,
      supports: seedSupports.length,
      workspaces: 1,
    });

    await seedCrewday({ embedder: null, repo });
    assert.deepEqual(await counts(db), first);
  });

  it("marks seeded rows as demo with seed keys and underlying needs", async () => {
    await seedCrewday({ embedder: null, repo });
    const [sample] = seedFeatureRequests;
    assert.ok(sample);
    const [row] = await db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.seedKey, sample.key));
    assert.ok(row);
    assert.equal(row.isDemo, true);
    assert.equal(row.underlyingNeed, sample.underlyingNeed);
    assert.equal(row.requesterName, sample.requester.name);
    assert.equal(row.embedding, null);
    const demoSupports = await db.select().from(supports).where(eq(supports.isDemo, true));
    assert.equal(demoSupports.length, seedSupports.length);
    assert.ok(demoSupports.every((support) => support.seedKey));
  });

  it("fills missing embeddings from title and description", async () => {
    const embedder = fakeEmbedder();
    await seedCrewday({ embedder, repo });
    const missing = await db
      .select()
      .from(featureRequests)
      .where(isNull(featureRequests.embedding));
    assert.equal(missing.length, 0);
    const [sample] = seedFeatureRequests;
    assert.ok(sample);
    assert.ok(embedder.calls.includes(`${sample.title}\n\n${sample.description}`));

    await seedCrewday({ embedder, repo });
    assert.equal(embedder.calls.length, seedFeatureRequests.length);
  });

  it("never touches user-created rows, including on reset", async () => {
    const { id: workspaceId } = await repo.ensureWorkspace(seedWorkspace);
    const user = await repo.insertFeatureRequest({
      createdByActorName: "Real Person",
      createdByActorType: "staff",
      description: "User description",
      embedding: null,
      origin: "demo",
      title: "User request",
      underlyingNeed: "User need",
      workspaceId,
    });

    await seedCrewday({ embedder: null, repo });
    await seedCrewday({ db, embedder: null, repo, reset: true });
    const after = await repo.getFeatureRequest(user.id);
    assert.ok(after);
    assert.equal(after.title, "User request");
    assert.equal(after.isDemo, false);
    const all = await db.select({ value: count() }).from(featureRequests);
    assert.equal(all[0]?.value, seedFeatureRequests.length + 1);
  });

  it("reset deletes demo rows only in the Crewday Demo Workspace, never Pilot Workspace rows", async () => {
    await seedCrewday({ embedder: null, repo });
    const pilot = await repo.ensureWorkspace(PILOT_WORKSPACE);
    const account = await repo.upsertAccount({ name: "Acme Diner", workspaceId: pilot.id });
    // The pilot loader stores backlog rows through the seed upsert, which marks them demo.
    const backlog = await repo.upsertSeedFeatureRequest({
      createdByActorName: "Sam (CSM)",
      createdByActorType: "staff",
      description: "Staff want to swap shifts.",
      embedding: null,
      onBehalfOfAccountId: account.id,
      seedKey: "pilot:fr-swap",
      title: "Shift swaps in the app",
      underlyingNeed: null,
      workspaceId: pilot.id,
    });
    assert.equal(backlog.isDemo, true);
    const filed = await repo.insertFeatureRequest({
      createdByActorName: "Helper bot",
      createdByActorType: "agent",
      createdViaCheck: true,
      description: "Let my team trade shifts.",
      embedding: null,
      origin: "pilot",
      title: "Trade shifts",
      underlyingNeed: null,
      workspaceId: pilot.id,
    });
    await repo.insertSupport({
      accountId: account.id,
      actorName: "Helper bot",
      actorType: "agent",
      featureRequestId: backlog.id,
      isDemo: true,
    });
    await repo.insertComment({
      accountId: account.id,
      actorName: "Helper bot",
      actorType: "agent",
      body: "Also wants trades.",
      featureRequestId: backlog.id,
      isDemo: true,
    });
    await repo.insertRelatedLink({
      a: filed.id,
      b: backlog.id,
      isDemo: true,
      reason: "both about shifts",
      sharedDimension: "shifts",
      source: "check",
    });

    await seedCrewday({ db, embedder: null, repo, reset: true });

    const pilotRows = await db
      .select({ id: featureRequests.id })
      .from(featureRequests)
      .where(eq(featureRequests.workspaceId, pilot.id));
    assert.deepEqual(pilotRows.map((row) => row.id).toSorted(), [backlog.id, filed.id].toSorted());
    const kept = await Promise.all([
      repo.listSupports(backlog.id),
      repo.listComments(backlog.id),
      repo.listRelatedLinks(backlog.id),
    ]);
    assert.deepEqual(
      kept.map((rows) => rows.length),
      [1, 1, 1],
    );
  });

  it("reset restores demo state after demo rows are edited", async () => {
    await seedCrewday({ embedder: null, repo });
    const [sample] = seedFeatureRequests;
    assert.ok(sample);
    await db
      .update(featureRequests)
      .set({ title: "Vandalized" })
      .where(eq(featureRequests.seedKey, sample.key));
    const before = await counts(db);

    await seedCrewday({ db, embedder: null, repo, reset: true });
    const [row] = await db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.seedKey, sample.key));
    assert.equal(row?.title, sample.title);
    assert.deepEqual(await counts(db), before);
  });
});
