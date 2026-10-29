---
name: align
description: Check whether the product being built matches its vision, users' problems, success metrics, and roadmap; read-only. Use when the user says "are we building the right thing", "check product alignment", or "has the product drifted".
disable-model-invocation: false
---

# Align

**Are we building the right thing?** Compare what the product is against what it is meant to be, and say plainly where they differ. This is about the what and the why, never the how: code quality is `review`, a session recap is `tldr`, and shaping a new idea is `explore`.

## Gather evidence

Read what exists; a missing source is a finding, not a reason to stop or ask.

- **Intent:** `PRODUCT.md` (vision, problem, users, core journeys, main metric and kill criterion, riskiest assumptions, non-goals), `DESIGN.md` for journey steps, accepted specs and decisions under `docs/`, and any roadmap or candidate specs (files, or `candidate` issues when GitHub is available). A record still Proposed or a draft spec is planned, not intended fact.
- **Reality:** the code, routes, commands, and tests (use `ARCHITECTURE.md` to find them) show what is implemented and what users can actually do. Git history shows where effort went recently.

When both sides are large, read them as two parallel read-only workers (fan-out rule: `write-agents` Workers); otherwise read them directly. Code is the source of truth for what exists; documents are the source of truth for what was intended. Never count a capability as implemented on a document's word alone.

## Judge

Map each core user journey and stated problem to the capabilities that serve it, each marked **implemented**, **partial**, **planned**, or **none**. Then be critical:

- **Working:** journeys and problems the implemented product actually serves.
- **Missing:** stated problems with nothing implemented behind them, and success metrics nothing in the product can observe.
- **Drift:** built work no stated problem or journey asks for, or docs describing a product the code no longer is.
- **Complexity:** features, settings, or surfaces that cost more than the problem they serve.

Cite evidence for every claim (file, doc section, or commit). Separate facts from inference, and say when intent is too thin to judge against.

## Report

Lead with a visual (host generative UI when the session provides it, otherwise Mermaid or a Markdown table): a journey-to-capability map or a table of problems, capabilities, and status. Then, in a few lines each, working, missing, drift, and complexity, and end with **up to three priorities** ranked by impact on the stated vision and metrics. Keep it short; omit an empty section.

## Boundaries

Read-only. Alignment does not authorize edits, specs, issues, or implementation. Name the skill that would act (`flow` to correct stale root docs, `explore` or `to-spec` for a priority, `grill` to test a direction) and wait.

Done when the report shows the map, the findings with evidence, and up to three ranked priorities, or states what intent is missing to judge against.
