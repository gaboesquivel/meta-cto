---
name: flow
description: Align the current project's PRODUCT.md, DESIGN.md, GLOSSARY.md, and ARCHITECTURE.md after meaningful changes, and write the project Flow block on request. Use when the user says "update the docs", "sync the context", "keep the docs aligned", or "set up Flow here".
disable-model-invocation: false
---

# Flow

**Preserve intent** for the project you are in. Align its root context when work changes what that product is, how it behaves, how it is built, or how the team names important concepts.

This skill runs no other skill and authorizes no implementation (decision 0024). It is **not** project initialization.

## Whose product

- **Adopter project:** `PRODUCT.md` is that project's product identity. Update only the sections the change affected.
- **This flow-skills repository:** `PRODUCT.md` is Flow's methodology identity. Edit it when that identity changes. Do not copy it into another repository.

Do not replace a project's product identity with Flow's tagline, mission, principles, or strategic chain.

`flow start` and "start project" are not this skill. The optional `start` skill (decision 0010) is this setup plus a template bootstrap from flow-next or flow-mono (decision 0026), and confirms template, name, destination, and preset before writing. If someone asks to scaffold a repository without `start`, stop and do not create starter trees, instruction-file snippets, or a Flow-branded `PRODUCT.md`.

## Invocation

Hosts may match this skill when the user asks to update or sync the docs. That is not an always-on hook, and it is not evidenced on every host. Confirmed portable behavior is narrower: the user asks for it or invokes `/flow`, or `build` and `review` apply the same alignment rules when those skills are in use. Do not claim alignment ran only because metadata allows a host to suggest this skill.

## Process

1. Read `PRODUCT.md`, `DESIGN.md`, `GLOSSARY.md`, and `ARCHITECTURE.md` when present, with parallel tool calls rather than spawned workers (fan-out rule: `write-agents` Workers). Read relevant `docs/specs/` and `docs/decisions/` records only when they clarify the area you are aligning.
2. Update only sections affected by the change, with one writer per root file. Keep one home per fact; link to specs, decisions, or code instead of duplicating detail that is cheap to rediscover.
3. Create a root file only when it would hold meaningful content about the current project. Do not scaffold empty trees, Flow methodology boilerplate, or parallel trackers (no PRD/PDR/ADR folders).

## Flow block

"Set up Flow here" opts the project into Flow mode (decision 0020). This section is the one definition of the block; `start` writes the same block during a bootstrap, before its checks. Deleting the block opts out.

**Repository.** The block needs a Git repository: follow `write-agents` [Repository](../write-agents/SKILL.md#repository) before writing it. Aligning root files does not.

**Ask.** Read any existing block first. When `Delivery:` is missing or `unset` and the request does not name it, ask once before writing: **GitHub** (issues and pull requests) or **local** (decisions 0030, 0037), with a suggestion as `build`'s Delivery mode section describes; that section owns the rule and what each mode does. If `build` is unavailable, ask without a suggestion. A recorded value stays unless the user names a new one, so a re-run with it set asks nothing. Setup asks for no discovery depth (decision 0036); a leftover `Process:` line is dropped on the next write.

**Write** with this skill's [`lib/flow-block.mjs`](lib/flow-block.mjs): `node <skill-dir>/lib/flow-block.mjs <absolute-project-path> [local|github]`. A legacy `pull-request` value is read and rewritten as `github`. The helper owns the layout and block rules: which file holds the block, the `@AGENTS.md` import, markers, the phrase table (`PHRASES`), keeping the recorded value, moving a stale block out of an ignored `AGENTS.md`, and refusing malformed markers or symlinked, out-of-project, or shared instruction files. Never touch text outside the markers and that import line.

**Fallback without Node:** put the block in `AGENTS.md` when it exists and Git does not ignore it (`git check-ignore -q AGENTS.md`), otherwise in `CLAUDE.md`, created if needed; give an existing `CLAUDE.md` `@AGENTS.md` as its first line when `AGENTS.md` exists or is ignored. Write one block between `<!-- BEGIN FLOW -->` and `<!-- END FLOW -->` holding a `Delivery:` line, the helper's phrase table, and a pointer to this skill. Replace an existing block in place, dropping any other line (such as a retired `Deploy:` or `Process:`). When the block goes in `CLAUDE.md` and an ignored `AGENTS.md` holds one, carry its `Delivery:` over unless the user names a new one, then delete only that block from `AGENTS.md`. Stop and report when markers are unmatched or repeated, or when an instruction file is a symlink, resolves outside the project, or `CLAUDE.md` and `AGENTS.md` are one file.

**Goals.** Setup defines the same goals as `start`. After writing the block, when `PRODUCT.md` is missing or has no brief (problem, who, riskiest assumption, main metric and kill criterion, core journeys), name `explore` as the next step and wait.

Report the helper's output: the block's file (`Wrote` or `Unchanged`), any stale block moved, any import added or refusal, and the layout (which file holds the block, whether Git tracks it, which imports exist). Show the block and relay any warning.

## Boundaries

- Do not edit adopter `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, or similar instruction files outside the Flow block and the `@AGENTS.md` import, and write the block only when the user asks or `start` runs a confirmed bootstrap (decision 0020).
- Do not require installation, initialization, or a prior skill invocation.
- Do not treat alignment edits as permission to implement unrelated code. For authorized implementation and tests, invoke the `build` skill when installed.
- Do not create `docs/specs/` or `docs/decisions/` records here; use `to-spec` or explicit decision work when durable bounded artifacts are justified.
- Name another skill (`to-spec`, `domain-modeling`, `review`, …) only when the user asks or setup finds no goals (see Flow block), then wait.

## Completion

State which root files changed and whose product they now reflect. Note unresolved assumptions and whether the user may want a spec or decision record via another skill.
