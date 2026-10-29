import {
  and,
  asc,
  cosineDistance,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import type {
  Origin,
  ReviewDecision,
  ReviewDecisionKind,
  SuspectedDuplicate,
  SuspicionSource,
} from "./contracts";
import type { SignalDb } from "./db";
import {
  accounts,
  checks,
  comments,
  events,
  featureRequests,
  relatedLinks,
  reviewDecisions,
  supports,
  suspectedDuplicates,
  workspaces,
} from "./schema";

export type ActorType = "agent" | "staff";
export type FeatureRequestRow = typeof featureRequests.$inferSelect;
export type AccountRow = typeof accounts.$inferSelect;
export type SupportRow = typeof supports.$inferSelect;
export type CommentRow = typeof comments.$inferSelect;
export type RelatedLinkRow = typeof relatedLinks.$inferSelect;
export type CheckRow = typeof checks.$inferSelect;
export type SuspectedDuplicateRow = typeof suspectedDuplicates.$inferSelect;
export type ReviewDecisionRow = typeof reviewDecisions.$inferSelect;

export interface NewFeatureRequest {
  checkId?: string | null;
  createdByActorName: string;
  createdByActorType: ActorType;
  /** Defaults to whether `checkId` is set. */
  createdViaCheck?: boolean;
  description: string;
  embedding: number[] | null;
  isDemo?: boolean;
  onBehalfOfAccountId?: string | null;
  /** Recorded at the source: the creating Check's Origin, or `seed` for seeded backlog. */
  origin: Origin;
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

export interface NewSuspectedDuplicate {
  a: string;
  b: string;
  judgedAt?: Date;
  model?: string | null;
  reason: string;
  source: SuspicionSource;
  workspaceId: string;
}

export interface NewReviewDecision {
  actorName: string;
  actorType: ActorType;
  blind?: boolean;
  canonicalId?: string | null;
  decision: ReviewDecisionKind;
  featureRequestId: string;
  otherId?: string | null;
  sharedDimension?: string | null;
  suggestionId?: string | null;
  workspaceId: string;
}

/** Orders a pair so each Related Link and Suspected Duplicate is stored once. */
export const orderedPair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export const toSuspectedDuplicate = (row: SuspectedDuplicateRow): SuspectedDuplicate => ({
  featureRequestIds: [row.featureRequestAId, row.featureRequestBId],
  id: row.id,
  judgedAt: row.judgedAt.toISOString(),
  model: row.model,
  reason: row.reason,
  source: row.source as SuspicionSource,
});

export const toReviewDecision = (row: ReviewDecisionRow): ReviewDecision => ({
  actor: { name: row.actorName, type: row.actorType as ActorType },
  blind: row.blind,
  canonicalId: row.canonicalId,
  createdAt: row.createdAt.toISOString(),
  decision: row.decision as ReviewDecisionKind,
  featureRequestId: row.featureRequestId,
  id: row.id,
  otherId: row.otherId,
  sharedDimension: row.sharedDimension,
  suggestionId: row.suggestionId,
  undoneAt: row.undoneAt?.toISOString() ?? null,
  undoneBy:
    row.undoneByActorName && row.undoneByActorType
      ? { name: row.undoneByActorName, type: row.undoneByActorType as ActorType }
      : null,
});

/** Feature Request columns without the embedding, for reads that never need it. */
const { embedding: _embedding, ...featureRequestColumns } = getTableColumns(featureRequests);
export type FeatureRequestListRow = Omit<FeatureRequestRow, "embedding">;

/** An active (not undone) decision on the unordered pair (a, b). */
const pairDecided = (a: AnyPgColumn, b: AnyPgColumn) => sql`exists (
  select 1 from ${reviewDecisions}
  where ${reviewDecisions.undoneAt} is null and ${reviewDecisions.otherId} is not null
    and least(${reviewDecisions.featureRequestId}, ${reviewDecisions.otherId}) = ${a}
    and greatest(${reviewDecisions.featureRequestId}, ${reviewDecisions.otherId}) = ${b})`;

/** A Suspected Duplicate on this Feature Request with no active decision. */
const hasUndecidedSuspicion = (id: AnyPgColumn) => sql`exists (
  select 1 from ${suspectedDuplicates}
  where (${suspectedDuplicates.featureRequestAId} = ${id} or ${suspectedDuplicates.featureRequestBId} = ${id})
    and not ${pairDecided(suspectedDuplicates.featureRequestAId, suspectedDuplicates.featureRequestBId)})`;

/** An active decision recorded on this Feature Request itself (it is `featureRequestId`). */
const hasOwnActiveDecision = (id: AnyPgColumn) => sql`exists (
  select 1 from ${reviewDecisions}
  where ${reviewDecisions.undoneAt} is null and ${reviewDecisions.featureRequestId} = ${id})`;

const hasSuspicion = (id: AnyPgColumn) => sql`exists (
  select 1 from ${suspectedDuplicates}
  where ${suspectedDuplicates.featureRequestAId} = ${id} or ${suspectedDuplicates.featureRequestBId} = ${id})`;

/** An active Blind Review decision recorded on this Feature Request itself. */
const hasOwnActiveBlindDecision = (id: AnyPgColumn) => sql`exists (
  select 1 from ${reviewDecisions}
  where ${reviewDecisions.undoneAt} is null and ${reviewDecisions.blind}
    and ${reviewDecisions.featureRequestId} = ${id})`;

/**
 * Reviewed: a decision covers it as a whole and no Suspected Duplicate on it is undecided. Covered
 * means an active decision on the request itself, or an active decision on each of its suspected
 * pairs. Being named as `otherId` on someone else's pair does not cover a request with no
 * suspicions: the Product Manager never looked at it for its own duplicates. A Blind Review
 * decision (spec 003) covers its request alone: the blind reviewer never saw its suspicions, so
 * they stay for the other side to decide.
 */
const isReviewed: SQL = sql`(${hasOwnActiveBlindDecision(featureRequests.id)} or (not ${hasUndecidedSuspicion(featureRequests.id)} and (${hasOwnActiveDecision(featureRequests.id)} or ${hasSuspicion(featureRequests.id)})))`;

/** On either side of an active Duplicate decision, canonical or not. */
const onActiveDuplicate = (id: AnyPgColumn) => sql`exists (
  select 1 from ${reviewDecisions}
  where ${reviewDecisions.undoneAt} is null and ${reviewDecisions.decision} = 'duplicate'
    and (${reviewDecisions.featureRequestId} = ${id} or ${reviewDecisions.otherId} = ${id}))`;

/**
 * Confirmed Duplicate for the metrics: both sides of a Duplicate pair are duplicates of the same
 * need, so a reviewed request counts whichever side the Product Manager kept as canonical. A pair
 * adds to a rate only through the sides that are themselves Reviewed.
 */
const isConfirmedDuplicate: SQL = sql`(${featureRequests.duplicateOfId} is not null or ${onActiveDuplicate(featureRequests.id)})`;

const countWhere = (condition: SQL) => sql<number>`(count(*) filter (where ${condition}))::int`;

export const createRepository = (db: SignalDb) => ({
  /** Undo of a Duplicate: ends the association. */
  async clearDuplicateOf(id: string) {
    await db.update(featureRequests).set({ duplicateOfId: null }).where(eq(featureRequests.id, id));
  },

  async countFeatureRequests(workspaceId: string) {
    const [row] = await db
      .select({ value: count() })
      .from(featureRequests)
      .where(eq(featureRequests.workspaceId, workspaceId));
    return row?.value ?? 0;
  },

  /** Same filter as `listUnscannedFeatureRequests`: requests without an embedding can't be scanned. */
  async countUnscannedFeatureRequests(workspaceId: string) {
    const [row] = await db
      .select({ value: count() })
      .from(featureRequests)
      .where(
        and(
          eq(featureRequests.workspaceId, workspaceId),
          isNull(featureRequests.duplicateOfId),
          isNull(featureRequests.suspicionScannedAt),
          isNotNull(featureRequests.embedding),
        ),
      );
    return row?.value ?? 0;
  },

  /** Withdraws a decision whose effect never applied; it was never in force, so it leaves no history. */
  async deleteReviewDecision(id: string) {
    await db.delete(reviewDecisions).where(eq(reviewDecisions.id, id));
  },

  /** Supports and Comments recorded on confirmed duplicates of `canonicalId`, with their source. */
  async duplicateEvidence(canonicalId: string) {
    const via = { viaFeatureRequestId: featureRequests.id, viaTitle: featureRequests.title };
    const supportRows = await db
      .select({ ...getTableColumns(supports), ...via })
      .from(supports)
      .innerJoin(featureRequests, eq(supports.featureRequestId, featureRequests.id))
      .where(eq(featureRequests.duplicateOfId, canonicalId))
      .orderBy(asc(supports.createdAt));
    const commentRows = await db
      .select({ ...getTableColumns(comments), ...via })
      .from(comments)
      .innerJoin(featureRequests, eq(comments.featureRequestId, featureRequests.id))
      .where(eq(featureRequests.duplicateOfId, canonicalId))
      .orderBy(asc(comments.createdAt));
    return { comments: commentRows, supports: supportRows };
  },

  /** Reads first: the insert runs only the first time a slug is seen. */
  async ensureWorkspace(input: { name: string; slug: string }) {
    const bySlug = async () => {
      const [row] = await db.select().from(workspaces).where(eq(workspaces.slug, input.slug));
      return row;
    };
    const existing = await bySlug();
    if (existing) return existing;
    await db.insert(workspaces).values(input).onConflictDoNothing({ target: workspaces.slug });
    const row = await bySlug();
    if (!row) throw new Error(`workspace ${input.slug} missing after upsert`);
    return row;
  },

  /** Event counts by type for one Origin: counts never mix Origins. */
  async eventCounts(workspaceId: string, origin: Origin) {
    const rows = await db
      .select({ type: events.type, value: count() })
      .from(events)
      .where(and(eq(events.workspaceId, workspaceId), eq(events.origin, origin)))
      .groupBy(events.type);
    return Object.fromEntries(rows.map((row) => [row.type, row.value])) as Record<string, number>;
  },

  async eventsOfType(workspaceId: string, type: string, origin: Origin) {
    return await db
      .select()
      .from(events)
      .where(
        and(eq(events.workspaceId, workspaceId), eq(events.origin, origin), eq(events.type, type)),
      );
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

  async getReviewDecision(id: string) {
    const [row] = await db.select().from(reviewDecisions).where(eq(reviewDecisions.id, id));
    return row ?? null;
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
    const createdViaCheck = input.createdViaCheck ?? Boolean(input.checkId);
    const [row] = await db
      .insert(featureRequests)
      .values({ ...input, createdViaCheck })
      .returning();
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
        featureRequestAId: first,
        featureRequestBId: second,
        isDemo: input.isDemo ?? false,
        reason: input.reason,
        seedKey: input.seedKey ?? null,
        sharedDimension: input.sharedDimension,
        source: input.source,
      })
      .onConflictDoNothing();
  },

  async insertReviewDecision(input: NewReviewDecision) {
    const [row] = await db.insert(reviewDecisions).values(input).returning();
    if (!row) throw new Error("review decision insert returned nothing");
    return row;
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

  async listDuplicates(canonicalId: string) {
    return await db
      .select(featureRequestColumns)
      .from(featureRequests)
      .where(eq(featureRequests.duplicateOfId, canonicalId))
      .orderBy(asc(featureRequests.createdAt));
  },

  /** Every Feature Request in the Workspace, oldest first: keys only, no text or embedding. */
  async listFeatureRequestKeys(workspaceId: string) {
    return await db
      .select({
        checkId: featureRequests.checkId,
        createdAt: featureRequests.createdAt,
        createdViaCheck: featureRequests.createdViaCheck,
        id: featureRequests.id,
        seedKey: featureRequests.seedKey,
      })
      .from(featureRequests)
      .where(eq(featureRequests.workspaceId, workspaceId))
      .orderBy(asc(featureRequests.createdAt), asc(featureRequests.id));
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

  /** Open Feature Requests by id and title only (the Blind Review choices). */
  async listOpenFeatureRequestTitles(workspaceId: string) {
    return await db
      .select({ id: featureRequests.id, title: featureRequests.title })
      .from(featureRequests)
      .where(
        and(eq(featureRequests.workspaceId, workspaceId), isNull(featureRequests.duplicateOfId)),
      );
  },

  /** Open: not a confirmed duplicate. */
  async listOpenFeatureRequests(workspaceId: string) {
    return await db
      .select(featureRequestColumns)
      .from(featureRequests)
      .where(
        and(eq(featureRequests.workspaceId, workspaceId), isNull(featureRequests.duplicateOfId)),
      )
      .orderBy(desc(featureRequests.createdAt));
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

  /** Decisions involving any of `featureRequestIds` on either side, oldest first. */
  async listReviewDecisions(input: { activeOnly?: boolean; featureRequestIds: string[] }) {
    if (input.featureRequestIds.length === 0) return [];
    return await db
      .select()
      .from(reviewDecisions)
      .where(
        and(
          or(
            inArray(reviewDecisions.featureRequestId, input.featureRequestIds),
            inArray(reviewDecisions.otherId, input.featureRequestIds),
          ),
          input.activeOnly ? isNull(reviewDecisions.undoneAt) : undefined,
        ),
      )
      .orderBy(asc(reviewDecisions.createdAt));
  },

  /** Not Reviewed, and either new (created through a Check) or with an undecided suspicion. */
  async listReviewQueueRequests(workspaceId: string) {
    return await db
      .select(featureRequestColumns)
      .from(featureRequests)
      .where(
        and(
          eq(featureRequests.workspaceId, workspaceId),
          sql`not ${isReviewed}`,
          or(eq(featureRequests.createdViaCheck, true), hasUndecidedSuspicion(featureRequests.id)),
        ),
      )
      .orderBy(desc(featureRequests.createdAt), asc(featureRequests.title));
  },

  async listSupports(featureRequestId: string) {
    return await db
      .select()
      .from(supports)
      .where(eq(supports.featureRequestId, featureRequestId))
      .orderBy(asc(supports.createdAt));
  },

  /** Suspected Duplicates touching any of `featureRequestIds`, decided or not. */
  async listSuspectedDuplicates(featureRequestIds: string[]) {
    if (featureRequestIds.length === 0) return [];
    return await db
      .select()
      .from(suspectedDuplicates)
      .where(
        or(
          inArray(suspectedDuplicates.featureRequestAId, featureRequestIds),
          inArray(suspectedDuplicates.featureRequestBId, featureRequestIds),
        ),
      )
      .orderBy(asc(suspectedDuplicates.judgedAt));
  },

  async listUndecidedSuspectedDuplicates(workspaceId: string) {
    return await db
      .select()
      .from(suspectedDuplicates)
      .where(
        and(
          eq(suspectedDuplicates.workspaceId, workspaceId),
          sql`not ${pairDecided(suspectedDuplicates.featureRequestAId, suspectedDuplicates.featureRequestBId)}`,
        ),
      )
      .orderBy(asc(suspectedDuplicates.judgedAt));
  },

  /** Open Feature Requests with an embedding that the backlog scan has not judged yet, oldest first. */
  async listUnscannedFeatureRequests(input: { limit: number; workspaceId: string }) {
    return await db
      .select()
      .from(featureRequests)
      .where(
        and(
          eq(featureRequests.workspaceId, input.workspaceId),
          isNull(featureRequests.duplicateOfId),
          isNull(featureRequests.suspicionScannedAt),
          isNotNull(featureRequests.embedding),
        ),
      )
      .orderBy(asc(featureRequests.createdAt), asc(featureRequests.id))
      .limit(input.limit);
  },

  async markScanned(ids: string[], at: Date = new Date()) {
    if (ids.length === 0) return;
    await db
      .update(featureRequests)
      .set({ suspicionScannedAt: at })
      .where(inArray(featureRequests.id, ids));
  },

  async missingEmbeddings(workspaceId: string) {
    return await db
      .select()
      .from(featureRequests)
      .where(and(eq(featureRequests.workspaceId, workspaceId), isNull(featureRequests.embedding)));
  },

  /** `openOnly` leaves out confirmed duplicates, so Checks and scans offer canonicals only. */
  async nearestFeatureRequests(input: {
    embedding: number[];
    limit: number;
    openOnly?: boolean;
    workspaceId: string;
  }) {
    const distance = cosineDistance(featureRequests.embedding, input.embedding);
    return await db
      .select()
      .from(featureRequests)
      .where(
        and(
          eq(featureRequests.workspaceId, input.workspaceId),
          sql`${featureRequests.embedding} is not null`,
          input.openOnly ? isNull(featureRequests.duplicateOfId) : undefined,
        ),
      )
      .orderBy(distance)
      .limit(input.limit);
  },

  /**
   * Raw counts behind Intake Duplicate Rate, backlog baseline, Review Coverage, Suspected
   * Duplication and undo rate. Origin separates activity; the Workspace separates the backlog:
   * the pre-Signal backlog (not created through a Check) counts for every caller of this
   * Workspace, while intake (created through a Check) counts only for `origin`. A Review Decision
   * counts when the Feature Request it was made on is in that scope.
   */
  async reviewMetricCounts(workspaceId: string, origin: Origin) {
    const inScope = or(
      eq(featureRequests.createdViaCheck, false),
      eq(featureRequests.origin, origin),
    );
    const open = isNull(featureRequests.duplicateOfId);
    const rows = await db
      .select({
        createdViaCheck: featureRequests.createdViaCheck,
        duplicates: countWhere(sql`${isReviewed} and ${isConfirmedDuplicate}`),
        open: countWhere(sql`${open}`),
        reviewed: countWhere(isReviewed),
        suspected: countWhere(sql`${open} and ${hasUndecidedSuspicion(featureRequests.id)}`),
        total: count(),
      })
      .from(featureRequests)
      .where(and(eq(featureRequests.workspaceId, workspaceId), inScope))
      .groupBy(featureRequests.createdViaCheck);
    const [decisions] = await db
      .select({
        total: count(),
        undone: countWhere(sql`${reviewDecisions.undoneAt} is not null`),
      })
      .from(reviewDecisions)
      .innerJoin(featureRequests, eq(featureRequests.id, reviewDecisions.featureRequestId))
      .where(
        and(
          eq(reviewDecisions.workspaceId, workspaceId),
          eq(reviewDecisions.decision, "duplicate"),
          inScope,
        ),
      );
    const group = (createdViaCheck: boolean) => {
      const row = rows.find((item) => item.createdViaCheck === createdViaCheck);
      return {
        duplicates: row?.duplicates ?? 0,
        reviewed: row?.reviewed ?? 0,
        total: row?.total ?? 0,
      };
    };
    const sum = (key: "open" | "suspected") => rows.reduce((total, row) => total + row[key], 0);
    return {
      backlog: group(false),
      duplicateDecisions: { total: decisions?.total ?? 0, undone: decisions?.undone ?? 0 },
      new: group(true),
      open: { suspected: sum("suspected"), total: sum("open") },
    };
  },

  /**
   * Mark Duplicate only while `id` has no canonical; false when another decision got there first.
   * The database refuses self-references and chains. Two concurrent Duplicates forming a chain
   * across different rows are not locked against here; the chain trigger checks each update.
   */
  async setDuplicateOf(id: string, canonicalId: string) {
    const rows = await db
      .update(featureRequests)
      .set({ duplicateOfId: canonicalId })
      .where(and(eq(featureRequests.id, id), isNull(featureRequests.duplicateOfId)))
      .returning({ id: featureRequests.id });
    return rows.length > 0;
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

  /** Undo keeps the row; returns null when the decision is missing or already undone. */
  async undoReviewDecision(input: { actorName: string; actorType: ActorType; id: string }) {
    const [row] = await db
      .update(reviewDecisions)
      .set({
        undoneAt: new Date(),
        undoneByActorName: input.actorName,
        undoneByActorType: input.actorType,
      })
      .where(and(eq(reviewDecisions.id, input.id), isNull(reviewDecisions.undoneAt)))
      .returning();
    return row ?? null;
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

  async upsertSeedFeatureRequest(input: Omit<NewFeatureRequest, "origin"> & { seedKey: string }) {
    await db
      .insert(featureRequests)
      .values({ ...input, isDemo: true, origin: "seed" })
      .onConflictDoNothing({ target: featureRequests.seedKey });
    const [row] = await db
      .select()
      .from(featureRequests)
      .where(eq(featureRequests.seedKey, input.seedKey));
    if (!row) throw new Error(`seed ${input.seedKey} missing after upsert`);
    return row;
  },

  /** One Suspected Duplicate per unordered pair; a repeat returns the existing row unchanged. */
  async upsertSuspectedDuplicate(input: NewSuspectedDuplicate) {
    const [first, second] = orderedPair(input.a, input.b);
    await db
      .insert(suspectedDuplicates)
      .values({
        featureRequestAId: first,
        featureRequestBId: second,
        judgedAt: input.judgedAt ?? new Date(),
        model: input.model ?? null,
        reason: input.reason,
        source: input.source,
        workspaceId: input.workspaceId,
      })
      .onConflictDoNothing({
        target: [suspectedDuplicates.featureRequestAId, suspectedDuplicates.featureRequestBId],
      });
    const [row] = await db
      .select()
      .from(suspectedDuplicates)
      .where(
        and(
          eq(suspectedDuplicates.featureRequestAId, first),
          eq(suspectedDuplicates.featureRequestBId, second),
        ),
      );
    if (!row) throw new Error("suspected duplicate missing after upsert");
    return row;
  },
});

export type SignalRepository = ReturnType<typeof createRepository>;
