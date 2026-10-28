---
name: retro
description: Retrospective on the agent environment after a session; propose improvement candidates with evidence. Use when the user says "let's do a retro", "what went wrong", or "what should we improve".
disable-model-invocation: false
---

# Retro

The user asked for a retrospective on how the agent environment could improve future sessions. One agent can run this directly; separate implementation and review roles are optional context, not a prerequisite.

## Steps

1. Follow `write-agents` conventions when that skill is installed and you propose instruction or skill changes.

2. Gather evidence for the session the user names, or the current session if none is named. Run independent evidence workers in parallel (fan-out rule: `write-agents` Workers): the session transcript (through session or transcript tools when the host provides them), Git and CI history, instruction-file size, and navigation friction. If no transcript is available, ask the user for a short summary of the session or reconstruct it from `git log` and CI history, and say which source you used. Separate evidence from inference; do not invent mistakes that are not supported by the session.

3. Look for improvement candidates:

- **Navigation:** difficulty finding files or hidden dependencies; whether a short pointer document would help.
- **Automated checks:** lint, typecheck, tests, or CI the repo already defines but does not run; missing guardrails when mistakes were preventable.
- **Coding standards:** recurring violations that deserve a mechanical check versus judgment-only guidance in a standards document.
- **Instruction files:** oversized always-loaded project or user instruction files; rules that belong in checks, skills, or linked docs instead. _Only suggest edits; do not modify `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, or similar files unless the user explicitly authorizes those edits._
- **Tool economy:** costly or redundant tool use; optional integrations that lack a simpler fallback.
- **No-ops:** instructions that do not change behavior.
- **Information access:** logs or readonly access that would have changed the outcome.

4. For **recurring mistakes** (the same class of error more than once in the session or recent history), propose the strongest workable prevention, in order:

   1. **Architecture** — one owner, one supported path, invalid operations impossible by structure.
   2. **Types or deterministic checks** — the bad state cannot be written, or CI fails with a message that names the fix.
   3. **Executable tests** — behavior that broke is covered; delete tests that still pass when the behavior breaks.
   4. **Agent guidance** — only for judgment calls that cannot be enforced mechanically.

   For each important candidate, state: evidence the mistake occurred, root cause, why the chosen prevention level fits, how to verify the correction, and whether an existing instruction is now redundant. A single occurrence is a candidate only; do not turn it into a permanent rule without recurrence or explicit user direction.

5. Present candidates by severity. Implementation of recommendations requires explicit user authorization. This retrospective does not authorize file edits by itself.

## Reference

When work splits across roles, review-oriented standards often fit a review pass better than implementation. When one agent does both, apply the same ideas proportionally without inventing a second pass.

Prefer skills and linked docs for detailed guidance. Keep always-loaded instruction files short navigation pointers when the project already uses them.
