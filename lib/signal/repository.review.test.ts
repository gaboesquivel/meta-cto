import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, it } from "vitest";

import type { SignalDb } from "./db";
import { createRepository, toReviewDecision, toSuspectedDuplicate } from "./repository";
import type { SignalRepository } from "./repository";
import * as schema from "./schema";
import { createTestDb } from "./test-db";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../drizzle");

const unit = (index: number) => {
  const values = Array.from({ length: 1536 }, () => 0);
  values[index] = 1;
  return values;
};

const idsOf = (rows: { id: string }[]) => rows.map((row) => row.id);
const sizeOf = (rows: unknown[]) => rows.length;

/** Drizzle wraps database errors; match the Postgres message on the cause. */
const databaseError = (pattern: RegExp) => (error: unknown) =>
  pattern.test(String((error as { cause?: { message?: string } }).cause?.message));

/** A migrations folder holding only the spec 001 migrations (0000, 0001). */
const spec001Migrations = async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "signal-migrations-"));
  await cp(MIGRATIONS, folder, { recursive: true });
  const journalPath = path.join(folder, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf-8")) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, 2);
  await writeFile(journalPath, JSON.stringify(journal));
  return folder;
};

describe("review migration", () => {
  it("applies on top of the spec 001 schema without touching existing rows", async () => {
    const client = new PGlite({ extensions: { vector } });
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: await spec001Migrations() });

    await client.exec(`
      insert into workspaces (id, name, slug) values ('00000000-0000-4000-8000-000000000001', 'Crewday', 'crewday');
      insert into feature_requests (id, workspace_id, title, description, created_by_actor_name, created_by_actor_type, check_id, seed_key, is_demo)
      values
        ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'Seeded', 'seeded', 'seed', 'staff', null, 'fr-1', true),
        ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001', 'Checked', 'checked', 'Ana', 'staff', '00000000-0000-4000-8000-0000000000c1', null, false);
    `);
    const before = await client.query<Record<string, unknown>>(
      "select id, title, description, check_id, seed_key, is_demo, created_at from feature_requests order by id",
    );

    await migrate(db, { migrationsFolder: MIGRATIONS });

    const after = await client.query<Record<string, unknown>>(
      "select id, title, description, check_id, seed_key, is_demo, created_at, created_via_check, duplicate_of_id, suspicion_scanned_at from feature_requests order by id",
    );
    assert.deepEqual(
      after.rows.map(
        ({ created_via_check: _via, duplicate_of_id: _dup, suspicion_scanned_at: _scan, ...row }) =>
          row,
      ),
      before.rows,
    );
    assert.deepEqual(
      after.rows.map((row) => [
        row.title,
        row.created_via_check,
        row.duplicate_of_id,
        row.suspicion_scanned_at,
      ]),
      [
        ["Seeded", false, null, null],
        ["Checked", true, null, null],
      ],
    );
  });
});

