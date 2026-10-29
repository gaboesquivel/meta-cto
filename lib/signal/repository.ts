import { and, asc, cosineDistance, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import type { SignalDb } from "./db";
import {
  accounts,
  checks,
  comments,
  events,
  featureRequests,
  relatedLinks,
  supports,
  workspaces,
} from "./schema";

export type ActorType = "agent" | "staff";
export type FeatureRequestRow = typeof featureRequests.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type SupportRow = typeof supports.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
export type RelatedLinkRow = typeof relatedLinks.$inferSelect;
export type CheckRow = typeof checks.$inferSelect;

export interface NewFeatureRequest {
  checkId?: string | null;
  createdByActorName: string;
  createdByActorType: ActorType;
  description: string;
  embedding: number[] | null;
  isDemo?: boolean;
  onBehalfOfAccountId?: string | null;
  requesterName?: string | null;
  requesterRole?: string | null;
  seedKey?: string | null;
  skipReason?: string | null;
  title: string;
  underlyingNeed: string | null;
  workspaceId: string;
}

export interface NewSupport {
  accountId: string;
  actorName: string;
  actorType: ActorType;
  checkId?: string | null;
  featureRequestId: string;
  isDemo?: boolean;
  quote?: string | null;
  requesterName?: string | null;
  requesterRole?: string | null;
  seedKey?: string | null;
}

export interface NewAccount {
  externalId?: string | null;
  isDemo?: boolean;
  name: string;
  plan?: string | null;
  seedKey?: string | null;
  segment?: string | null;
  size?: string | null;
  workspaceId: string;
}

/** Orders a pair so each Related Link is stored once. */
const orderedPair = (a: string, b: string) => (a < b ? [a, b] : [b, a]);

export const createRepository = (db: SignalDb) => ({
  async countFeatureRequests(workspaceId: string) {
    const [row] = await db
      .select({ value: count() })
      .from(featureRequests)
      .where(eq(featureRequests.workspaceId, workspaceId));
    return row?.value ?? 0;
  },

  async ensureWorkspace(input: { name: string; slug: string }) {
    await db.insert(workspaces).values(input).onConflictDoNothing({ target: workspaces.slug });
    const [row] = await db.select().from(workspaces).where(eq(workspaces.slug, input.slug));
    if (!row) throw new Error(`workspace ${input.slug} missing after upsert`);
    return row;
  },

  async eventCounts(workspaceId: string) {
    const rows = await db
      .select({ type: events.type, value: count() })
      .from(events)
      .where(eq(events.workspaceId, workspaceId))
      .groupBy(events.type);
    return Object.fromEntries(rows.map((row) => [row.type, row.value])) as Record<string, number>;
  },

  async eventsOfType(workspaceId: string, type: string) {
    return await db
      .select()
      .from(events)
      .where(and(eq(events.workspaceId, workspaceId), eq(events.type, type)));
  },

  async getAccounts(ids: string[]) {
    if (ids.length === 0) return [];
    return await db.select().from(accounts).where(inArray(accounts.id, ids));
  },

  async getCheck(id: string) {
    const [row] = await db.select().from(checks).where(eq(checks.id, id));
    return row ?? null;
  },

  async getFeatureRequest(id: string) {
    const [row] = await db.select().from(featureRequests).where(eq(featureRequests.id, id));
    return row ?? null;
  },

  async getFeatureRequestByCheckId(checkId: string) {
    const [row] = await db
      .select({ id: featureRequests.id })
      .from(featureRequests)
      .where(eq(featureRequests.checkId, checkId));
    return row ?? null;
  },

  async getFeatureRequests(ids: string[]) {
    if (ids.length === 0) return [];
    return await db.select().from(featureRequests).where(inArray(featureRequests.id, ids));
  },

  async insertCheck(input: typeof checks.$inferInsert) {
    const [row] = await db.insert(checks).values(input).returning();
    if (!row) throw new Error("check insert returned nothing");
    return row;
  },

  async insertComment(input: typeof comments.$inferInsert) {
    const [row] = await db.insert(comments).values(input).returning();
    if (!row) throw new Error("comment insert returned nothing");
    return row;
  },

  async insertEvent(input: typeof events.$inferInsert) {
    await db.insert(events).values(input);
  },

  async insertFeatureRequest(input: NewFeatureRequest) {
    const [row] = await db.insert(featureRequests).values(input).returning();
    if (!row) throw new Error("feature request insert returned nothing");
    return row;
  },

  async insertRelatedLink(input: {
    a: string;
    b: string;
    isDemo?: boolean;
    reason: string;
    seedKey?: string | null;
    sharedDimension: string;
    source: "check" | "seed";
  }) {
    const [first, second] = orderedPair(input.a, input.b);
    await db
      .insert(relatedLinks)
      .values({
        featureRequestAId: first as string,
        featureRequestBId: second as string,
        isDemo: input.isDemo ?? false,
        reason: input.reason,
        seedKey: input.seedKey ?? null,
        sharedDimension: input.sharedDimension,
        source: input.source,
      })
      .onConflictDoNothing();
  },

  /** One Support per Feature Request per Account; a repeat returns the existing one. */
  async insertSupport(input: NewSupport) {
    const [created] = await db
      .insert(supports)
      .values({ ...input, originalFeatureRequestId: input.featureRequestId })
      .onConflictDoNothing()
      .returning();
    if (created) return { created: true, support: created };
    const [existing] = await db
      .select()
      .from(supports)
      .where(
        and(
          eq(supports.featureRequestId, input.featureRequestId),
          eq(supports.accountId, input.accountId),
        ),
      );
    if (!existing) throw new Error("support conflict without an existing row");
    return { created: false, support: existing };
  },

  async listComments(featureRequestId: string) {
    return await db
      .select()
      .from(comments)
      .where(eq(comments.featureRequestId, featureRequestId))
      .orderBy(asc(comments.createdAt));
  },

  async listFeatureRequests(input: { limit: number; offset: number; workspaceId: string }) {
    return await db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.workspaceId, input.workspaceId))
      .orderBy(desc(featureRequests.createdAt), asc(featureRequests.title))
      .limit(input.limit)
      .offset(input.offset);
  },

  async listRelatedLinks(featureRequestId: string) {
    return await db
      .select()
      .from(relatedLinks)
      .where(
        or(
          eq(relatedLinks.featureRequestAId, featureRequestId),
          eq(relatedLinks.featureRequestBId, featureRequestId),
        ),
      );
  },

  async listSupports(featureRequestId: string) {
    return await db
      .select()
      .from(supports)
      .where(eq(supports.featureRequestId, featureRequestId))
      .orderBy(asc(supports.createdAt));
  },

  async missingEmbeddings(workspaceId: string) {
    return await db
      .select()
      .from(featureRequests)
      .where(and(eq(featureRequests.workspaceId, workspaceId), isNull(featureRequests.embedding)));
  },

  async nearestFeatureRequests(input: { embedding: number[]; limit: number; workspaceId: string }) {
    const distance = cosineDistance(featureRequests.embedding, input.embedding);
    return await db
      .select()
      .from(featureRequests)
      .where(
        and(
          eq(featureRequests.workspaceId, input.workspaceId),
          sql`${featureRequests.embedding} is not null`,
        ),
      )
      .orderBy(distance)
      .limit(input.limit);
  },

  async setEmbedding(id: string, embedding: number[]) {
    await db.update(featureRequests).set({ embedding }).where(eq(featureRequests.id, id));
  },

  async supportCounts(ids: string[]) {
    if (ids.length === 0) return new Map<string, { accounts: number; supports: number }>();
    const rows = await db
      .select({
        accounts: sql<number>`count(distinct ${supports.accountId})::int`,
        featureRequestId: supports.featureRequestId,
        supports: count(),
      })
      .from(supports)
      .where(inArray(supports.featureRequestId, ids))
      .groupBy(supports.featureRequestId);
    return new Map(
      rows.map((row) => [row.featureRequestId, { accounts: row.accounts, supports: row.supports }]),
    );
  },

  async upsertAccount(input: NewAccount) {
    await db
      .insert(accounts)
      .values(input)
      .onConflictDoNothing({ target: [accounts.workspaceId, accounts.name] });
    const [row] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.workspaceId, input.workspaceId), eq(accounts.name, input.name)));
    if (!row) throw new Error(`account ${input.name} missing after upsert`);
    return row;
  },

  async upsertSeedComment(input: typeof comments.$inferInsert & { seedKey: string }) {
    await db
      .insert(comments)
      .values({ ...input, isDemo: true })
      .onConflictDoNothing({ target: comments.seedKey });
  },

  async upsertSeedFeatureRequest(input: NewFeatureRequest & { seedKey: string }) {
    await db
      .insert(featureRequests)
      .values({ ...input, isDemo: true })
      .onConflictDoNothing({ target: featureRequests.seedKey });
    const [row] = await db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.seedKey, input.seedKey));
    if (!row) throw new Error(`seed ${input.seedKey} missing after upsert`);
    return row;
  },
});

export type SignalRepository = ReturnType<typeof createRepository>;
