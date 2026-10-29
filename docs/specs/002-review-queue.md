# 002 — Review queue: turn suspected duplicates into decisions

Status: draft (2026-10-29)
Slice: MVP slice 1, journey 3 (Product Manager review) ([PRODUCT.md](../../PRODUCT.md#core-journeys)); builds on [spec 001](001-check-before-create.md)
Decisions: [0002 Fragmentation as unresolved duplication; duplicates as reversible associations](../decisions/0002-fragmentation-and-duplicate-association.md) (Proposed), [0001](../decisions/0001-postgres-pgvector-neon-drizzle.md) (Accepted)

## Problem Statement

Signal stops new duplicates at intake, but a Product Manager still can't answer the question that matters: can I understand what customers really need without losing the original evidence? Duplicates already in the backlog stay fragmented, the AI's suspicions are invisible, nothing records a human decision, and the main metric is unmeasurable (spec 001 reports `fragmentationRate: null`).

## Solution

One polished journey for a Product Manager:

1. **Incoming feedback → AI matches.** The Review Queue lists Feature Requests with **suspected duplicates**: other open Feature Requests the AI judged Same Need, each with its Reason.
2. **Review → Mark Duplicate, Related, or Distinct.** The Product Manager decides. Mark Duplicate associates the Feature Request with a canonical one; Related adds a Related Link; Distinct records that they are different needs.
3. **Preserve provenance → Undo.** Nothing moves. The canonical Feature Request shows every Support and Comment from its duplicates, labeled with where it came from and in the customer's own words. Undo removes the association.
4. **Metrics update.** Fragmentation, Duplicate Rate and Review Coverage update as decisions are made.

The demo story leads with the product (feedback, AI judgment, human control, preserved evidence, measurable change). The API and MCP surfaces exist for agents and tests but are not the story.

## User Stories

1. As a Product Manager, I want a queue of Feature Requests with suspected duplicates and the AI's Reason for each, so that I know where fragmentation is and why.
2. As a Product Manager, I want to Mark Duplicate, Related or Distinct in one action per suggestion, so that review is fast.
3. As a Product Manager, I want the canonical Feature Request to show every customer's original words and Account from its duplicates, so that no evidence is lost.
4. As a Product Manager, I want to Undo a decision, so that a wrong call is cheap to fix.
5. As a Product Manager, I want Fragmentation, Duplicate Rate and Review Coverage to update as I decide, so that I can see the backlog getting healthier.
6. As a Staff Actor or Agent Actor, I want Checks to stop suggesting Feature Requests already marked Duplicate and point me at the canonical one, so that new evidence lands in the right place.
7. As a reviewer of the build, I want the seeded Crewday backlog to already contain real suspected duplicates, so that the journey works on first open.

Failure cases:

8. Review actions without Operator access are refused (fail closed when `OPERATOR_SECRET` is unset); the queue and metrics stay readable.
9. Marking a Feature Request Duplicate of itself, of a Feature Request that is itself a Duplicate, or creating a cycle is refused; decisions always point at a canonical (non-duplicate) Feature Request.
10. Undo of an already-undone decision is refused with a clear message.

## Implementation Decisions

**Exposure:** Runs at `https://meta-cto-app.vercel.app` and on per-branch previews. The Review Queue, canonical evidence and metrics are readable without sign-in like spec 001. **Review Decisions and Undo require Operator access** (the template's `OPERATOR_SECRET`: Operator session cookie in the UI, bearer or `X-Operator-Secret` for REST, and the Operator MCP for agents) and fail closed when the secret is unset.

### Domain (see decision 0002; glossary updated on acceptance)

- **Suspected duplicate:** an unordered pair of open Feature Requests the AI judged Same Need, with the Reason, model and time. Sources: (a) a Check whose Same Need candidate was skipped at create (recorded at create, no extra model call); (b) a scan that runs the existing Check judge for each open Feature Request against its nearest open neighbors, for rows not yet scanned.
- **Review Decision:** for a Feature Request and one suspected pair: `duplicate` (with canonical id), `related` (adds a Related Link with the AI's Reason as its Shared Dimension context), or `distinct`. Actor = Operator; time; `undoneAt` for Undo. A decision resolves its pair.
- **Duplicate association:** `feature_requests.duplicate_of_id` (nullable) set by Mark Duplicate and cleared by Undo. Canonical = `duplicate_of_id is null`. No Support, Comment or Account row moves.
- Duplicates are excluded from Check candidates and from suspected-pair scans; their page points to the canonical Feature Request.

### Metrics (`GET /api/metrics`, extended)

- `fragmentation` = open canonical Feature Requests with an unresolved suspected pair ÷ open canonical Feature Requests.
- `duplicateRate` = Feature Requests decided Duplicate (not undone) ÷ Feature Requests with any non-undone decision; `null` when none reviewed.
- `reviewCoverage` = Feature Requests with a non-undone decision ÷ all Feature Requests in the Workspace.
- Existing `suggestionAcceptance` unchanged. Every metric ships with its numerator and denominator.

### Contracts (contract-first)

| Operation          | REST                                                                                                                         | MCP (Operator MCP)           | Access    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | --------- |
| Review Queue       | `GET /api/review/queue` → items: Feature Request summary + suspected pairs (other request, Reason, decision state)           | `review_queue`               | open read |
| Decide             | `POST /api/review/decisions` `{ featureRequestId, otherId, decision: "duplicate" \| "related" \| "distinct", canonicalId? }` | `decide_review`              | Operator  |
| Undo               | `POST /api/review/decisions/{id}/undo`                                                                                       | `undo_review_decision`       | Operator  |
| Scan               | `pnpm signal:scan` (also after `db:seed` in the build, scanning only unscanned rows)                                         | —                            | build/CLI |
| Canonical evidence | `GET /api/feature-requests/{id}` gains `duplicates[]` and each Support/Comment gains `via` (source Feature Request)          | `get_feature_request` (same) | open read |
| Metrics            | `GET /api/metrics` gains `fragmentation`, `duplicateRate`, `reviewCoverage` with counts                                      | —                            | open read |

Errors use the existing `{ code, error, resolution }` shape and the REST/MCP parity test gains rows for the new operations: `operator_required` (401), `invalid_decision` (422, self/cycle/non-canonical), `already_undone` (409), `not_found` (404).

### UI (the demo)

- `/review`: headline metrics (Fragmentation, Duplicate Rate, Review Coverage with counts), then the queue. Each item shows the Feature Request and its suspected duplicates side by side: titles, Underlying Needs, Account counts, the AI Reason, and three actions. Without Operator access the actions show "Sign in as Operator" (template `/operator/access`).
- After Mark Duplicate: the item resolves, metrics update in place, and the canonical Feature Request link shows the merged evidence; an Undo toast stays available.
- `/requests/[id]` (canonical): Supports grouped by Account include those from duplicates, labeled "via <duplicate title>" with the customer's original words. A duplicate's page shows a banner linking to its canonical Feature Request.

### Data and seed

- Migration adds `feature_requests.duplicate_of_id`, `suspected_duplicates` (pair, reason, model, judged_at, scanned source), `review_decisions` (feature request, other, decision, canonical, actor, created_at, undone_at), and a `suspicion_scanned_at` marker on `feature_requests`.
- The seeded backlog already contains real near-duplicates (for example "Trade board doesn't update after pickup" and "Shift swaps don't sync reliably"; "Borrow staff from another location" and "Open shifts across nearby stores"), so the scan produces suspected pairs from the real judge, not hard-coded ones.

## Testing Decisions

Test-first for the service, REST, MCP and scan, as in spec 001: mocked judge for decisions and scan logic; PGlite for association, exclusion from Checks, metrics math and the canonical evidence query; parity rows for the new operations; Operator access refused when unset or wrong. UI: view-helper unit tests plus the acceptance scenario on a preview.

**Acceptance scenario (Product Manager, deployed preview):**

1. Starting state: seeded Crewday Workspace after the scan; `/review` shows Fragmentation above 0 with counts, Duplicate Rate "—" (none reviewed), Review Coverage 0%.
2. The queue lists "Trade board doesn't update after pickup" with suspected duplicate "Shift swaps don't sync reliably" and a Reason.
3. Without Operator access the actions are disabled with "Sign in as Operator"; after signing in they are enabled.
4. The Product Manager chooses Mark Duplicate with "Shift swaps don't sync reliably" as canonical → the item resolves; Fragmentation drops, Duplicate Rate shows 1/1, Review Coverage increases, all with counts.
5. "Shift swaps don't sync reliably" now shows Golden Wok Express's Support from Kevin "via Trade board doesn't update after pickup", in his own words; the duplicate's page links to the canonical one.
6. A new Check for "picked-up trades still show as open" no longer lists the duplicate as a candidate; Same Need points at the canonical Feature Request.
7. Undo restores the item to the queue and the metrics to their previous values; the evidence label disappears.

**Acceptance scenario (agent, Operator MCP):** `review_queue` lists the same pair; `decide_review` without Operator credentials returns `operator_required`; with them, it marks the duplicate and `get_feature_request` on the canonical shows the `via` evidence.

## Out of Scope

Moving Supports or Comments between rows, bulk decisions, automatic merging, customer notifications, themes or groups beyond pairs, prioritization, a Product Manager identity beyond Operator access, and re-judging pairs after edits.

## Further Notes

- The scan reuses the spec 001 judge and its 20 s timeout; it runs once per unscanned Feature Request, so per-branch Neon previews inherit scans from their parent branch.
- Suspected pairs inherit the same-need precision of the judge (100% on the 10-pair held-out reading in spec 001); a wrong suspicion costs one Distinct decision, never lost evidence.
- Candidate follow-ups: themes/groups and evidence summaries (slice 3); a real Product Manager identity.
