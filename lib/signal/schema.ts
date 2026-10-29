import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import type { Origin } from "./contracts";

export const EMBEDDING_DIMENSIONS = 1536;

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const seedKey = () => text("seed_key").unique();
const isDemo = () => boolean("is_demo").notNull().default(false);
/** Origin (decision 0003): recorded by every writer, so no default. */
const origin = () => text("origin").$type<Origin>().notNull();
const originCheck = (name: string, column: AnyPgColumn) =>
  check(name, sql`${column} in ('pilot', 'demo', 'seed', 'eval')`);

export const workspaces = pgTable("workspaces", {
  createdAt: createdAt(),
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

export const accounts = pgTable(
  "accounts",
  {
    createdAt: createdAt(),
    externalId: text("external_id"),
    id: id(),
    isDemo: isDemo(),
    name: text("name").notNull(),
    plan: text("plan"),
    seedKey: seedKey(),
    segment: text("segment"),
    size: text("size"),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
  },
  (table) => [uniqueIndex("accounts_workspace_name").on(table.workspaceId, table.name)],
);

export const featureRequests = pgTable(
  "feature_requests",
  {
    checkId: uuid("check_id"),
    createdAt: createdAt(),
    createdByActorName: text("created_by_actor_name").notNull(),
    createdByActorType: text("created_by_actor_type").notNull(),
    /** New (created through a Check) versus pre-Signal backlog; the split for Intake Duplicate Rate. */
    createdViaCheck: boolean("created_via_check").notNull().default(false),
    description: text("description").notNull(),
    /** Mark Duplicate: a reversible association to the canonical Feature Request. */
    duplicateOfId: uuid("duplicate_of_id").references((): AnyPgColumn => featureRequests.id),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    id: id(),
    isDemo: isDemo(),
    onBehalfOfAccountId: uuid("on_behalf_of_account_id").references(() => accounts.id),
    /** The Origin of the Check that created it; `seed` for seeded backlog. */
    origin: origin(),
    requesterName: text("requester_name"),
    requesterRole: text("requester_role"),
    seedKey: seedKey(),
    skipReason: text("skip_reason"),
    /** When the backlog scan judged this Feature Request; null means not scanned yet. */
    suspicionScannedAt: timestamp("suspicion_scanned_at", { withTimezone: true }),
    title: text("title").notNull(),
    underlyingNeed: text("underlying_need"),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
  },
  (table) => [
    index("feature_requests_workspace").on(table.workspaceId),
    // One Check, one create: a Check authorizes at most one Feature Request.
    uniqueIndex("feature_requests_check_id").on(table.checkId),
    index("feature_requests_duplicate_of").on(table.duplicateOfId),
    check("feature_requests_duplicate_not_self", sql`${table.duplicateOfId} <> ${table.id}`),
    originCheck("feature_requests_origin", table.origin),
    index("feature_requests_workspace_origin").on(table.workspaceId, table.origin),
  ],
);

export const supports = pgTable(
  "supports",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id),
    actorName: text("actor_name").notNull(),
    actorType: text("actor_type").notNull(),
    checkId: uuid("check_id"),
    createdAt: createdAt(),
    featureRequestId: uuid("feature_request_id")
      .notNull()
      .references(() => featureRequests.id),
    id: id(),
    isDemo: isDemo(),
    originalFeatureRequestId: uuid("original_feature_request_id")
      .notNull()
      .references(() => featureRequests.id),
    quote: text("quote"),
    requesterName: text("requester_name"),
    requesterRole: text("requester_role"),
    seedKey: seedKey(),
  },
  (table) => [uniqueIndex("supports_request_account").on(table.featureRequestId, table.accountId)],
);

export const comments = pgTable("comments", {
  accountId: uuid("account_id").references(() => accounts.id),
  actorName: text("actor_name").notNull(),
  actorType: text("actor_type").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
  featureRequestId: uuid("feature_request_id")
    .notNull()
    .references(() => featureRequests.id),
  id: id(),
  isDemo: isDemo(),
  seedKey: seedKey(),
});

export const relatedLinks = pgTable(
  "related_links",
  {
    createdAt: createdAt(),
    featureRequestAId: uuid("feature_request_a_id")
      .notNull()
      .references(() => featureRequests.id),
    featureRequestBId: uuid("feature_request_b_id")
      .notNull()
      .references(() => featureRequests.id),
    id: id(),
    isDemo: isDemo(),
    reason: text("reason").notNull(),
    seedKey: seedKey(),
    sharedDimension: text("shared_dimension").notNull(),
    source: text("source").notNull(),
  },
  (table) => [
    uniqueIndex("related_links_pair").on(table.featureRequestAId, table.featureRequestBId),
  ],
);

