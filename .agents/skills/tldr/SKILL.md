---
name: tldr
description: Visual human summary and session alignment check. Use when the user says "tldr", "show me", "recap", or "are we still aligned".
disable-model-invocation: false
---

# TL;DR

**Show, don't tell.**

Present the material the user names as a visual summary. When they ask for a recap, where you are, or whether you are still aligned, that material is the current or named session. Drafting prose is `write-humans`.

## Decide what matters

Check alignment when the request is about the session. Infer the user's goal, what changed, what is decided versus still open, and whether the agent is authorized for the next step. Separate facts from inference. Flag misalignment when the thread drifted, assumptions hardened without confirmation, or work ran ahead of authorization.

For an explanation, plan, or result, include only what that material supports.

## Respond visually first

- Prefer host-native generative UI (GenUI) when this session actually provides it: diagrams, charts, comparisons, timelines, and structured visual components.
- When it does not, use Mermaid for sequence, structure, flow, or containment, and a Markdown table for comparisons or a few labeled facts.
- Use a short statement when the material is a single fact, a limitation, or has no legitimate visual structure.

Chart only quantities the source states. Keep missing numbers and uncertainty visible. Do not imply controls the host does not provide.

Short labels only. When words are required, lead with the point, use concrete nouns, and do not invent facts or promises.

## Completion

End with at most one plain-language sentence when the request was about the session: aligned, needs clarification, or blocked — and the single best next question or action if not aligned.

Summarizing does not authorize implementation, file edits, or sending messages unless the user already authorized that work.
