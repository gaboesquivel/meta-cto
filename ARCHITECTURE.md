# Signal — architecture

## Foundation

Initialized from [`flow-next`](https://github.com/gaboesquivel/flow-next) at commit `a041f135f02b3ed277607eaf21982807e1c6af4a` (Next.js 16 App Router, AI SDK, MCP). Product: [PRODUCT.md](PRODUCT.md). Slices: [spec 001](docs/specs/001-check-before-create.md) (check before create) and [spec 002](docs/specs/002-review-queue.md) (review queue).

## Runtime surfaces

| Surface          | Path                                                                                                                                                                                                     | Notes                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Signal UI        | `/`, `/requests`, `/requests/new`, `/requests/[id]`, `/review`, `/proof` (Operator only)                                                                                                                 | Internal; open demo on the Crewday Demo Workspace; review actions need Operator sign-in                                                       |
| Signal REST      | `/api/checks`, `/api/feature-requests`, `/api/feature-requests/[id]/{supports,comments}`, `/api/metrics`, `/api/review/{queue,decisions,decisions/[id]/undo,scan}`, `/api/proof` (Pilot Key or Operator) | Listed in `/openapi.json`; writes rate-limited per IP; review writes need Operator access                                                     |
| Public MCP       | `/api/mcp`, `/.well-known/mcp.json`                                                                                                                                                                      | Signal tools (`check_feature_request`, …) plus template tools                                                                                 |
| GenUI playground | `/genui`                                                                                                                                                                                                 | Template OpenUI compose + preview                                                                                                             |
| Operator         | `/operator`, `/api/mcp/operator`                                                                                                                                                                         | Protected, fail closed without `OPERATOR_SECRET`; adds review tools (`review_queue`, `decide_review`, `undo_review_decision`, `scan_backlog`) |

## Signal modules (`lib/signal/`)

- `contracts.ts`: zod input schemas, response types, `SignalError` codes, and the ports (`Embedder`, `Judge`, `SignalService`) shared by REST, MCP and UI.
- `agent/`: AI Gateway embedder (`openai/text-embedding-3-small`, 1536 dimensions) and the LLM judge (one structured-output call returning the Underlying Need and a Verdict, Reason and Shared Dimension per candidate).
- `service/`: the domain service. A Check embeds the Draft, takes the 10 nearest Feature Requests by cosine distance, asks the judge, caps the result (≤ 3 Same Need, ≤ 2 Related Need) and falls back to `unknown` verdicts (`degraded`) on judge failure or a 20 s timeout. Create requires a matching, unexpired Check and a Skip Reason after Same Need. Every action records a domain event.
- `repository.ts`, `schema.ts`, `db.ts`: Drizzle on Neon Postgres with pgvector ([decision 0001](docs/decisions/0001-postgres-pgvector-neon-drizzle.md)); migrations in `drizzle/`.
- `service/review*`: the Review Queue, Review Decisions (Duplicate with a canonical, Related with a human Shared Dimension, Distinct) and Undo with history; Mark Duplicate is a reversible association, so canonical Feature Requests show duplicates' evidence with provenance and Checks skip confirmed duplicates ([spec 002](docs/specs/002-review-queue.md), [decision 0002](docs/decisions/0002-fragmentation-and-duplicate-association.md)). Metrics: Intake Duplicate Rate with backlog baseline, Review Coverage, Suspected Duplication, Undo Rate, Suggestion Acceptance.
- Origin: every Check, domain event and Feature Request records where it came from (`pilot`, `demo`, `seed`, `eval`). Intake metrics read the caller's Origin only; backlog measures (baseline, Suspected Duplication) read the workspace's pre-Signal backlog ([spec 003](docs/specs/003-prove-the-verdict.md)).
- `pilot.ts`: the Pilot Workspace identity and Pilot Key header (`x-signal-pilot-key`, env `SIGNAL_PILOT_KEY`). The key selects the Pilot Workspace with Origin `pilot` for Checks, Supports, Comments, creates and reads; pilot review writes also need Operator access. Pilot access fails closed when the key is unset.
- `service/review*` blind review: a reproducible share of new pilot requests (`SIGNAL_PILOT_BLIND_SHARE`, default 0.3) hides the AI's suggestion everywhere until decided; the decision records `blind`.
- `service/answer-key.ts`: Agent Correctness and Product Manager agreement (blind and not) against the Answer Key's need clusters.
- `proof/`: the Proof Report (`/api/proof`, MCP `proof_report`, `/proof`): each preset bar from [decision 0003](docs/decisions/0003-proof-before-slice-3.md) as pass, fail or inconclusive (95% Wilson intervals), with the consequence for slice 3.
- `scan/`: the backlog scan (Same Need only, once per Feature Request), run only as an Operator action or `pnpm signal:scan`, never in builds.
- `seed/`: idempotent Crewday Demo Workspace seed from `data/crewday/`.
- `runtime/`: `getSignalService()` and `getReviewService()` compose the above, or return null when `DATABASE_URL` (and, for Checks, AI keys) are missing; routes then answer 503 `service_unavailable`. The scan needs AI keys too.
- `http/`: REST helpers (parsing, error mapping, write rate limit).
- `lib/pilot-load/` and `data/pilot/`: Operator-run `pnpm signal:pilot:{check,freeze,load}` for the pilot backlog, feedback set and Answer Key (person-confirmed, fingerprinted and frozen before the run); never part of a build. Data paths resolve from the working directory at call time, so run them from the repo root.

## Data and environments

- Neon Postgres through the Vercel Marketplace, one database branch per preview deployment; `DATABASE_URL` per environment.
- The Vercel build runs `pnpm db:migrate && pnpm db:seed && pnpm build`; both scripts skip when `DATABASE_URL` is absent. Locally `predev` runs them before `pnpm dev` and `pnpm dev:port`.
- `pnpm verify:prod [sha]` is ship's Verify for a shipped commit (default `origin/main`): GitHub check runs, the production deployment (from Vercel when GitHub has none) and unauthenticated GETs of the production pages. Read-only; exits 0 only when live.
- Seeded rows carry `is_demo` and a stable `seed_key`; seeding never overwrites user rows.

## Quality

- Unit and integration tests with Vitest; database tests run on in-process Postgres with pgvector (PGlite 0.3).
- Verdict quality: `pnpm eval:verdict` runs the frozen Held-Out Set (v1, 25 pairs) in `evals/signal-verdict/` and reports Same-Need Precision against the 85% kill line. Held-Out Set v2 (person-confirmed, at least 60 same-need positives) is frozen with a lock, run once per prompt version and logged in `runs.jsonl`; readings carry 95% intervals. Eval Checks record Origin `eval`.

## Local development

- `pnpm setup`: dependencies and template technical skills
- `pnpm dev`: migrate, seed, then Portless at `https://meta-cto.localhost` (proxy pinned to 443, so the URL never carries a port)
- `pnpm dev:port`: migrate, seed, then plain `next dev` on loopback at `localhost:<port>`, for agents and subagents running dev servers in parallel (one per worktree; set `PORT` or take Next's next free port). A new worktree has no `.env.local` (gitignored): copy it in, and give parallel worktrees their own Neon branch or run migrations once, since concurrent migrate runs can race
