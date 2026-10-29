import { and, eq, inArray, or } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import {
  seedAccounts,
  seedComments,
  seedFeatureRequests,
  seedRelatedLinks,
  seedSupports,
  workspace,
} from "../../../data/crewday/seed";
import type { Embedder } from "../contracts";
import type { SignalDb } from "../db";
import type { ActorType, SignalRepository } from "../repository";
import { comments, featureRequests, relatedLinks, supports, workspaces } from "../schema";

export interface SeedOptions {
  /** Needed only for `reset`, which deletes demo rows with raw queries. */
  db?: SignalDb;
  embedder: Embedder | null;
  repo: SignalRepository;
  /** Local only: delete demo rows (and anything attached to demo Feature Requests), then reseed. */
  reset?: boolean;
}

export interface SeedResult {
  embedded: number;
  workspaceId: string;
}

/** Text embedded for a Feature Request; kept in one place so search and seed agree. */
export const embeddingText = (row: { description: string; title: string }) =>
  `${row.title}\n\n${row.description}`;

const actorTypes = new Map<string, ActorType>(
  seedFeatureRequests.map((request) => [request.actor.name, request.actor.type]),
);
const actorTypeOf = (name: string): ActorType => actorTypes.get(name) ?? "staff";

const requireId = (ids: Map<string, string>, key: string, kind: string) => {
  const id = ids.get(key);
  if (!id) throw new Error(`seed ${kind} "${key}" is not defined`);
  return id;
};

const touches = (ids: string[], column: PgColumn) =>
  ids.length > 0 ? inArray(column, ids) : undefined;

/**
 * Deletes demo rows of the Crewday Demo Workspace in dependency order. Rows attached to a demo
 * Feature Request go with it; user-created Feature Requests and all Accounts stay (Accounts are
 * static and upserted by name). Every other Workspace is untouched: the Pilot Workspace's backlog
 * is loaded through the seed upsert (so it is marked demo) and must survive a reset.
 */
export const resetDemo = async (db: SignalDb) => {
  const [crewday] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, workspace.slug));
  if (!crewday) return;
  const crewdayRows = await db
    .select({ id: featureRequests.id, isDemo: featureRequests.isDemo })
    .from(featureRequests)
    .where(eq(featureRequests.workspaceId, crewday.id));
  const crewdayIds = crewdayRows.map((row) => row.id);
  const demoIds = crewdayRows.filter((row) => row.isDemo).map((row) => row.id);
  if (crewdayIds.length === 0) return;
  /** Demo-marked and attached to a Crewday Feature Request, or attached to a demo one. */
  const inDemo = (isDemo: PgColumn, ...columns: PgColumn[]) =>
    or(
      and(eq(isDemo, true), or(...columns.map((column) => touches(crewdayIds, column)))),
      ...columns.map((column) => touches(demoIds, column)),
    );

  await db
    .delete(relatedLinks)
    .where(
      inDemo(relatedLinks.isDemo, relatedLinks.featureRequestAId, relatedLinks.featureRequestBId),
    );
  await db.delete(comments).where(inDemo(comments.isDemo, comments.featureRequestId));
  await db
    .delete(supports)
    .where(inDemo(supports.isDemo, supports.featureRequestId, supports.originalFeatureRequestId));
  await db
    .delete(featureRequests)
    .where(and(eq(featureRequests.isDemo, true), eq(featureRequests.workspaceId, crewday.id)));
};

/** Runs `task` over `items` in sequential batches of `size`, keeping concurrency bounded. */
const inBatches = async <T>(items: T[], size: number, task: (item: T) => Promise<unknown>) => {
  for (let index = 0; index < items.length; index += size) {
    // Sequential on purpose: bounds concurrency against Neon and the embedding provider.
    // oxlint-disable-next-line no-await-in-loop
    await Promise.all(items.slice(index, index + size).map(task));
  }
};

const BATCH_SIZE = 8;

