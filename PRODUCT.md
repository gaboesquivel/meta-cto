# Signal

## Definition

Signal is an AI-first feature intelligence product. It helps product teams turn unstructured customer feedback and feature requests into evidence-backed product decisions: Capture → Understand → Connect → Evaluate → Decide. AI improves the workflow itself; product managers keep responsibility for consequential prioritization and roadmap decisions.

The MVP covers **Capture → Connect → Understand** in three slices, built API and MCP first. The first slice stops feedback fragmentation at the moment a request is submitted.

Positioning: Signal is the system of record for feature requests, and its check before every create gives staff and agents a verdict on each similar request (same need, related need, or different) with reasons. Integrations with trackers come later.

## Differentiator

**A verdict before every create, not a merge after it.** Before a request is written, Signal tells whoever is filing it, a support person or an AI agent acting for a customer, how the draft relates to what already exists:

- **Same need:** support or comment on the existing request instead, carrying this customer's words and account context.
- **Related need:** file it, linked to its neighbor, with a note on what they share. Related needs stay distinct and never get merged away.
- **Different:** file it.

Each verdict comes with a reason a person or an agent can act on, and a stated reason is required whenever a suggestion is passed over.

Why this is different ([landscape](docs/research/2026-10-28-feature-request-landscape.md)):

|               | Everyone else                                                                           | Signal                                                   |
| ------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| When          | After creation: batch linking, triage suggestions, auto-merge inboxes                   | Before creation, at draft time                           |
| Outcome       | Binary: duplicate or not                                                                | Three-way: same need, related need, different            |
| Explanation   | None, or a similarity score                                                             | A reason per verdict                                     |
| Who it serves | End users on public forms, or PMs cleaning up                                           | Staff and agents filing for a customer, over API and MCP |
| Agent access  | MCP for create, read, update and search; agents stitch "search, then decide" themselves | One MCP call returns the verdict and the next action     |

Lossless merges, a review queue and account context on requests are table stakes that Signal must match; they are not the differentiator. The edge has to be **verdict quality**, measured as same-need precision on a held-out set, because incumbents (Linear, Atlassian, Canny, Pylon) already have most of the pieces to follow.

## MVP slices

1. **Capture → Connect (first implementation slice).** The pre-create verdict over API and MCP, support and comment with account context, create with a stated reason, a PM review queue, lossless merge and split, the seeded Crewday history and the frozen held-out eval set. Measured by fragmentation rate with review coverage.
2. **Discover and support.** Browse, search and request-detail endpoints, plus a minimal internal UI: submit with the live verdict while drafting, browse and search, support or comment, and a request page that shows its evidence (supporters, accounts, comments, related links with reasons).
3. **Understand and evaluate.** AI extracts the underlying need behind a proposed solution, shows related requests as a group with the reasons they relate, and summarizes evidence per request or group, including demand by account and segment. It explains; it does not score priority. The PM decides.

The MVP is for internal teams (staff, agents, PMs). Customers stay informed through the people who file for them.

## Problem

Product teams receive feature requests from customers, prospects, support and internal stakeholders. The same underlying need arrives in many different words, so evidence and demand fragment across near-duplicate requests, and product managers spend their time finding, merging and summarizing instead of deciding. Related but distinct needs are the hard part: they must stay separate and linked, not be flattened into one.

Example (Crewday demo data): Sofia (employee) reports that shift swaps don't sync reliably; Daniel (store manager) needs approval workflows for shift changes; Patricia (regional manager) needs scheduling visibility across 12 locations. These are related aspects of scheduling coordination, not duplicates.

## Who

- **Submitters (staff):** customer-facing people (support, success, sales) filing requests on a customer's behalf, with account context.
- **Submitters (agents):** AI agents (support bots, assistants via MCP) filing on a customer's behalf. First-class users: the MVP is API and MCP first.
- **Product managers:** review new requests against their nearest matches and confirm, merge or split. They own every consequential decision.
- Later, not in the MVP: product leaders (prioritization, decision briefs) and customers submitting directly.

## Why now

AI makes judging "same need versus related need" cheap enough to run on every submission, and requests increasingly arrive through agents and integrations rather than forms. In 2025–26 feedback and tracker vendors shipped MCP servers, but as create, read, update and search: none documents a check before create, and duplicate detection everywhere is binary and after the fact ([landscape](docs/research/2026-10-28-feature-request-landscape.md)). Intake is where fragmentation can be stopped, and API/MCP is its natural first surface.

