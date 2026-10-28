CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "accounts" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_id" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"plan" text,
	"seed_key" text,
	"segment" text,
	"size" text,
	"workspace_id" uuid NOT NULL,
	CONSTRAINT "accounts_seed_key_unique" UNIQUE("seed_key")
);
--> statement-breakpoint
CREATE TABLE "checks" (
	"actor_name" text NOT NULL,
	"actor_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"draft" jsonb NOT NULL,
	"draft_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"result" jsonb NOT NULL,
	"workspace_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"account_id" uuid,
	"actor_name" text NOT NULL,
	"actor_type" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"feature_request_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"seed_key" text,
	CONSTRAINT "comments_seed_key_unique" UNIQUE("seed_key")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payload" jsonb NOT NULL,
	"subject_id" uuid,
	"type" text NOT NULL,
	"workspace_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_requests" (
	"check_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor_name" text NOT NULL,
	"created_by_actor_type" text NOT NULL,
	"description" text NOT NULL,
	"embedding" vector(1536),
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"on_behalf_of_account_id" uuid,
	"requester_name" text,
	"requester_role" text,
	"seed_key" text,
	"skip_reason" text,
	"title" text NOT NULL,
	"underlying_need" text,
	"workspace_id" uuid NOT NULL,
	CONSTRAINT "feature_requests_seed_key_unique" UNIQUE("seed_key")
);
--> statement-breakpoint
CREATE TABLE "related_links" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"feature_request_a_id" uuid NOT NULL,
	"feature_request_b_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"reason" text NOT NULL,
	"seed_key" text,
	"shared_dimension" text NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "related_links_seed_key_unique" UNIQUE("seed_key")
);
--> statement-breakpoint
CREATE TABLE "supports" (
	"account_id" uuid NOT NULL,
	"actor_name" text NOT NULL,
	"actor_type" text NOT NULL,
	"check_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"feature_request_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"original_feature_request_id" uuid NOT NULL,
	"quote" text,
	"requester_name" text,
	"requester_role" text,
	"seed_key" text,
	CONSTRAINT "supports_seed_key_unique" UNIQUE("seed_key")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checks" ADD CONSTRAINT "checks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_feature_request_id_feature_requests_id_fk" FOREIGN KEY ("feature_request_id") REFERENCES "public"."feature_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_on_behalf_of_account_id_accounts_id_fk" FOREIGN KEY ("on_behalf_of_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_links" ADD CONSTRAINT "related_links_feature_request_a_id_feature_requests_id_fk" FOREIGN KEY ("feature_request_a_id") REFERENCES "public"."feature_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "related_links" ADD CONSTRAINT "related_links_feature_request_b_id_feature_requests_id_fk" FOREIGN KEY ("feature_request_b_id") REFERENCES "public"."feature_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supports" ADD CONSTRAINT "supports_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supports" ADD CONSTRAINT "supports_feature_request_id_feature_requests_id_fk" FOREIGN KEY ("feature_request_id") REFERENCES "public"."feature_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supports" ADD CONSTRAINT "supports_original_feature_request_id_feature_requests_id_fk" FOREIGN KEY ("original_feature_request_id") REFERENCES "public"."feature_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_workspace_name" ON "accounts" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "events_workspace_type" ON "events" USING btree ("workspace_id","type");--> statement-breakpoint
CREATE INDEX "feature_requests_workspace" ON "feature_requests" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "related_links_pair" ON "related_links" USING btree ("feature_request_a_id","feature_request_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supports_request_account" ON "supports" USING btree ("feature_request_id","account_id");