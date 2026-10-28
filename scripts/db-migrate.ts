import path from "node:path";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

import { loadRootEnv } from "../lib/env";

loadRootEnv();

const url = process.env.DATABASE_URL?.trim();
if (url) {
  const migrationsFolder = path.resolve(import.meta.dirname, "../drizzle");
  await migrate(drizzle(neon(url)), { migrationsFolder });
  console.log("db:migrate: migrations applied");
} else {
  console.log("db:migrate: DATABASE_URL is not set; skipping migrations");
}
