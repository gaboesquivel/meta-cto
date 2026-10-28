# 001 — Check before create

Status: draft (2026-10-28)
Slice: MVP slice 1, Capture → Connect ([PRODUCT.md](../../PRODUCT.md#mvp-slices)), plus a minimal internal UI pulled forward from slice 2
Decisions: [0001 Postgres with pgvector on Neon, via Drizzle](../decisions/0001-postgres-pgvector-neon-drizzle.md) (Proposed)
Time box: one 3-hour reviewed build (2026-10-28)

## Problem Statement

Staff and AI agents file feature requests on a customer's behalf without knowing what already exists. The same need lands as many differently worded Feature Requests, splitting evidence, while related but distinct needs (Sofia's swap sync, Daniel's approval workflow, Patricia's multi-location visibility) risk being flattened into one. Nothing tells the person or agent filing, before they file, how their Draft relates to what is there and why.

## Solution

Every create is preceded by a **Check**. An Actor sends a Draft (title, description, who it is on behalf of); Signal returns the Draft's **Underlying Need** and a **Verdict** for each close candidate — **Same Need**, **Related Need** or **Different** — each with a **Reason**, plus the next action. On Same Need the Actor Supports or Comments on the existing Feature Request instead; creating anyway requires a **Skip Reason**. On Related Need the new Feature Request is created with a **Related Link** carrying the **Shared Dimension**.

The capability is one service exposed as a REST API and as MCP tools, then used by a minimal internal UI. It runs on the seeded **Crewday Demo Workspace** at the deployed URL, open to reviewers without sign-in. Every Check, Support, Comment and create is recorded as a domain event so **Fragmentation Rate** and **Suggestion Acceptance** can be computed; a frozen **Held-Out Set** gives the first **Same-Need Precision** reading against the 85% kill line.

Terms follow [GLOSSARY.md](../../GLOSSARY.md).

## User Stories

1. As a **Staff Actor**, I want to check a Draft before filing, so that I support the existing Feature Request when the need is the same instead of fragmenting it.
2. As a Staff Actor, I want each Verdict to carry a Reason, so that I can judge whether "same need" is right before I act.
3. As a Staff Actor, I want to file anyway with a Skip Reason when I disagree with a Same Need verdict, so that I'm never blocked and my disagreement is recorded.
4. As a Staff Actor filing a Related Need, I want the new Feature Request linked to its neighbor with what they share, so that related needs stay distinct but connected.
5. As an **Agent Actor**, I want one MCP call that returns the Verdicts and the next action, so that I don't stitch search and create together myself.
6. As an Agent Actor, I want a Support to return a citable Feature Request handle like a create does, so that I have something to give the customer either way.
7. As an internal user, I want to browse and search Feature Requests and open one to see its Underlying Need, Supports by Account, Comments and Related Links with reasons, so that I understand how requests are grouped and why.
8. As a reviewer of this build, I want the deployed URL to be seeded and usable in a minute, so that I can see the AI verdict without setup.

Failure cases:

9. Creating without a recent Check for the same Draft is refused with an error that says how to fix it.
10. Creating after a Same Need verdict without a Skip Reason is refused.
11. A second Support for the same Feature Request from the same Account is refused; the existing Support is returned.
12. When the model fails or times out, the Check still returns the nearest candidates with Verdict `unknown` and no Reason, and says so, rather than inventing verdicts.

## Implementation Decisions

**Exposure:** Runs on Vercel at `https://meta-cto-app.vercel.app` (project `meta-cto-app`) and locally at `meta-cto.localhost`. Reads and writes are **open without authentication** by explicit product decision for this reviewed build: there is one Workspace (Crewday Demo), every row is marked demo data, writes are rate-limited per client IP (best effort; the template limiter is in-memory per instance), inputs are size-capped, and the seed can restore the demo state. This is a conscious exception to failing closed; it must be revisited before any real Workspace exists. The template's Operator surfaces stay as they are.

### Contracts (contract-first, before UI)

All bodies are JSON validated with zod schemas shared by the API, MCP tools and UI. Errors use the template's `jsonError` shape `{ code, message, resolution }` so agents can act on them.

```ts
type ActorRef = { type: "staff" | "agent"; name: string };
type OnBehalfOf = {
  account: { name: string; externalId?: string; size?: string; segment?: string; plan?: string };
  requester?: { name: string; role?: string };
};
type Draft = { title: string; description: string }; // title ≤ 120, description ≤ 2000 chars

type Verdict = "same_need" | "related_need" | "different" | "unknown";
type Candidate = {
  featureRequestId: string;
  title: string;
  verdict: Verdict;
  reason: string | null; // required unless verdict is "unknown"
  sharedDimension: string | null; // required for "related_need"
};
type CheckResult = {
  checkId: string;
  expiresAt: string; // 30 minutes
  underlyingNeed: string | null;
  candidates: Candidate[]; // ≤ 3 same_need, ≤ 2 related_need; "different" omitted
  consideredCount: number;
  nextAction: "support_or_comment" | "create_with_related_link" | "create";
  degraded: boolean; // true when the model step failed and verdicts are "unknown"
};
```

| Operation     | REST                                                                                 | MCP tool                     | Success                                                                                                  | Errors                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Check a Draft | `POST /api/checks` `{ draft, onBehalfOf?, actor }`                                   | `check_feature_request`      | `200 CheckResult`                                                                                        | `400 invalid_input`, `429 rate_limited`                                                                                    |
| Create        | `POST /api/feature-requests` `{ checkId, draft, onBehalfOf?, actor, skipReason? }`   | `create_feature_request`     | `201 { featureRequest }` with Related Links from the Check                                               | `409 check_required`, `409 check_mismatch` (Draft differs from the Check), `410 check_expired`, `422 skip_reason_required` |
| Support       | `POST /api/feature-requests/{id}/supports` `{ actor, onBehalfOf, quote?, checkId? }` | `support_feature_request`    | `201 { support, featureRequest }`                                                                        | `404 not_found`, `409 already_supported` (returns the existing Support)                                                    |
| Comment       | `POST /api/feature-requests/{id}/comments` `{ actor, body, onBehalfOf? }`            | `comment_on_feature_request` | `201 { comment }`                                                                                        | `404 not_found`                                                                                                            |
| Search / list | `GET /api/feature-requests?q=&limit=&cursor=`                                        | `search_feature_requests`    | `200 { items, nextCursor }` with support and account counts; `q` is semantic                             | —                                                                                                                          |
| Get           | `GET /api/feature-requests/{id}`                                                     | `get_feature_request`        | `200` with Underlying Need, Supports by Account, Comments, Related Links (Shared Dimension, Reason)      | `404 not_found`                                                                                                            |
| Metrics       | `GET /api/metrics`                                                                   | —                            | `200 { checks, suggestionAcceptance, createsAfterSameNeed, fragmentationRate: null, reviewCoverage: 0 }` | —                                                                                                                          |

MCP tools are added to the **Public MCP** (`lib/mcp/register-tools.ts`) and `starterMcpToolCatalog`, with descriptions telling agents to call `check_feature_request` before `create_feature_request`. REST routes are listed in `/openapi.json`.

### Verdict agent

- A domain service `lib/signal/` with ports for the embedder, the verdict model and the repository, so tests inject fakes.
- Retrieval: embed `title + description` with an AI Gateway embedding model (`openai/text-embedding-3-small`, 1536 dimensions), take the 10 nearest Feature Requests by cosine distance in the Workspace.
- Judgment: one structured-output call (AI SDK `generateObject` with a zod schema) through the AI Gateway chat model, given the Draft and the 10 candidates (title, description, Underlying Need). It returns the Draft's Underlying Need and a Verdict, Reason and Shared Dimension per candidate. The service enforces the caps and drops `different`.
- Failure: on model error, timeout (8 s) or schema failure, return candidates with `unknown` and `degraded: true`. Never fabricate a Verdict.
- Eval items never appear in prompts or few-shot examples.

### Data (Drizzle on Neon Postgres with pgvector, see decision 0001)

- `workspaces`, `accounts` (name, external id, size, segment, plan), `feature_requests` (title, description, underlying need, embedding `vector(1536)`, created-by Actor, on-behalf-of Account and Requester, Check id, Skip Reason), `supports` (Feature Request, original Feature Request, Account, Actor, Requester, quote; unique per Feature Request and Account), `comments`, `related_links` (unordered pair, Shared Dimension, Reason, source), `checks` (Draft hash, Draft, result, Actor, expiry), `events` (type, subject, payload, time).
- Every seeded row has a stable `seed_key` and `is_demo = true`. Migrations live in the repo (`drizzle-kit`).
- `supports.original_feature_request_id` is stored now so a later Merge and Split stay lossless.

### Seed and startup

- `data/crewday/`: about 12 Accounts (restaurant and retail chains of different sizes and segments) and about 40 Feature Requests with Supports, Comments and Related Links, in varied voices, including Sofia, Daniel and Patricia as three related, not duplicate, Feature Requests, plus supporting and contradicting evidence.
- `pnpm db:migrate` then `pnpm db:seed` run in the Vercel build command before `next build`, and locally before `pnpm dev`. The seed is idempotent: upserts by `seed_key`, inserts missing rows, computes missing embeddings, never deletes or overwrites user-created rows. `pnpm db:seed --reset` restores demo state locally.
- Neon is connected through the Vercel Marketplace, providing `DATABASE_URL` for production, preview and development.

### Events and metrics

- Domain events: Draft Checked, Feature Request Created (with Check and Skip Reason), Feature Request Supported, Comment Added, Related Link Added.
- `GET /api/metrics` derives Suggestion Acceptance (Checks with a Same Need candidate that end in a Support or Comment) and creates after Same Need. Fragmentation Rate and Review Coverage need Review Decisions (candidate spec 002), so they report `null` and `0` honestly.

### UI (minimal, internal, after the API and MCP)

- `/requests`: list with semantic search, support and account counts.
- `/requests/new`: Draft form with on-behalf-of fields → Check → Underlying Need and Verdict cards with Reasons → Support, Comment, or Create (Skip Reason field appears after a Same Need verdict).
- `/requests/[id]`: Underlying Need, Supports grouped by Account with Account Context, Comments, Related Links with Shared Dimension and Reason.
- `/` links into `/requests` and explains the check in one paragraph.

## Testing Decisions

**TDD** for the verdict agent, the API and the MCP service: each task starts with a failing test.

- **Verdict agent:** unit tests with a mocked model (`ai/test` mock) and fake embedder and repository: output parsing, caps (≤ 3 same, ≤ 2 related), Reason required, Shared Dimension required for related, `different` dropped, degraded path on error, timeout and malformed output. Unit tests check behavior, not model quality.
- **Repository and seed:** tests against an in-process Postgres with pgvector (PGlite with the `vector` extension) for nearest-neighbor ordering, the unique Support per Account, and seed idempotency (running twice changes nothing).
- **API:** route-handler tests for every operation and error code above, event recording and rate limiting, following `tests/genui-compose.route.test.ts`.
- **MCP:** catalog parity and smoke tests per new tool, following `tests/mcp/`.
- **Quality eval:** `evals/signal-verdict/` holds a Dev Set and a frozen Held-Out Set of about 25 Draft–Feature Request pairs labeled with the correct Verdict, written before any prompt tuning. `pnpm eval:verdict` runs the real models against the seeded data and reports Same-Need Precision and recall on the Held-Out Set only, with the count of pairs. It is run manually (it costs tokens), not in CI. About 25 pairs is a first reading, not a verdict on the kill line.

**Acceptance scenario (human, deployed URL):**

1. Starting state: `https://meta-cto-app.vercel.app` with the Crewday Demo Workspace seeded; the Feature Request "Shift swaps don't sync reliably" (Sofia, employee at Harbor Bistro Group) exists with Supports from two Accounts.
2. A Staff Actor opens `/requests/new` and drafts "Traded shifts sometimes don't show on my schedule" on behalf of Cedar Market (24 stores, retail) → the Check returns an Underlying Need about reliable shift-trade updates, a **Same Need** verdict on Sofia's Feature Request with a Reason, and at most two Related Need candidates (for example Daniel's approval workflow) each with a Shared Dimension.
3. The Staff Actor chooses Support on Sofia's Feature Request → it now shows a Support from Cedar Market with the quoted words and Account Context; no new Feature Request exists.
4. The Staff Actor drafts "Managers should approve every shift change" on behalf of a third Account → the Check returns **Related Need** to Sofia's and **Same Need** to Daniel's Feature Request; choosing Create without a Skip Reason is refused; with a Skip Reason it is created and the event is recorded.
5. `/requests/{Sofia's id}` shows the Underlying Need, Supports by Account, Comments, and Related Links to Daniel's and Patricia's Feature Requests with Reasons; `GET /api/metrics` shows the Checks and Suggestion Acceptance.

