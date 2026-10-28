# Feature-request intake landscape

Date: 2026-10-28. Decision informed: Signal's positioning and MVP scope (duplicate-aware submission for staff and agents over API/MCP).

Labels: **[P]** primary (vendor page read), **[P*]** vendor source seen only via search summary, **[S]** secondary with date, **[U]** unverified. Key claims marked ✓ were re-checked against the vendor page on 2026-10-28.

## Limits

- Web research on one day; vendor capabilities change monthly, especially MCP servers.
- No customer interviews, no hands-on trials, no review-site analysis. "Why teams choose or leave" evidence is thin and mostly vendor-authored.
- Absence claims ("no vendor offers X") mean "not documented on the pages we read", not proof.

## Alternatives by class

### 1. Feedback boards and voting portals

| Product | Duplicate handling | Agent access | Notes |
| --- | --- | --- | --- |
| Canny | Autopilot flags or auto-merges likely duplicates after submission; revertible; billed per check [P]. No related-need outcome; FAQ suggests manual "groups" [P]. | Official MCP, 60+ tools incl. `create_idea`, `list_ideas`, `merge_ideas`, `send_to_autopilot`; no similarity tool ✓ [P, 2026-08-28] | MRR on company (`monthlySpend`), CRM sync on Business [P]. Pro from $79/mo, priced by tracked users [P]. |
| Featurebase | AI similar-post detection, "Find duplicates", Autopilot merges; merge moves requesters and comments, undoable [P] | Official MCP (OAuth, paid plans): search and create/update posts and voters [P] | Revenue sync via SDK [P]. Per seat $0–99 [P]. |
| Frill | Suggests similar ideas while typing; Smart Merge; approval queue [P] | — | Matching method undocumented. |
| Nolt | Similar posts while creating; merge moves votes [S] | No public API [S, 2026] | |
| Upvoty | Merge AI at moderation; queue or auto above threshold; reversible [P] | — | |
| UserVoice | "Merge Matches" [S] | No MCP found [U] | Salesforce account mapping [S]; acquired by Curious, Nov 2025 [S]. |
| Fider (OSS) | `GET /api/v1/similarposts` for check-before-create, keyword-only, top 5 [P] | Plain API | Binary duplicate only. |
| VoteShip | Claimed semantic duplicate detection over MCP (pgvector) [S, 2026-02-16] | Claimed MCP | Existence not verifiable (npm 403) [U]. |

### 2. Product management suites with AI insights

| Product | Linking feedback to work | Agent access | Notes |
| --- | --- | --- | --- |
| Productboard | AI "search insights" from a feature, and batch auto-linking every 3h labeled "AI to verify"; no reasons, no intake check [P] | Official MCP (beta): find/read/refine specs, comment, status ✓ [P]. Marketing page claims feedback creation; support docs don't list it ✓ → [U] | API v2 notes need an existing user/company (404 otherwise) [P]. Per-maker pricing, Spark credits [P]. |
| Aha! Ideas | AI "Similar" banner with admin thresholds (similar < duplicate), after the fact, no per-pair reasons [P]; merge keeps voters [P] | Official MCP (2026-05-20): read, search, create, update incl. ideas; no similarity tool [P] | Closest to a two-level verdict, but unexplained. |
| Jira Product Discovery | Manual merge; AI dedup via marketplace apps [S, 2026] | Rovo MCP: create/search Jira issues, semantic search beta, no JPD or duplicate tools [P]; insights via MCP experimental [S, 2026-05] | Absorbed Cycle.app (AI capture, linking) [P]. |
| airfocus (Lucid) | — | Enterprise MCP: search items, create insights, link to opportunities [P] | No similarity classification. |
| Harvestr | HAI suggests link-to-existing or create-new in background; accept/reject; no reasons [P] | API + webhooks [P] | Quota-metered AI [P]. |

### 3. AI-native feedback analytics