const seedAccountRows = async (repo: SignalRepository, workspaceId: string) => {
  const ids = new Map<string, string>();
  await inBatches(seedAccounts, BATCH_SIZE, async (account) => {
    const row = await repo.upsertAccount({
      isDemo: true,
      name: account.name,
      plan: account.plan,
      seedKey: account.key,
      segment: account.segment,
      size: account.size,
      workspaceId,
    });
    ids.set(account.key, row.id);
  });
  return ids;
};

const seedRequestRows = async (
  repo: SignalRepository,
  workspaceId: string,
  accountIds: Map<string, string>,
) => {
  const ids = new Map<string, string>();
  await inBatches(seedFeatureRequests, BATCH_SIZE, async (request) => {
    const row = await repo.upsertSeedFeatureRequest({
      createdByActorName: request.actor.name,
      createdByActorType: request.actor.type,
      description: request.description,
      embedding: null,
      isDemo: true,
      onBehalfOfAccountId: requireId(accountIds, request.account, "account"),
      requesterName: request.requester.name,
      requesterRole: request.requester.role,
      seedKey: request.key,
      title: request.title,
      underlyingNeed: request.underlyingNeed,
      workspaceId,
    });
    ids.set(request.key, row.id);
  });
  return ids;
};

const seedEvidence = async (
  repo: SignalRepository,
  accountIds: Map<string, string>,
  requestIds: Map<string, string>,
) => {
  await inBatches(seedSupports, BATCH_SIZE, (support) =>
    repo.insertSupport({
      accountId: requireId(accountIds, support.account, "account"),
      actorName: support.actor,
      actorType: actorTypeOf(support.actor),
      featureRequestId: requireId(requestIds, support.request, "feature request"),
      isDemo: true,
      quote: support.quote,
      requesterName: support.requester,
      seedKey: support.key,
    }),
  );
  await inBatches(seedComments, BATCH_SIZE, (comment) =>
    repo.upsertSeedComment({
      accountId: comment.account ? requireId(accountIds, comment.account, "account") : null,
      actorName: comment.actor,
      actorType: actorTypeOf(comment.actor),
      body: comment.body,
      featureRequestId: requireId(requestIds, comment.request, "feature request"),
      seedKey: comment.key,
    }),
  );
  await inBatches(seedRelatedLinks, BATCH_SIZE, (link) =>
    repo.insertRelatedLink({
      a: requireId(requestIds, link.a, "feature request"),
      b: requireId(requestIds, link.b, "feature request"),
      isDemo: true,
      reason: link.reason,
      seedKey: link.key,
      sharedDimension: link.sharedDimension,
      source: "seed",
    }),
  );
};

/** Fills embeddings only where they are missing; existing vectors are never recomputed. */
const fillEmbeddings = async (repo: SignalRepository, embedder: Embedder, workspaceId: string) => {
  const missing = await repo.missingEmbeddings(workspaceId);
  await inBatches(missing, BATCH_SIZE, async (row) => {
    const embedding = await embedder.embed(embeddingText(row));
    await repo.setEmbedding(row.id, embedding);
  });
  return missing.length;
};

/**
 * Idempotent Crewday Demo seed: inserts missing demo rows by seed key, then computes missing
 * embeddings. Never updates or deletes user-created rows.
 */
export const seedCrewday = async (options: SeedOptions): Promise<SeedResult> => {
  const { embedder, repo } = options;
  if (options.reset) {
    if (!options.db) throw new Error("seedCrewday reset requires db");
    await resetDemo(options.db);
  }
  const { id: workspaceId } = await repo.ensureWorkspace(workspace);
  const accountIds = await seedAccountRows(repo, workspaceId);
  const requestIds = await seedRequestRows(repo, workspaceId, accountIds);
  await seedEvidence(repo, accountIds, requestIds);
  const embedded = embedder ? await fillEmbeddings(repo, embedder, workspaceId) : 0;
  return { embedded, workspaceId };
};