describe("review repository", () => {
  let db: SignalDb;
  let repo: SignalRepository;
  let workspaceId: string;

  beforeEach(async () => {
    db = await createTestDb();
    repo = createRepository(db);
    const workspace = await repo.ensureWorkspace({ name: "Crewday Demo", slug: "crewday" });
    workspaceId = workspace.id;
  });

  const addRequest = (title: string, extra: { checkId?: string; embedding?: number[] } = {}) =>
    repo.insertFeatureRequest({
      checkId: extra.checkId ?? null,
      createdByActorName: "seed",
      createdByActorType: "staff",
      description: `${title} description`,
      embedding: extra.embedding ?? null,
      title,
      underlyingNeed: null,
      workspaceId,
    });

  const decide = (
    input: Partial<Parameters<SignalRepository["insertReviewDecision"]>[0]> & {
      decision: "distinct" | "duplicate" | "none" | "related";
      featureRequestId: string;
    },
  ) => repo.insertReviewDecision({ actorName: "Pat", actorType: "staff", workspaceId, ...input });

  it("marks requests created with a Check as new", async () => {
    const seeded = await addRequest("Seeded");
    const checked = await addRequest("Checked", { checkId: crypto.randomUUID() });
    assert.equal(seeded.createdViaCheck, false);
    assert.equal(checked.createdViaCheck, true);
  });

  it("stores a suspected duplicate once per unordered pair", async () => {
    const a = await addRequest("Swaps");
    const b = await addRequest("Trades");

    const first = await repo.upsertSuspectedDuplicate({
      a: b.id,
      b: a.id,
      model: "judge-1",
      reason: "Both ask for shift trades to sync",
      source: "scan",
      workspaceId,
    });
    const second = await repo.upsertSuspectedDuplicate({
      a: a.id,
      b: b.id,
      reason: "Again",
      source: "check",
      workspaceId,
    });

    assert.equal(second.id, first.id);
    assert.equal(second.reason, "Both ask for shift trades to sync");
    const view = toSuspectedDuplicate(first);
    assert.deepEqual(view.featureRequestIds, [a.id, b.id].toSorted());
    assert.equal(view.source, "scan");
    assert.equal(sizeOf(await repo.listSuspectedDuplicates([a.id])), 1);
  });

  it("refuses an unordered suspected pair written directly", async () => {
    const a = await addRequest("Swaps");
    const b = await addRequest("Trades");
    const [low, high] = [a.id, b.id].toSorted();
    await assert.rejects(
      db.insert(schema.suspectedDuplicates).values({
        featureRequestAId: high as string,
        featureRequestBId: low as string,
        reason: "r",
        source: "scan",
        workspaceId,
      }),
      databaseError(/suspected_duplicates_ordered/u),
    );
  });

  it("refuses a Feature Request marked duplicate of itself", async () => {
    const a = await addRequest("Swaps");
    await assert.rejects(
      repo.setDuplicateOf(a.id, a.id),
      databaseError(/feature_requests_duplicate_not_self/u),
    );
  });

  it("refuses duplicate chains in both directions", async () => {
    const canonical = await addRequest("Canonical");
    const duplicate = await addRequest("Duplicate");
    const third = await addRequest("Third");
    await repo.setDuplicateOf(duplicate.id, canonical.id);

    // Pointing at a duplicate would make a chain.
    await assert.rejects(
      repo.setDuplicateOf(third.id, duplicate.id),
      databaseError(/itself a duplicate/u),
    );
    // A canonical with duplicates can't become a duplicate.
    await assert.rejects(
      repo.setDuplicateOf(canonical.id, third.id),
      databaseError(/canonical for other/u),
    );

    await repo.clearDuplicateOf(duplicate.id);
    await repo.setDuplicateOf(canonical.id, third.id);
    const row = await repo.getFeatureRequest(canonical.id);
    assert.equal(row?.duplicateOfId, third.id);
  });

  it("lists duplicates, open requests and duplicate evidence with provenance", async () => {
    const canonical = await addRequest("Canonical");
    const duplicate = await addRequest("Duplicate");
    const account = await repo.upsertAccount({ name: "Cedar Market", workspaceId });
    await repo.insertSupport({
      accountId: account.id,
      actorName: "Ana",
      actorType: "staff",
      featureRequestId: duplicate.id,
      quote: "Trades vanish",
    });
    await repo.insertComment({
      actorName: "Ana",
      actorType: "staff",
      body: "Still broken",
      featureRequestId: duplicate.id,
    });
    await repo.setDuplicateOf(duplicate.id, canonical.id);

    assert.deepEqual(idsOf(await repo.listDuplicates(canonical.id)), [duplicate.id]);
    assert.deepEqual(idsOf(await repo.listOpenFeatureRequests(workspaceId)), [canonical.id]);
    const evidence = await repo.duplicateEvidence(canonical.id);
    assert.equal(evidence.supports[0]?.quote, "Trades vanish");
    assert.equal(evidence.supports[0]?.viaTitle, "Duplicate");
    assert.equal(evidence.supports[0]?.viaFeatureRequestId, duplicate.id);
    assert.equal(evidence.comments[0]?.body, "Still broken");
    assert.equal(evidence.comments[0]?.viaTitle, "Duplicate");
  });

  it("leaves confirmed duplicates out of open nearest neighbors", async () => {
    const canonical = await addRequest("Canonical", { embedding: unit(0) });
    const duplicate = await addRequest("Duplicate", { embedding: unit(0) });
    await repo.setDuplicateOf(duplicate.id, canonical.id);

    const nearest = await repo.nearestFeatureRequests({
      embedding: unit(0),
      limit: 5,
      openOnly: true,
      workspaceId,
    });
    assert.deepEqual(
      nearest.map((row) => row.id),
      [canonical.id],
    );
  });

  it("keeps an undone decision as history and refuses a second undo", async () => {
    const a = await addRequest("A");
    const b = await addRequest("B");
    const decision = await decide({
      canonicalId: a.id,
      decision: "duplicate",
      featureRequestId: b.id,
      otherId: a.id,
    });

    const undone = await repo.undoReviewDecision({
      actorName: "Pat",
      actorType: "staff",
      id: decision.id,
    });
    assert.ok(undone?.undoneAt);
    assert.equal(
      await repo.undoReviewDecision({ actorName: "Pat", actorType: "staff", id: decision.id }),
      null,
    );

    const history = await repo.listReviewDecisions({ featureRequestIds: [a.id] });
    assert.equal(history.length, 1);
    const view = toReviewDecision(history[0] as NonNullable<(typeof history)[0]>);
    assert.deepEqual(view.undoneBy, { name: "Pat", type: "staff" });
    assert.equal(view.decision, "duplicate");
    assert.deepEqual(
      await repo.listReviewDecisions({ activeOnly: true, featureRequestIds: [a.id] }),
      [],
    );

    // After Undo the pair can be decided again.
    await decide({ decision: "distinct", featureRequestId: a.id, otherId: b.id });
  });

  it("enforces decision shape and one active decision per pair", async () => {
    const a = await addRequest("A");
    const b = await addRequest("B");
    await assert.rejects(decide({ decision: "related", featureRequestId: a.id, otherId: b.id }));
    await assert.rejects(decide({ decision: "duplicate", featureRequestId: a.id, otherId: b.id }));
    await assert.rejects(decide({ decision: "none", featureRequestId: a.id, otherId: b.id }));
    await assert.rejects(decide({ decision: "distinct", featureRequestId: a.id, otherId: a.id }));

    await decide({
      decision: "related",
      featureRequestId: a.id,
      otherId: b.id,
      sharedDimension: "Shift trades",
    });
    await assert.rejects(decide({ decision: "distinct", featureRequestId: b.id, otherId: a.id }));
  });

  it("lists the queue and counts review metrics", async () => {
    const backlogA = await addRequest("Backlog A");
    const backlogB = await addRequest("Backlog B");
    const fresh = await addRequest("Fresh", { checkId: crypto.randomUUID() });
    const freshDup = await addRequest("Fresh dup", { checkId: crypto.randomUUID() });
    const suspicion = await repo.upsertSuspectedDuplicate({
      a: backlogA.id,
      b: backlogB.id,
      reason: "same need",
      source: "scan",
      workspaceId,
    });

    const queued = async () => {
      const rows = await repo.listReviewQueueRequests(workspaceId);
      return rows.map((row) => row.title).toSorted();
    };
    assert.deepEqual(await queued(), ["Backlog A", "Backlog B", "Fresh", "Fresh dup"]);
    assert.equal(sizeOf(await repo.listUndecidedSuspectedDuplicates(workspaceId)), 1);

    let counts = await repo.reviewMetricCounts(workspaceId);
    assert.deepEqual(counts, {
      backlog: { duplicates: 0, reviewed: 0, total: 2 },
      duplicateDecisions: { total: 0, undone: 0 },
      new: { duplicates: 0, reviewed: 0, total: 2 },
      open: { suspected: 2, total: 4 },
    });

    await decide({
      canonicalId: backlogA.id,
      decision: "duplicate",
      featureRequestId: backlogB.id,
      otherId: backlogA.id,
      suggestionId: suspicion.id,
    });
    await repo.setDuplicateOf(backlogB.id, backlogA.id);
    await decide({ decision: "none", featureRequestId: fresh.id });
    await decide({
      canonicalId: backlogA.id,
      decision: "duplicate",
      featureRequestId: freshDup.id,
      otherId: backlogA.id,
    });
    await repo.setDuplicateOf(freshDup.id, backlogA.id);

    assert.deepEqual(await queued(), []);
    assert.equal(sizeOf(await repo.listUndecidedSuspectedDuplicates(workspaceId)), 0);
    counts = await repo.reviewMetricCounts(workspaceId);
    // Both reviewed sides of an active Duplicate decision count as duplicates of the same need.
    assert.deepEqual(counts, {
      backlog: { duplicates: 2, reviewed: 2, total: 2 },
      duplicateDecisions: { total: 2, undone: 0 },
      new: { duplicates: 1, reviewed: 2, total: 2 },
      open: { suspected: 0, total: 2 },
    });
  });

  it("associates a duplicate only while it has no canonical yet", async () => {
    const a = await addRequest("A");
    const b = await addRequest("B");
    const c = await addRequest("C");

    assert.equal(await repo.setDuplicateOf(b.id, a.id), true);
    assert.equal(await repo.setDuplicateOf(b.id, c.id), false);
    const row = await repo.getFeatureRequest(b.id);
    assert.equal(row?.duplicateOfId, a.id);
  });

  it("deletes a withdrawn decision", async () => {
    const a = await addRequest("A");
    const decision = await decide({ decision: "none", featureRequestId: a.id });

    await repo.deleteReviewDecision(decision.id);

    assert.equal(await repo.getReviewDecision(decision.id), null);
  });

  it("lists, counts and marks unscanned open requests", async () => {
    const a = await addRequest("A", { embedding: unit(0) });
    await addRequest("No embedding");
    const b = await addRequest("B", { embedding: unit(1) });
    await repo.setDuplicateOf(b.id, a.id);

    assert.equal(await repo.countUnscannedFeatureRequests(workspaceId), 1);
    const unscanned = await repo.listUnscannedFeatureRequests({ limit: 10, workspaceId });
    assert.deepEqual(
      unscanned.map((row) => row.id),
      [a.id],
    );

    await repo.markScanned([a.id]);
    assert.deepEqual(await repo.listUnscannedFeatureRequests({ limit: 10, workspaceId }), []);
    const [row] = await db
      .select()
      .from(schema.featureRequests)
      .where(eq(schema.featureRequests.id, a.id));
    assert.ok(row?.suspicionScannedAt);
  });
});