export const checks = pgTable(
  "checks",
  {
    actorName: text("actor_name").notNull(),
    actorType: text("actor_type").notNull(),
    createdAt: createdAt(),
    draft: jsonb("draft").notNull(),
    draftHash: text("draft_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    id: id(),
    origin: origin(),
    result: jsonb("result").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
  },
  (table) => [originCheck("checks_origin", table.origin)],
);

export const events = pgTable(
  "events",
  {
    createdAt: createdAt(),
    id: id(),
    origin: origin(),
    payload: jsonb("payload").notNull(),
    subjectId: uuid("subject_id"),
    type: text("type").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
  },
  (table) => [
    index("events_workspace_type").on(table.workspaceId, table.type),
    index("events_workspace_origin_type").on(table.workspaceId, table.origin, table.type),
    originCheck("events_origin", table.origin),
  ],
);

/** An AI Same Need judgment between two existing Feature Requests, stored once per unordered pair (a < b). */
export const suspectedDuplicates = pgTable(
  "suspected_duplicates",
  {
    featureRequestAId: uuid("feature_request_a_id")
      .notNull()
      .references(() => featureRequests.id),
    featureRequestBId: uuid("feature_request_b_id")
      .notNull()
      .references(() => featureRequests.id),
    id: id(),
    judgedAt: timestamp("judged_at", { withTimezone: true }).notNull().defaultNow(),
    model: text("model"),
    reason: text("reason").notNull(),
    source: text("source").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
  },
  (table) => [
    uniqueIndex("suspected_duplicates_pair").on(table.featureRequestAId, table.featureRequestBId),
    index("suspected_duplicates_b").on(table.featureRequestBId),
    index("suspected_duplicates_workspace").on(table.workspaceId),
    check(
      "suspected_duplicates_ordered",
      sql`${table.featureRequestAId} < ${table.featureRequestBId}`,
    ),
    check("suspected_duplicates_source", sql`${table.source} in ('check', 'scan')`),
  ],
);

/** A Product Manager's Review Decision; Undo sets `undone_at` and keeps the row as history. */
export const reviewDecisions = pgTable(
  "review_decisions",
  {
    actorName: text("actor_name").notNull(),
    actorType: text("actor_type").notNull(),
    /** Blind Review (spec 003): decided without the AI's suggestion or Reason in view. */
    blind: boolean("blind").notNull().default(false),
    canonicalId: uuid("canonical_id").references(() => featureRequests.id),
    createdAt: createdAt(),
    decision: text("decision").notNull(),
    featureRequestId: uuid("feature_request_id")
      .notNull()
      .references(() => featureRequests.id),
    id: id(),
    otherId: uuid("other_id").references(() => featureRequests.id),
    sharedDimension: text("shared_dimension"),
    suggestionId: uuid("suggestion_id").references(() => suspectedDuplicates.id),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    undoneByActorName: text("undone_by_actor_name"),
    undoneByActorType: text("undone_by_actor_type"),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
  },
  (table) => [
    index("review_decisions_workspace_created").on(table.workspaceId, table.createdAt),
    index("review_decisions_feature_request").on(table.featureRequestId),
    index("review_decisions_other").on(table.otherId),
    // At most one active decision per unordered pair, and one active "none" per Feature Request.
    uniqueIndex("review_decisions_active_pair")
      .on(
        sql`least(${table.featureRequestId}, ${table.otherId})`,
        sql`greatest(${table.featureRequestId}, ${table.otherId})`,
      )
      .where(sql`${table.undoneAt} is null and ${table.otherId} is not null`),
    uniqueIndex("review_decisions_active_none")
      .on(table.featureRequestId)
      .where(sql`${table.undoneAt} is null and ${table.decision} = 'none'`),
    check(
      "review_decisions_kind",
      sql`${table.decision} in ('duplicate', 'related', 'distinct', 'none')`,
    ),
    check("review_decisions_other_not_self", sql`${table.otherId} <> ${table.featureRequestId}`),
    check(
      "review_decisions_none_has_no_other",
      sql`(${table.decision} = 'none') = (${table.otherId} is null)`,
    ),
    check(
      "review_decisions_duplicate_has_canonical",
      sql`(${table.decision} = 'duplicate') = (${table.canonicalId} is not null)`,
    ),
    check(
      "review_decisions_canonical_in_pair",
      sql`${table.canonicalId} is null or ${table.canonicalId} in (${table.featureRequestId}, ${table.otherId})`,
    ),
    check(
      "review_decisions_related_has_dimension",
      sql`(${table.decision} = 'related') = (${table.sharedDimension} is not null)`,
    ),
  ],
);

/**
 * Pilot ground truth (spec 004, decision 0004): one record per load of frozen pilot files into the
 * Pilot Workspace. The feedback set and Answer Key below belong to a load; the latest completed
 * load (`loaded_at` set) is current. A load with a new fingerprint replaces the stored ground truth
 * and is recorded as a reset; earlier load records stay as history. Never served item by item.
 */
export const pilotLoads = pgTable(
  "pilot_loads",
  {
    accounts: integer("accounts").notNull(),
    answerKeyEntries: integer("answer_key_entries").notNull(),
    createdAt: createdAt(),
    expectedBacklogDuplicateRate: doublePrecision("expected_backlog_duplicate_rate"),
    featureRequests: integer("feature_requests").notNull(),
    feedback: integer("feedback").notNull(),
    /** The pilot files' fingerprint, equal to the committed lock's when loaded. */
    fingerprint: text("fingerprint").notNull(),
    id: id(),
    /** Set once every ground-truth row is written; null means the load did not finish. */
    loadedAt: timestamp("loaded_at", { withTimezone: true }),
    manifest: jsonb("manifest").notNull(),
    /** The fingerprint this load replaced; null on the first load. */
    previousFingerprint: text("previous_fingerprint"),
    /** Replaced ground truth loaded from a different fingerprint: earlier readings reset. */
    reset: boolean("reset").notNull().default(false),
    sharesNeed: integer("shares_need").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
  },
  (table) => [index("pilot_loads_workspace_loaded").on(table.workspaceId, table.loadedAt)],
);

/** A pilot feedback item an agent files through a Check; never a Feature Request. */
export const pilotFeedback = pgTable(
  "pilot_feedback",
  {
    accountId: uuid("account_id").references(() => accounts.id),
    accountKey: text("account_key").notNull(),
    customerName: text("customer_name").notNull(),
    customerRole: text("customer_role").notNull(),
    description: text("description").notNull(),
    id: id(),
    key: text("key").notNull(),
    loadId: uuid("load_id")
      .notNull()
      .references(() => pilotLoads.id),
    title: text("title").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
  },
  (table) => [uniqueIndex("pilot_feedback_load_key").on(table.loadId, table.key)],
);

/** One Answer Key need-cluster label: a backlog Feature Request key or a feedback item key. */
export const pilotAnswerKey = pgTable(
  "pilot_answer_key",
  {
    /** As written in the file (date or datetime), so it round-trips into the fingerprint. */
    confirmedAt: text("confirmed_at"),
    confirmedBy: text("confirmed_by"),
    id: id(),
    key: text("key").notNull(),
    kind: text("kind").$type<"feature_request" | "feedback">().notNull(),
    loadId: uuid("load_id")
      .notNull()
      .references(() => pilotLoads.id),
    needId: text("need_id").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
  },
  (table) => [
    uniqueIndex("pilot_answer_key_load_kind_key").on(table.loadId, table.kind, table.key),
    check("pilot_answer_key_kind", sql`${table.kind} in ('feature_request', 'feedback')`),
  ],
);

/**
 * One eval run (spec 004): every Held-Out Set v2 run, refusals and failures included, replacing
 * the committed run log. `judged_pairs` is false when no pair reached the judge; `repeat` when an
 * earlier judged run used the same set, fingerprint and prompt version. Origin is always `eval`.
 */
export const evalRuns = pgTable(
  "eval_runs",
  {
    completed: integer("completed").notNull(),
    createdAt: createdAt(),
    /** Failed pairs: ids and errors only. */
    failureDetails: jsonb("failure_details").notNull(),
    failures: integer("failures").notNull(),
    /** SHA-256 of the set as run; null when the set could not be read. */
    fingerprint: text("fingerprint"),
    id: id(),
    judgedPairs: boolean("judged_pairs").notNull(),
    message: text("message"),
    model: text("model").notNull(),
    origin: origin(),
    pairs: integer("pairs").notNull(),
    promptVersion: text("prompt_version").notNull(),
    /** The v2 precision readings (counts, intervals, verdicts); null for refusals and v1 sets. */
    readings: jsonb("readings"),
    repeat: boolean("repeat").notNull().default(false),
    /** Per-pair expected and predicted Verdicts by pair id. */
    results: jsonb("results").notNull(),
    sameNeedPositives: integer("same_need_positives").notNull(),
    setName: text("set_name").notNull(),
    status: text("status").$type<"completed" | "failed" | "refused">().notNull(),
  },
  (table) => [
    index("eval_runs_set_fingerprint_prompt").on(
      table.setName,
      table.fingerprint,
      table.promptVersion,
    ),
    check("eval_runs_status", sql`${table.status} in ('completed', 'failed', 'refused')`),
    check("eval_runs_origin", sql`${table.origin} = 'eval'`),
  ],
);
