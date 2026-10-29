# Signal — glossary

Ubiquitous language for Signal, organized by bounded context and DDD pattern. Template platform terms are kept at the end. One word per concept; use the bold term and avoid the listed alternatives.

## Intake context

Capture → Connect: what happens between a draft and a stored Feature Request.

### Aggregates and entities

**Feature Request** _(aggregate root)_:
A described product need filed in a Workspace, with its Supports, Comments and Related Links. Always written in full in prose, code and APIs.
_Avoid_: Request (alone), idea, post, ticket, suggestion, feature

**Check** _(entity)_:
One evaluation of a Draft against existing Feature Requests, returning an Underlying Need and a Verdict per candidate. Every create must cite a recent Check.
_Avoid_: Dedup, search, lookup, scan

**Support** _(entity)_:
An Actor's statement that an Account needs an existing Feature Request, carrying the Requester's own words and Account Context. At most one per Feature Request per Account.
_Avoid_: Upvote, vote, +1, like

**Comment** _(entity)_:
A note added to a Feature Request by an Actor, optionally on behalf of an Account.
_Avoid_: Reply, message

**Related Link** _(entity)_:
A pairwise link between two distinct Feature Requests that share part of a need, with a Shared Dimension. Never merges them.
_Avoid_: Relation, association, cluster

### Value objects

**Draft**:
The title and description an Actor intends to file, plus who it is on behalf of, before any Feature Request exists.
_Avoid_: Pending request, unsaved request

**Verdict**:
The Check's judgment of one candidate: **Same Need**, **Related Need** or **Different**, always with a Reason.
_Avoid_: Match, score, similarity, duplicate flag

**Same Need**:
Verdict that the Draft expresses the need of an existing Feature Request; the next action is to Support or Comment instead of creating.
_Avoid_: Duplicate (reserved for review), match

**Related Need**:
Verdict that the Draft shares part of a need with an existing Feature Request but is distinct; the next action is to create with a Related Link.
_Avoid_: Similar, near-duplicate

**Different**:
Verdict that the candidate does not address the Draft's need.
_Avoid_: No match, unrelated

**Reason**:
The short explanation attached to a Verdict, written so a person or an agent can act on it.
_Avoid_: Rationale, explanation, confidence

**Underlying Need**:
The customer problem behind a proposed solution, stated without the solution.
_Avoid_: Problem statement, pain point, job, root cause

**Shared Dimension**:
The part of a need that two related Feature Requests have in common (for example, "shift-change governance").
_Avoid_: Theme, tag, category

**Skip Reason**:
The stated reason an Actor creates a Feature Request although the Check returned a Same Need candidate.
_Avoid_: Override, justification

**Account Context**:
Facts about an Account attached to a Support or Draft, such as size, segment and plan.
_Avoid_: Metadata, customer data, enrichment

### Domain events

- **Draft Checked**: a Check completed for a Draft.
- **Feature Request Created**: a new Feature Request was filed, with its Check and any Skip Reason.
- **Feature Request Supported**: a Support was added.
- **Comment Added**: a Comment was added.
- **Related Link Added**: two Feature Requests were linked by a Related Need.

## People and tenancy

**Workspace**:
One product team's Signal space and the boundary of all its Feature Requests. In the MVP there is one: the Crewday Demo Workspace.
_Avoid_: Tenant, organization, project

**Account**:
An organization that is a customer of the Workspace's product (for example, a restaurant chain using Crewday).
_Avoid_: Customer, company, client, org

**Requester**:
A person at an Account who expressed a need (for example, Sofia, an employee).
_Avoid_: Customer, end user, submitter

**Actor**:
Who performed an action in Signal: a Staff Actor or an Agent Actor. Recorded separately from the Account and Requester it acts for.
_Avoid_: User, submitter, author

**Staff Actor**:
A customer-facing person (support, success, sales) acting in Signal on an Account's behalf.
_Avoid_: Agent (reserved for AI), rep

