import { neon } from "@neondatabase/serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

export type SignalDb = PgDatabase<PgQueryResultHKT, typeof schema>;

let cached: SignalDb | null = null;

export const databaseUrl = () => process.env.DATABASE_URL?.trim() || null;

/** Neon over HTTP: one request per query, safe in serverless functions. */
export const getDb = (): SignalDb | null => {
  if (cached) return cached;
  const url = databaseUrl();
  if (!url) return null;
  cached = drizzle(neon(url), { schema }) as unknown as SignalDb;
  return cached;
};