## Core journeys

1. **Staff submitter:** drafts a request → sees similar requests labeled same need / related / different, each with a reason → supports or comments on one with the customer's context, or creates a new request with a stated reason.
2. **Agent submitter:** checks similarity over MCP with the draft and customer context → supports or creates → returns a citable request handle to the customer.
3. **Product manager:** works the review queue (new requests next to their nearest matches) → marks each duplicate, related or distinct → merges and splits never lose who supported what for which account.
4. **Internal user discovering:** browses or searches requests → opens one → sees its underlying need, supporters by account, comments and related requests with reasons → supports or comments.
5. **Product manager evaluating:** opens a group of related requests → reads the underlying needs and the evidence summary (demand by account and segment, supporting and contradicting feedback) → decides what to pursue, outside Signal for now.

## Main metric and kill criterion

- **Main metric: fragmentation rate.** The share of new requests later marked as duplicates of an existing request. Lower is better. Always reported with **review coverage** (the share of new requests a reviewer has judged), so a low rate can't hide missing review. Baseline unknown: measured first by replaying the seeded Crewday history, then live from review-queue decisions.
- **Supporting metrics:** suggestion acceptance (supports or comments instead of creates), wrong-merge rate (merges later split), and same-need precision and recall on the held-out eval set.
- **Later-slice signals (measured, not targets yet):** time from a new request to a reviewed state, and how often PMs edit or reject an extracted underlying need.
- **Kill criterion:** same-need precision below **85%** on the frozen held-out Crewday eval set after a few prompt and retrieval iterations → drop suggest-before-submit and fall back to PM-only grouping.

## Riskiest assumptions

| Assumption                                                                                                           | Confidence                                                                                              |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| AI can tell "same need" from "related need" at ≥85% precision on wording the team didn't tune against                | Low–medium. Tested last (the build comes first), so the held-out set is frozen before any tuning.       |
| Staff and agents will support an existing request instead of creating one when the suggestion is right               | Medium. Search-before-create and a support response as citable as a create are meant to make this true. |
| A support plus a comment keeps enough nuance that PMs don't lose signal                                              | Medium.                                                                                                 |
| Pairwise "related" links (at most two, each with a shared-dimension note) are useful without themes                  | Medium.                                                                                                 |
| PMs will work a review queue through API/MCP before a UI exists                                                      | Low–medium. Coverage makes the gap visible.                                                             |
| Incumbents (Linear, Atlassian, Canny, Pylon) don't ship a labeled check-before-create over MCP during the MVP window | Low–medium. All four have most of the pieces; the edge has to be verdict quality, not being first.      |

## Alternatives

See the [landscape](docs/research/2026-10-28-feature-request-landscape.md) for sources.

- **Status quo:** spreadsheets, Slack channels and tracker labels, with a PM deduplicating by hand.
- **Feedback boards** (Canny, Featurebase, Frill, Upvoty, Fider): similar-while-typing for end users, AI merging after submission, MRR on votes, MCP servers for create and merge. Duplicates are binary; no related-need outcome.
- **PM suites** (Productboard, Aha! Ideas, Jira Product Discovery with Cycle, airfocus, Harvestr): feedback linked to features after the fact, in batches or background queues, without reasons.
- **AI feedback analytics** (Enterpret, Unwrap, Dovetail, Chattermill): themes from high-volume tickets and calls after the fact; read-only MCP servers; enterprise pricing.
- **Where staff and agents already work** (Linear Customer Requests and Triage Intelligence, GitHub Issues, Pylon): account-linked requests and semantic suggestions, but after creation or only in a human form.
- **PM-only AI grouping:** AI proposes merges only to PMs, never steering submitters. This is the fallback if the kill criterion is hit.
- **Agent alternatives:** an agent stitching search and create on any of the above MCP servers itself. No verdict, no reasons, no nudge.

## Out of scope (MVP)

Customer-facing UI and customer sign-in (no public voting board or portal), AI priority scores and recommendations, decision briefs, stakeholder status updates, emerging-needs detection, automated triage routing, and external integrations beyond MCP (tracker sync comes later). These are candidates after the MVP. Crewday is demo data, not Signal's target market.

## Technical baseline

- Package / Portless slug: `meta-cto`
- Local dev host: `meta-cto.localhost`
- Template: `flow-next` at `a041f135f02b3ed277607eaf21982807e1c6af4a`
