---
name: council
description: Get independent expert perspectives and an evidence-based synthesis for a consequential decision; advisory only. Use when the user says "ask the council", "get a second opinion", or "what would experts say".
disable-model-invocation: false
---

# Council

## Purpose

Improve decision quality through independent, adversarial expert review. The council is advisory: it does not implement, approve, or change decisions.

## Invocation

Run when the user asks for the council or a second opinion on a question, proposal, specification, or file ("ask the council", "get a second opinion"; a `/council` command works the same). Modes:

- **Quick** (default): three perspectives, one review round.
- **Deep** ("deep council", "council deep"): up to five perspectives, then one rebuttal round.
- **Review** ("council review of the spec"): the subject is a specification or file.

## Evidence packet

Read the relevant specifications, decision records, implementation, and repository constraints. Build one shared evidence packet that states the decision under review and separates accepted requirements from assumptions and proposals. Every reviewer starts from this packet. Ask the user any clarifying question here, in the main thread, before reviewers launch.

## Reviewers

Pick specialists for the question rather than a fixed panel, for example product value, UX, architecture, testing and reliability, security, or a simpler alternative. At least one reviewer actively challenges the proposal and the user's and agent's assumptions.

Each reviewer returns:

1. Recommendation.
2. Supporting evidence.
3. Assumptions and uncertainty.
4. Risks and trade-offs.
5. Strongest viable alternative.
6. What evidence would change the recommendation.

## Independence

Parallel groups (fan-out rule: `write-agents` Workers):

- **Review round:** launch every reviewer in one batch, each in its own context with the evidence packet and no access to the others' conclusions.
- **Deep rebuttals:** after collecting findings, launch one rebuttal per material disagreement in parallel; each sees only the findings it answers. Stop after that round.

Use model diversity only when it is actually available and useful, and never invent it. Without workers, label the result a single-agent multi-perspective analysis; never claim independence that did not happen.

## Synthesis

The main thread identifies agreement, material disagreements, evidence quality, unresolved assumptions, the strongest objections, the simplest viable solution, and a recommended decision. Agreement is not proof; weigh arguments and evidence, not votes.

## Output

### Verdict
One concise recommendation and its evidential confidence.

### Consensus
Findings supported by independently produced reviews.

### Disagreements
Meaningful conflicting conclusions and why they differ.

### Risks and alternatives
Key failure modes and simpler viable options.

### Next action
One concrete recommended step.

### Execution
Actual reviewers, available model identifiers, evidence inspected, and execution limitations.

Keep quick-mode output concise.

## Restrictions

Read-only: do not modify product code, and do not write tasks or specifications unless asked. Do not fabricate findings or citations.

When a recommended choice passes `to-spec`'s decision-record test, record it under `docs/decisions/` with status **Proposed** only; acceptance happens through `to-spec`. Council completion never implies approval.

## Completion

Done when the output sections are delivered, with the Execution section stating whether reviews ran as independent workers or as a single-agent analysis.
