-- Pilot load attempts and the eval_runs latest-run index (spec 004 review, F3 and perf). Generated
-- by drizzle-kit. Additive only: one new table and one new index, no change to existing rows.
CREATE TABLE "pilot_load_attempts" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fingerprint" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outcome" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	CONSTRAINT "pilot_load_attempts_outcome" CHECK ("pilot_load_attempts"."outcome" in ('accepted', 'refused'))
);
--> statement-breakpoint
ALTER TABLE "pilot_load_attempts" ADD CONSTRAINT "pilot_load_attempts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pilot_load_attempts_workspace_created" ON "pilot_load_attempts" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "eval_runs_set_created" ON "eval_runs" USING btree ("set_name","created_at");