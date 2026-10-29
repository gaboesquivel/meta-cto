# 002 — Review queue: confirm duplicates, keep the evidence, show prevention

Status: accepted (2026-10-29) · Issue: [#13](https://github.com/gaboesquivel/meta-cto/issues/13)
Slice: MVP slice 1, journey 3 (Product Manager review) ([PRODUCT.md](../../PRODUCT.md#core-journeys)); builds on [spec 001](001-check-before-create.md)
Decisions: [0002 Measure prevention with confirmed duplicates; duplicates as reversible associations](../decisions/0002-fragmentation-and-duplicate-association.md) (Accepted), [0001](../decisions/0001-postgres-pgvector-neon-drizzle.md) (Accepted)

## Problem Statement

Spec 001 stops duplicates before creation, but nobody can yet tell whether it works. Signal's main metric is unmeasured (`fragmentationRate: null`) because no human ever confirms a duplicate. Duplicates already in the backlog stay fragmented, the AI's suspicions about them are invisible, and a Product Manager can't answer the question that matters: _do I understand what customers really need, without losing the original evidence?_

## Solution

One journey for a Product Manager, centered on measurable product value:

1. **See what needs review.** New Feature Requests (created through a Check), plus backlog Feature Requests the AI suspects are the same need, each suspicion with its Reason.
2. **Decide.** For each, the Product Manager confirms **Duplicate** of a canonical Feature Request, records **Related** with a Shared Dimension they state, or marks **Distinct**. The AI suggests; the human decides.
3. **Keep the evidence.** A confirmed Duplicate is an association, not a move. The canonical Feature Request shows every customer's original words and Account from its duplicates, labeled with where they came from. **Undo** ends the association and keeps the history.
4. **See the value.** Intake Duplicate Rate for requests created through Signal, next to the same rate for the pre-Signal backlog, with Review Coverage and counts. Suspected Duplication shows the review workload falling.

Review queues and reversible merging are table stakes in this category (see the [landscape](../research/2026-10-28-feature-request-landscape.md)). The differentiator is still the verdict before every create; this spec adds only the human confirmation that makes that differentiator measurable.

## Definitions (from decision 0002)

| Term                                | Meaning                                                                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suspected duplicate                 | Two existing Feature Requests the AI judged **Same Need**. Unconfirmed; never counted as duplication.                                                                                    |
| Review Decision                     | A Product Manager's **Duplicate** (with canonical), **Related** (with Shared Dimension) or **Distinct**, with who, when, and which AI suggestion (if any) it answered.                   |
| Reviewed                            | A Feature Request whose review is complete as a whole: every suspected duplicate on it is decided, or the Product Manager confirmed it has none.                                         |
| Intake Duplicate Rate (main metric) | Reviewed new Feature Requests confirmed Duplicate ÷ reviewed new Feature Requests. Shown with counts and the **backlog baseline** (same rate over reviewed pre-Signal Feature Requests). |
| Review Coverage                     | Reviewed new Feature Requests ÷ new Feature Requests.                                                                                                                                    |
| Suspected Duplication (supporting)  | Open Feature Requests with an undecided suspected duplicate ÷ open Feature Requests. Labeled AI-suspected.                                                                               |

"New" means created through a Check (spec 001). Pre-Signal means seeded or imported without a Check.

## User Stories

1. As a Product Manager, I want to see which Feature Requests need review and why the AI suspects a duplicate, so that I spend time where fragmentation is likely.
2. As a Product Manager, I want to confirm Duplicate, Related or Distinct in one step each, so that review is fast and the AI never decides for me.
3. As a Product Manager, I want the canonical Feature Request to show every customer's original words and Account from its duplicates, each Account counted once, so that consolidating never loses evidence.
4. As a Product Manager, I want to Undo a decision and still see that it happened, so that mistakes are cheap and the record is trustworthy.
5. As a Product Manager, I want to compare Intake Duplicate Rate for Signal-created requests with the pre-Signal backlog, with coverage and counts, so that I can tell whether prevention is working.
6. As a Staff Actor or Agent Actor, I want Checks to stop offering confirmed duplicates and point to the canonical Feature Request, so that new evidence lands in the right place.

Failure cases:

7. Review Decisions and Undo without Operator access are refused; the queue, evidence and metrics stay readable.
8. A Duplicate must point at a canonical (non-duplicate) Feature Request; self-references and chains are refused.
9. Related without a stated Shared Dimension is refused.
10. Undo of an already-undone decision is refused.

## Capabilities

Contracts are written contract-first during tasks; this section states what each capability must do and for whom.

- **Review Queue:** lists new Feature Requests not yet reviewed and backlog Feature Requests with undecided suspected duplicates, each with the AI's Reason. Readable by anyone; available to people (`/review`) and agents (Operator MCP).
- **Decide and Undo:** record and reverse Review Decisions. Operator access only. Every decision and undo is kept as history.
- **Backlog scan:** finds suspected duplicates among existing Feature Requests using the spec 001 judge (Same Need only), once per Feature Request. It is an explicit Operator action, never part of a build or deploy, so AI cost and nondeterminism stay out of deployments. New Feature Requests get suspicions for free from their Check (a Same Need candidate that was skipped at create).
- **Canonical evidence:** a Feature Request's detail shows its confirmed duplicates and their Supports and Comments with provenance. A duplicate's page points to its canonical Feature Request.
- **Checks respect decisions:** confirmed duplicates are no longer Check candidates.
- **Metrics:** Intake Duplicate Rate with backlog baseline, Review Coverage, and Suspected Duplication, each with numerator and denominator, alongside spec 001's Suggestion Acceptance.

**Exposure:** same deployment and open read access as spec 001. Writes in this spec (decisions, undo, scan) require the template's Operator access and fail closed when `OPERATOR_SECRET` is unset.

## Testing Decisions

Test-first, as in spec 001, with the judge mocked: decisions, undo history, association rules, Check exclusion, metric definitions (including small and zero denominators), Operator access, and REST/MCP parity rows for the new operations. Model quality is not re-tested here; suspicions inherit spec 001's held-out same-need precision.

**Acceptance scenario (Product Manager, branch preview).** Steps assert behavior and use whatever the scan and Checks return, not specific AI outputs.

1. Starting state: seeded Crewday Workspace on a preview with its own Neon branch. Metrics show no reviewed requests yet, with counts.
2. Without Operator access, the queue and metrics are visible and decision actions are refused. With Operator access, the Product Manager runs the backlog scan; the queue then lists at least one suspected duplicate with a Reason (the seed contains deliberate near-duplicates, which makes this likely but not certain; if none appear, steps 3 to 5 use a duplicate created in step 6).
3. The Product Manager confirms one suspected pair as Duplicate. The canonical Feature Request shows the duplicate's Supports with their original words and a "via" label; an Account present on both is counted once. Suspected Duplication falls and the backlog baseline gains a reviewed request.
4. The Product Manager decides another pair Distinct and a third Related with a stated Shared Dimension (if pairs remain). Related without a Shared Dimension is refused.
5. Undo on the Duplicate: the association ends, the evidence label disappears, metrics return to their previous values, and the decision history still shows the decision and its undo.
6. A Staff Actor creates two new Feature Requests through Checks (one skipping a Same Need suggestion with a Skip Reason). The Product Manager reviews both. Intake Duplicate Rate and Review Coverage show the result with counts, next to the backlog baseline.
7. A Check for a draft matching a confirmed duplicate no longer offers the duplicate and points to its canonical Feature Request.

**Acceptance scenario (agent, Operator MCP):** the agent reads the queue, is refused a decision without Operator credentials, records one with them, and sees the canonical evidence with provenance.

## Out of Scope

Moving Supports or Comments between rows, bulk or automatic decisions, AI-suggested Related or Distinct, scanning in builds or on a schedule, re-judging after edits, Product Manager identity beyond Operator access, themes or groups, prioritization, and customer notifications.

## Assumptions and risks

- **Reviewers need Operator access:** the `OPERATOR_SECRET` must be shared privately for the demo. Without it, the demo is read-only.
- **Small samples:** early rates rest on a handful of requests; counts are always shown, and no target is set until there's a baseline.
- **AI nondeterminism:** scan results vary between runs, so the demo depends on the seed's deliberate near-duplicates, not on specific pairs.
- **What prevention means here:** a lower Intake Duplicate Rate than the backlog baseline suggests prevention works. It is not proof: new requests are fewer and younger.
- **Candidate follow-ups:** themes/groups and evidence summaries (slice 3); a real Product Manager identity; scheduled scans.

## Tasks

- [x] 01: Review contracts and data model (#15) — [a348b8e](https://github.com/gaboesquivel/meta-cto/commit/a348b8e992265789eab559eab982afe4e530469a)
- [ ] 02: Review service: queue, decisions, evidence, metrics (#19) — blocked by 01
- [ ] 03: Backlog scan as an Operator action (#16) — blocked by 01
- [ ] 04: Review REST API with Operator access (#14) — blocked by 01
- [ ] 05: Operator MCP review tools (#18) — blocked by 01
- [ ] 06: Review UI and canonical evidence (#17) — blocked by 01
- [ ] 07: Wire, verify and align docs (#20) — blocked by 02–06
