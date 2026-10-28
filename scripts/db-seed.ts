import { loadRootEnv } from "../lib/env";
import { getDb } from "../lib/signal/db";
import { createRepository } from "../lib/signal/repository";
import { seedCrewday } from "../lib/signal/seed";
import { createGatewayEmbedder } from "../lib/signal/seed/gateway-embedder";

loadRootEnv();

const reset = process.argv.includes("--reset");
const db = getDb();

if (!db) {
  console.log("db:seed: DATABASE_URL is not set; skipping seed");
} else if (reset && process.env.VERCEL) {
  console.error("db:seed: --reset is local only; refusing to run on Vercel");
  process.exitCode = 1;
} else {
  const embedder = createGatewayEmbedder();
  if (!embedder) console.log("db:seed: AI_GATEWAY_API_KEY is not set; seeding without embeddings");
  const result = await seedCrewday({ db, embedder, repo: createRepository(db), reset });
  console.log(
    `db:seed: Crewday Demo seeded${reset ? " after reset" : ""}; ${result.embedded} embeddings computed`,
  );
}
