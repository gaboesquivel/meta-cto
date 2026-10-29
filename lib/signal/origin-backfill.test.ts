import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { describe, it } from "vitest";

const MIGRATIONS = path.resolve(import.meta.dirname, "../../drizzle");

/** Runs one migration file the way drizzle does: each statement-breakpoint is a statement. */
const apply = async (client: PGlite, file: string) => {
  const sql = await readFile(path.join(MIGRATIONS, file), "utf-8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    // oxlint-disable-next-line no-await-in-loop -- statements run in order.
    if (statement.trim()) await client.exec(statement);
  }
};

/** Applies migration files in order. */
const applyAll = async (client: PGlite, files: string[]) => {
  for (const file of files) {
    // oxlint-disable-next-line no-await-in-loop -- migrations run in order.
    await apply(client, file);
  }
};

const migrationFiles = async () => {
  const files = await readdir(MIGRATIONS);
  return files.filter((file) => file.endsWith(".sql")).toSorted();
};

const ids = {
  demoCheck: "00000000-0000-4000-8000-000000000001",
  evalCheck: "00000000-0000-4000-8000-000000000002",
  workspace: "00000000-0000-4000-8000-0000000000aa",
};

/** Rows as they existed before Origin: seeded, user-created and eval-run. */
const insertLegacyRows = async (client: PGlite) => {
  await client.exec(`
    insert into workspaces (id, name, slug) values ('${ids.workspace}', 'Crewday Demo', 'crewday');
    insert into checks (id, actor_name, actor_type, draft, draft_hash, expires_at, result, workspace_id) values
      ('${ids.demoCheck}', 'Ana', 'staff', '{}', 'h1', now(), '{}', '${ids.workspace}'),
      ('${ids.evalCheck}', 'eval', 'agent', '{}', 'h2', now(), '{}', '${ids.workspace}');
    insert into feature_requests (title, description, created_by_actor_name, created_by_actor_type, workspace_id, is_demo, seed_key, check_id, created_via_check) values
      ('Seeded', 'd', 'seed', 'staff', '${ids.workspace}', true, 'fr-1', null, false),
      ('From demo check', 'd', 'Ana', 'staff', '${ids.workspace}', true, null, '${ids.demoCheck}', true),
      ('From eval check', 'd', 'eval', 'agent', '${ids.workspace}', true, null, '${ids.evalCheck}', true);
    insert into events (type, payload, workspace_id) values
      ('draft_checked', '{"checkId": "${ids.demoCheck}"}', '${ids.workspace}'),
      ('draft_checked', '{"checkId": "${ids.evalCheck}"}', '${ids.workspace}'),
      ('feature_request_created', '{"checkId": "${ids.evalCheck}"}', '${ids.workspace}'),
      ('comment_added', '{"checkId": null}', '${ids.workspace}'),
      ('review_decided', '{"decision": "none"}', '${ids.workspace}');
  `);
};

describe("Origin backfill migration", () => {
  it("marks eval-runner Checks eval, seeded Feature Requests seed and the rest demo", async () => {
    const client = new PGlite({ extensions: { vector } });
    const files = await migrationFiles();
    const originIndex = files.findIndex((file) => file.includes("origin"));
    assert.ok(originIndex > 0, "the Origin migration is missing");
    await applyAll(client, files.slice(0, originIndex));
    await insertLegacyRows(client);

    await applyAll(client, files.slice(originIndex));

    const checks = await client.query<{ actor_name: string; origin: string }>(
      "select actor_name, origin from checks order by actor_name",
    );
    assert.deepEqual(checks.rows, [
      { actor_name: "Ana", origin: "demo" },
      { actor_name: "eval", origin: "eval" },
    ]);
    const requests = await client.query<{ origin: string; title: string }>(
      "select title, origin from feature_requests order by title",
    );
    assert.deepEqual(requests.rows, [
      { origin: "demo", title: "From demo check" },
      { origin: "eval", title: "From eval check" },
      { origin: "seed", title: "Seeded" },
    ]);
    const events = await client.query<{ origin: string }>(
      "select origin from events order by origin",
    );
    assert.deepEqual(
      events.rows.map((row) => row.origin),
      ["demo", "demo", "demo", "eval", "eval"],
    );
  });

  it("refuses a row without an Origin or with an unknown one", async () => {
    const client = new PGlite({ extensions: { vector } });
    await applyAll(client, await migrationFiles());
    await client.exec(
      `insert into workspaces (id, name, slug) values ('${ids.workspace}', 'W', 'w')`,
    );

    await assert.rejects(
      client.exec(
        `insert into events (type, payload, workspace_id) values ('x', '{}', '${ids.workspace}')`,
      ),
    );
    await assert.rejects(
      client.exec(
        `insert into events (type, payload, workspace_id, origin) values ('x', '{}', '${ids.workspace}', 'prod')`,
      ),
    );
  });
});