**Acceptance scenario (agent, MCP):**

1. Same starting state; an MCP client connected to `/api/mcp`.
2. The agent calls `check_feature_request` with the Cedar Market Draft → same result shape as step 2 above.
3. The agent calls `support_feature_request` on the Same Need candidate → receives the Feature Request handle to cite to the customer.
4. The agent calls `create_feature_request` without a Check → `409 check_required` with a resolution telling it to call `check_feature_request` first.

## Out of Scope

Review Queue, Review Decisions, Merge and Split (candidate 002); groups of related requests and evidence summaries (candidate 003); Account-aware verdicts; prioritization; decision briefs; stakeholder updates; customer-facing UI and sign-in; per-integration API keys; multiple Workspaces; tracker integrations; a large Held-Out Set; the template's GenUI and Eve agents (left untouched).

## Further Notes

- **Build order** (service → MCP → UI, per the user): 1) Neon via Vercel, Drizzle schema and migrations; 2) Crewday seed, then the Eval Set written and frozen; 3) verdict agent and retrieval; 4) API routes, events, metrics; 5) MCP tools; 6) eval run and report; 7) UI; 8) deploy and run the acceptance scenarios on the URL. Deploy after step 1 so later steps ship onto a working database.
- **Time risk:** pgvector setup and the embedding pipeline compete with the UI for the 3 hours. If time runs short, the UI shrinks to `/requests/new` with Verdict cards, which carries the reviewer moment.
- **Candidate specs** (GitHub mode, issues opened only on request): 002 Review Queue, Merge and Split, live Fragmentation Rate with Review Coverage; 003 Understand and evaluate (Underlying Need on every Feature Request, related groups, evidence summaries by Account and segment).
- Preview deployments get their own Neon branch through the integration when enabled; otherwise they share the production database, and the idempotent seed keeps that safe.