**Agent Actor**:
An AI agent acting in Signal through the API or MCP on an Account's behalf.
_Avoid_: Bot, assistant (the template's Assistant is a different thing)

**Product Manager**:
The person who reviews Feature Requests and owns every consequential decision about them.
_Avoid_: Admin, owner, reviewer (reviewer is a role in review, not a person type)

## Review context

**Review Queue** _(aggregate)_:
New Feature Requests not yet reviewed, plus existing Feature Requests with an undecided Suspected Duplicate, each with the AI's Reason.
_Avoid_: Inbox, triage, backlog

**Suspected Duplicate**:
Two existing Feature Requests the AI judged Same Need. A prompt for review, never counted as duplication until a Review Decision confirms it.
_Avoid_: Duplicate (reserved for a Review Decision), match

**Review Decision** _(value object)_:
A Product Manager's judgment: **Duplicate** (with a canonical Feature Request), **Related** (with a Shared Dimension the Product Manager states), **Distinct**, or **No Duplicates** for a request with no suspicions, recorded with who, when and the AI suggestion it answered.
_Avoid_: Verdict (that is the Check's)

**Duplicate**:
Review Decision that a Feature Request repeats a canonical one; recorded by Mark Duplicate.
_Avoid_: Same need (that is a Verdict)

**Mark Duplicate** _(recorded as a Review Decided event)_:
A reversible association from a Feature Request to a canonical one. No evidence moves; the canonical Feature Request shows its duplicates' Supports and Comments with provenance, counting each Account once.
_Avoid_: Merge, combine, consolidate, dedupe

**Undo** _(recorded as a Review Undone event)_:
Reversing a Review Decision; a Mark Duplicate association ends and the decision history is kept.
_Avoid_: Split, unmerge

**No Duplicates**:
Review Decision that a new Feature Request with no Suspected Duplicates repeats no existing one. A decision, not the absence of one.
_Avoid_: None, undecided

**Reviewed**:
A Feature Request whose review is complete as a whole: every Suspected Duplicate on it is decided, or the Product Manager confirmed it has none.
_Avoid_: Triaged

## Measurement context

**Intake Duplicate Rate**:
Among reviewed new Feature Requests (created through a Check), the share confirmed Duplicate. The main metric; lower is better. Reported with counts, Review Coverage and the backlog baseline (the same rate over reviewed pre-Signal Feature Requests).
_Avoid_: Fragmentation rate, dedup rate

**Review Coverage**:
Reviewed new Feature Requests ÷ new Feature Requests. Always reported with Intake Duplicate Rate.
_Avoid_: Review rate, completion

**Suspected Duplication**:
Open Feature Requests with an undecided Suspected Duplicate ÷ open Feature Requests. A review-workload signal, labeled AI-suspected; not confirmed duplication.
_Avoid_: Fragmentation, duplicate rate

**Suggestion Acceptance**:
The share of Checks with a Same Need candidate that end in a Support or Comment instead of a create.
_Avoid_: Conversion, deflection

**Undo Rate**:
The share of Duplicate decisions later undone.
_Avoid_: Wrong-merge rate, error rate

**Eval Set**:
Labeled Draft–Feature Request pairs with the correct Verdict, split into a **Dev Set** (for tuning) and a frozen **Held-Out Set** (only for judging, never tuned against).
_Avoid_: Test data, benchmark, golden set

**Same-Need Precision**:
Of the candidates the Check labels Same Need, the share the Held-Out Set also labels Same Need. Kill line: 85%.
_Avoid_: Accuracy

**Crewday Demo Workspace**:
The seeded Workspace for Crewday, a fictional workforce-scheduling SaaS, used for the demo, the replay and the Eval Set. Demo data, not Signal's target market.
_Avoid_: Test tenant, sample data

## Platform (template)

**Portless host**:
Local dev URL host (`meta-cto.localhost`) used by the template's Portless configuration.

**Public MCP**:
Unauthenticated MCP tools at `/api/mcp`.

**Operator**:
The template's protected console and MCP, requiring `OPERATOR_SECRET` and failing closed when unset. Not a Signal product role.
_Avoid_: Admin, Product Manager
