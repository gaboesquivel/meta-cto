---
name: competitors
description: Map alternatives, differentiation, and switching dynamics for a product decision. Use when the user says "who are the competitors", "what are the alternatives", or "why would people switch".
disable-model-invocation: false
---

# Competitors

Runs standalone or inside `explore`. Clarify the decision competitors should inform (positioning, scope, pricing, distribution, or build vs buy). Read existing product context first.

Identify alternatives customers actually consider: direct products, adjacent tools, manual workflows, and doing nothing. As parallel groups (fan-out rule: `write-agents` Workers), launch one read-only worker per alternative class, grouping named competitors by class and capping workers at about five; each notes the job it serves, strengths, weaknesses, and why someone chooses or leaves it. The main thread verifies and merges.

Prefer primary sources and the user's knowledge; label web summaries as secondary and time-bound. Without web access, work from the user's knowledge and repository context, and mark the landscape as unverified.

Summarize differentiation honestly: where the proposed direction wins, where it is weaker, and what would falsify the positioning. Do not treat feature parity lists as strategy.

When real web research happened, save findings with sources and limits to `docs/research/YYYY-MM-DD-topic.md`. Never save transcripts.

Return the landscape, implications, open questions, and recommended next activity. Analysis does not authorize implementation. `jtbd` can deepen customer evidence.

Done when the landscape is returned with each source labelled primary, secondary, or unverified, and the research file path is reported when one was saved.
