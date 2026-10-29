# Signal — architecture

## Foundation

Initialized from [`flow-next`](https://github.com/gaboesquivel/flow-next) at commit `a041f135f02b3ed277607eaf21982807e1c6af4a` (Next.js 16 App Router, AI SDK, MCP). Product: [PRODUCT.md](PRODUCT.md). Current slice: [spec 001](docs/specs/001-check-before-create.md).

## Runtime surfaces

| Surface          | Path                                                                                                     | Notes                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Signal UI        | `/`, `/requests`, `/requests/new`, `/requests/[id]`                                                      | Internal; open demo on the Crewday Demo Workspace             |
| Signal REST      | `/api/checks`, `/api/feature-requests`, `/api/feature-requests/[id]/{supports,comments}`, `/api/metrics` | Listed in `/openapi.json`; writes rate-limited per IP         |
| Public MCP       | `/api/mcp`, `/.well-known/mcp.json`                                                                      | Signal tools (`check_feature_request`, …) plus template tools |
| GenUI playground | `/genui`                                                                                                 | Template OpenUI compose + preview                             |
| Operator         | `/operator`, `/api/mcp/operator`                                                                         | Template; protected, fail closed without `OPERATOR_SECRET`    |

## Signal modules (`lib/signal/`)

- `contracts.ts`: zod input schemas, response types, `SignalError` codes, and the ports (`Embedder`, `Judge`, `SignalService`) shared by REST, MCP and UI.
- `agent/`: AI Gateway embedder (`openai/text-embedding-3-small`, 1536 dimensions) and the LLM judge (one structured-output call returning the Underlying Need and a Verdict, Reason and Shared Dimension per candidate).
- `service/`: the domain service. A Check embeds the Draft, takes the 10 nearest Feature Requests by cosine distance, asks the judge, caps the result (≤ 3 Same Need, ≤ 2 Related Need) and falls back to `unknown` verdicts (`degraded`) on judge failure or a 20 s timeout. Create requires a matching, unexpired Check and a Skip Reason after Same Need. Every action records a domain event.
- `repository.ts`, `schema.ts`, `db.ts`: Drizzle on Neon Postgres with pgvector ([decision 0001](docs/decisions/0001-postgres-pgvector-neon-drizzle.md)); migrations in `drizzle/`.
- `seed/`: idempotent Crewday Demo Workspace seed from `data/crewday/`.
- `runtime/`: `getSignalService()` composes the above, or returns null when `DATABASE_URL` or AI keys are missing (routes then answer 503 `service_unavailable`).
- `http/`: REST helpers (parsing, error mapping, write rate limit).

## Data and environments

- Neon Postgres through the Vercel Marketplace, one database branch per preview deployment; `DATABASE_URL` per environment.
- The Vercel build runs `pnpm db:migrate && pnpm db:seed && pnpm build`; both scripts skip when `DATABASE_URL` is absent. Locally `predev` runs them before `pnpm dev` and `pnpm dev:port`.
- Seeded rows carry `is_demo` and a stable `seed_key`; seeding never overwrites user rows.

## Quality

- Unit and integration tests with Vitest; database tests run on in-process Postgres with pgvector (PGlite 0.3).
- Verdict quality: `pnpm eval:verdict` runs the frozen Held-Out Set in `evals/signal-verdict/` and reports Same-Need Precision against the 85% kill line.

## Local development

- `pnpm setup`: dependencies and template technical skills
- `pnpm dev`: migrate, seed, then Portless at `https://meta-cto.localhost` (proxy pinned to 443, so the URL never carries a port)
- `pnpm dev:port`: migrate, seed, then plain `next dev` on loopback at `localhost:<port>`, for agents and subagents running dev servers in parallel (one per worktree; set `PORT` or take Next's next free port). A new worktree has no `.env.local` (gitignored): copy it in, and give parallel worktrees their own Neon branch or run migrations once, since concurrent migrate runs can race
