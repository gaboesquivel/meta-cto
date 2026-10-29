CREATE TABLE "review_decisions" (
	"actor_name" text NOT NULL,
	"actor_type" text NOT NULL,
	"canonical_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decision" text NOT NULL,
	"feature_request_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"other_id" uuid,
	"shared_dimension" text,
	"suggestion_id" uuid,
	"undone_at" timestamp with time zone,
	"undone_by_actor_name" text,
	"undone_by_actor_type" text,
	"workspace_id" uuid NOT NULL,
	CONSTRAINT "review_decisions_kind" CHECK ("review_decisions"."decision" in ('duplicate', 'related', 'distinct', 'none')),
	CONSTRAINT "review_decisions_other_not_self" CHECK ("review_decisions"."other_id" <> "review_decisions"."feature_request_id"),
	CONSTRAINT "review_decisions_none_has_no_other" CHECK (("review_decisions"."decision" = 'none') = ("review_decisions"."other_id" is null)),
	CONSTRAINT "review_decisions_duplicate_has_canonical" CHECK (("review_decisions"."decision" = 'duplicate') = ("review_decisions"."canonical_id" is not null)),
	CONSTRAINT "review_decisions_canonical_in_pair" CHECK ("review_decisions"."canonical_id" is null or "review_decisions"."canonical_id" in ("review_decisions"."feature_request_id", "review_decisions"."other_id")),
	CONSTRAINT "review_decisions_related_has_dimension" CHECK (("review_decisions"."decision" = 'related') = ("review_decisions"."shared_dimension" is not null))
);
--> statement-breakpoint
CREATE TABLE "suspected_duplicates" (
	"feature_request_a_id" uuid NOT NULL,
	"feature_request_b_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"judged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"model" text,
	"reason" text NOT NULL,
	"source" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	CONSTRAINT "suspected_duplicates_ordered" CHECK ("suspected_duplicates"."feature_request_a_id" < "suspected_duplicates"."feature_request_b_id"),
	CONSTRAINT "suspected_duplicates_source" CHECK ("suspected_duplicates"."source" in ('check', 'scan'))
);
--> statement-breakpoint
ALTER TABLE "feature_requests" ADD COLUMN "created_via_check" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD COLUMN "duplicate_of_id" uuid;--> statement-breakpoint
ALTER TABLE "feature_requests" ADD COLUMN "suspicion_scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_canonical_id_feature_requests_id_fk" FOREIGN KEY ("canonical_id") REFERENCES "public"."feature_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_feature_request_id_feature_requests_id_fk" FOREIGN KEY ("feature_request_id") REFERENCES "public"."feature_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_other_id_feature_requests_id_fk" FOREIGN KEY ("other_id") REFERENCES "public"."feature_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_suggestion_id_suspected_duplicates_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."suspected_duplicates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspected_duplicates" ADD CONSTRAINT "suspected_duplicates_feature_request_a_id_feature_requests_id_fk" FOREIGN KEY ("feature_request_a_id") REFERENCES "public"."feature_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspected_duplicates" ADD CONSTRAINT "suspected_duplicates_feature_request_b_id_feature_requests_id_fk" FOREIGN KEY ("feature_request_b_id") REFERENCES "public"."feature_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspected_duplicates" ADD CONSTRAINT "suspected_duplicates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_decisions_workspace_created" ON "review_decisions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "review_decisions_feature_request" ON "review_decisions" USING btree ("feature_request_id");--> statement-breakpoint
CREATE INDEX "review_decisions_other" ON "review_decisions" USING btree ("other_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_decisions_active_pair" ON "review_decisions" USING btree (least("feature_request_id", "other_id"),greatest("feature_request_id", "other_id")) WHERE "review_decisions"."undone_at" is null and "review_decisions"."other_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "review_decisions_active_none" ON "review_decisions" USING btree ("feature_request_id") WHERE "review_decisions"."undone_at" is null and "review_decisions"."decision" = 'none';--> statement-breakpoint
CREATE UNIQUE INDEX "suspected_duplicates_pair" ON "suspected_duplicates" USING btree ("feature_request_a_id","feature_request_b_id");--> statement-breakpoint
CREATE INDEX "suspected_duplicates_b" ON "suspected_duplicates" USING btree ("feature_request_b_id");--> statement-breakpoint
CREATE INDEX "suspected_duplicates_workspace" ON "suspected_duplicates" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_duplicate_of_id_feature_requests_id_fk" FOREIGN KEY ("duplicate_of_id") REFERENCES "public"."feature_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feature_requests_duplicate_of" ON "feature_requests" USING btree ("duplicate_of_id");--> statement-breakpoint
ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_duplicate_not_self" CHECK ("feature_requests"."duplicate_of_id" <> "feature_requests"."id");--> statement-breakpoint
UPDATE "feature_requests" SET "created_via_check" = true WHERE "check_id" IS NOT NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "feature_requests_no_duplicate_chain"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW."duplicate_of_id" IS NULL THEN
		RETURN NEW;
	END IF;
	IF EXISTS (SELECT 1 FROM "feature_requests" WHERE "id" = NEW."duplicate_of_id" AND "duplicate_of_id" IS NOT NULL) THEN
		RAISE EXCEPTION 'canonical feature request % is itself a duplicate', NEW."duplicate_of_id"
			USING ERRCODE = 'check_violation', CONSTRAINT = 'feature_requests_no_duplicate_chain';
	END IF;
	IF EXISTS (SELECT 1 FROM "feature_requests" WHERE "duplicate_of_id" = NEW."id") THEN
		RAISE EXCEPTION 'feature request % is canonical for other duplicates', NEW."id"
			USING ERRCODE = 'check_violation', CONSTRAINT = 'feature_requests_no_duplicate_chain';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "feature_requests_no_duplicate_chain" BEFORE INSERT OR UPDATE OF "duplicate_of_id" ON "feature_requests" FOR EACH ROW EXECUTE FUNCTION "feature_requests_no_duplicate_chain"();