Enterpret, Unwrap.ai, Dovetail, Chattermill, BuildBetter: after-the-fact clustering of high-volume tickets, calls and reviews into themes; MCP servers are read/query-oriented (Unwrap 16 tools, "read-only" [P]; Chattermill read-only beta [P]; Enterpret themes and verbatims with account metadata [P]; Dovetail can create research objects [P]; BuildBetter writes are approval-gated [P]). Enterprise, sales-led pricing (Unwrap from $24k/yr [P]). Consolidating: Kraftful → Amplitude AI Feedback [P*], Zelta → Pendo Listen [P*], Sturdy pivoted [P].

### 4. Intake where staff and agents already work

| Tool | How a request is recorded | Duplicate handling | Agent access |
| --- | --- | --- | --- |
| Linear Customer Requests | From Intercom/Zendesk/Front/Salesforce/Slack/Asks, with customer revenue, tier, size [P] | Triage Intelligence: semantic duplicate/related suggestions with reasoning, for issues already in Triage (post-creation); Business/Enterprise ✓ [P]. Linear Agent files first, merges later [S, 2025-12] | Official MCP: issues CRUD; `list_customer_needs` and customer lookup added Oct 2026 [P]; no duplicate tool [P] |
| GitHub Issues | Issue form | Up to 3 potential matches inline while creating; public preview; unlabeled; web form only ✓ [P, 2026-06-18] | MCP covers issue fields, not duplicate detection ✓ [P] |
| Pylon | AI detects feedback in support conversations | Opens a new request only when nothing matches, else links evidence; account-linked; merges/splits in activity log ✓ [P] | No API/MCP documented ✓ [U] |
| Intercom, Zendesk, HubSpot | Tags or third-party apps (Productboard, Aha!, Linear, Savio) [S] | None native [S] | — |
| Plain | Threads + customers; Linear Customer Requests integration [P] | — | MCP ~30 tools, no duplicate check [P] |

### 5. Status quo and doing nothing

Spreadsheets, Slack `#feedback` channels and tracker labels break down past a few hundred requests: the same need is logged under different names, requesting accounts get lost, statuses go stale [S, vendor blogs, undated]. Matches the problem statement; not independent evidence.

## Patterns

1. **Similar-while-typing is standard for end users** (Frill, Nolt, Fider, GitHub preview). It is not a differentiator by itself.
2. **Everyone else deduplicates after creation**: batch linking (Productboard), triage suggestions (Linear), clustering (Pylon, analytics vendors), Autopilot inboxes (Canny). AI capture tools create first and merge later.
3. **Duplicate is binary everywhere.** No vendor documents a "related need" outcome with reasons; Aha!'s two thresholds come closest.
4. **MCP went mainstream in 2025–26, but as CRUD plus search.** No official MCP server documents a pre-create similarity verdict. Agents must assemble "search, then decide" themselves.
5. **Table stakes:** lossless merges that keep voters (Canny, Featurebase, Upvoty, Aha!, Linear), review/approval inboxes, and account/MRR context on requests.
6. **Consolidation:** standalone AI feedback tools are being absorbed by larger platforms (Amplitude, Pendo, Atlassian, Lucid, Curious).

## Gaps relevant to Signal

- **Open (as documented):** a synchronous check-before-create for staff and agents filing on a customer's behalf, returning ranked matches labeled same need / related need / different, each with a reason, plus nudge semantics (support or comment instead of create).
- **Open:** using account context in the verdict (e.g. same need, different segment).
- **Already covered elsewhere:** review queues, lossless merges, MRR context, end-user similar-while-typing, post-hoc AI dedup. Signal must match these; they don't differentiate it.

## Threats (window, not moat)

- **Linear:** semantic engine with reasoning already exists (Triage Intelligence) and its MCP gained customer-need tools in Oct 2026. Exposing pre-create suggestions to agents is a small step.
- **Atlassian:** JPD + Cycle's AI linking + Rovo MCP.
- **Canny:** Autopilot dedup reachable from MCP via `send_to_autopilot` (post-submission).
- **Pylon:** match-or-create with account linkage inside the support tool, no agent API yet.

## What would falsify Signal's positioning

- An incumbent ships a documented pre-create similarity tool with same/related labels over MCP.
- Same-need precision stays below 85% on the held-out eval set.
- Buyers won't add a separate system next to the tracker or PM suite they already pay for (they'd want Signal's check inside Linear/JPD instead).
