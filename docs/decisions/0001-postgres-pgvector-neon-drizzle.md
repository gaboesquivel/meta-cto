---
status: proposed
category: architecture
date: 2026-10-28
---

# Postgres with pgvector on Neon, via Drizzle

Signal needs durable Feature Request records and semantic nearest-neighbor retrieval for every Check. The template has no database.

**Choice:** one Neon Postgres database, connected through the Vercel Marketplace, holding both the records and their embeddings in a pgvector column; Drizzle ORM with `drizzle-kit` migrations committed to the repo; embeddings from the Vercel AI Gateway.

**Alternatives considered:**

- A separate vector store next to Postgres: two systems to keep consistent for a few thousand rows; rejected.
- Sending the whole catalog to the LLM on every Check (no embeddings): simplest for the demo but does not scale past a few hundred Feature Requests; rejected by the user in favor of the architecture that would ship.
- Postgres full-text search for candidates: misses differently worded same needs, which is the product's differentiator; rejected.
- Prisma: no first-class pgvector types; Drizzle is SQL-first, light in serverless functions, and its TypeScript schema can back the zod contracts.

**Consequences:** every Signal spec builds on this schema and its migrations; changing the embedding model means re-embedding and a migration if dimensions change; tests use an in-process Postgres with pgvector (PGlite) rather than a mock; preview deployments need their own Neon branch or share production data safely through idempotent seeding.
