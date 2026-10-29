import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { SignalDb } from "./db";
import * as schema from "./schema";

/** In-process Postgres with pgvector and the real migrations, for tests. */
export const createTestDb = async (): Promise<SignalDb> => {
  const client = new PGlite({ extensions: { vector } });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../../drizzle") });
  return db as unknown as SignalDb;
};
