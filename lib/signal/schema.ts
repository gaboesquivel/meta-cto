import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const EMBEDDING_DIMENSIONS = 1536;

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const seedKey = () => text("seed_key").unique();
const isDemo = () => boolean("is_demo").notNull().default(false);

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
    description: text("description").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    id: id(),
    isDemo: isDemo(),
    onBehalfOfAccountId: uuid("on_behalf_of_account_id").references(() => accounts.id),
    requesterName: text("requester_name"),
    requesterRole: text("requester_role"),
    seedKey: seedKey(),
    skipReason: text("skip_reason"),
    title: text("title").notNull(),
    underlyingNeed: text("underlying_need"),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
  },
  (table) => [index("feature_requests_workspace").on(table.workspaceId)],
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

export const checks = pgTable("checks", {
  actorName: text("actor_name").notNull(),
  actorType: text("actor_type").notNull(),
  createdAt: createdAt(),
  draft: jsonb("draft").notNull(),
  draftHash: text("draft_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  id: id(),
  result: jsonb("result").notNull(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
});

export const events = pgTable(
  "events",
  {
    createdAt: createdAt(),
    id: id(),
    payload: jsonb("payload").notNull(),
    subjectId: uuid("subject_id"),
    type: text("type").notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
  },
  (table) => [index("events_workspace_type").on(table.workspaceId, table.type)],
);
