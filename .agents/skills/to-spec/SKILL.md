---
name: to-spec
description: Turn the current conversation into a numbered draft specification using project conventions, and accept it when approved. Use when the user says "spec it", "write a spec", "turn this into a spec", "share the draft", or "accept the spec".
disable-model-invocation: false
---

# To Spec

Turn conversation context and repository understanding into a proportionate specification. Do not run a separate interview; synthesize what is already known and label unresolved assumptions rather than inventing decisions. Keep consequential assumptions visible.

Use the project's existing spec location when one exists. Outside a Git repository, follow `write-agents` [Repository](../write-agents/SKILL.md#repository) before writing. In both delivery modes, write the spec on a feature branch named for it, never the default branch; it merges with the work. On an `explore/` branch with no spec yet, rename it to the spec's branch (`git branch -m`) before writing, so the exploration's commits ship with the spec. In local mode a `candidate` stub written during a spec's run is committed on that spec's branch, so it lands with the spec; a candidate written alone, with no spec branch open, is committed on the default branch. Commits on the spec branch also stage pending shared-file appends, in their own commit, as `build`'s [Shared files](../build/SKILL.md#shared-files) describes. When the project has no convention, default new work to `docs/specs/NNN-short-name.md` (three-digit sequence, kebab-case slug) and follow the same pattern for updates. Preserve existing numbering, labels, and trackers when the repository already uses them.

**Spec, tasks, decision** (decision 0026). A spec is one bet: it tests one assumption and ships as one unit. Its tasks are the slices inside it, so a spec may be large. Work that only makes sense after seeing how another bet did gets its own spec. A choice gets a decision record in `docs/decisions/NNNN-short-name.md` (four-digit sequence) only when it chose among real alternatives **and** reaches beyond this spec or is costly to reverse; otherwise it belongs in the spec's Implementation Decisions. Never put feature scope or tasks in a decision record. When a spec makes a choice that passes the test, write the record beside the spec with status **Proposed** and link it from the spec. Also link any **Proposed** records written during exploration that the spec depends on.

Specs may cover product, research, marketing, engineering, operations, or cross-functional work. Use the sections below only when they fit the discipline; omit irrelevant headings. Keep small, understood changes brief.

**Candidate specs.** A later bet that should not be specified yet gets a stub: the problem and the assumption it tests. In local mode it is a file with status `candidate`. In GitHub mode it is an issue labelled `candidate`, with no file, opened only when the user asks for one; otherwise name it in the report. Flesh it out into a full spec only when its turn comes; until then it has no tasks.

## Status and acceptance

A spec's `Status:` line follows `candidate → draft → accepted → implemented` (decision 0028). `to-spec` writes `candidate` and `draft`, and owns acceptance; `build` sets `implemented` on an accepted spec once its last task integrates, and `ship` sets it if still missing. In GitHub mode the spec issue's label (`candidate`, `draft`, `accepted`) carries the same state once the issue exists (decisions 0029, 0035).

**Accept the spec.** When the user approves a spec for delivery ("accept the spec"), in one commit:

- Set its status to `accepted` with the date, and each decision record it links from **Proposed** to **Accepted** with the date, in the project's decision format.
- Write the back-pointers (decision 0038). For each linked record that supersedes or amends an older one, append `Superseded by [NNNN]`, `Superseded in part by [NNNN]`, or `Amended by [NNNN]`, with a short scope, to the older record's Status line (in a frontmatter format, set `superseded_by` instead, and `status: superseded` only for a full supersession) and index row, and to the Status line of each spec it changes; update each contradicted `PRODUCT.md` fact to the new position, linking the record. Entries in the spec's Direction changes section get the same spec and `PRODUCT.md` updates, linking the spec.
- Never write back-pointers before acceptance. A back-pointer is not a scope change and does not return another spec to `draft`.

Then, in GitHub mode, open the spec issue labelled `accepted`, or relabel a shared draft's issue, as Spec issue describes. Writing a draft, reaching spec-ready, or a request to write a spec is not acceptance. An `accepted` label a maintainer added is acceptance: when `to-spec` touches a spec whose label is ahead of its file, write the file status (and linked decisions, with their back-pointers) to match. A `candidate` must become a full draft before it can be accepted. A spec without an acceptance scenario (see Testing Decisions) or an **Exposure** line (see Implementation Decisions) is not accepted: name what is missing and leave it in `draft`. Changing an accepted spec's scope or a decision it links returns the spec to `draft`, and the label with it. Report the files changed.

## Spec issue

GitHub mode only (the `Delivery:` line in the project's Flow block); local mode keeps files only. When the mode is unset or there is no block, ask before opening any issue, as `build`'s Delivery mode section describes; a request that names a mode answers it.

- **"Spec it" publishes nothing** (decision 0035). It writes and commits the draft on the spec branch; it does not push or open an issue.
- **Open at acceptance.** "Accept the spec" pushes the branch, then opens the spec issue labelled `accepted`, or reuses the `candidate`, shared-draft, or feature-request issue the spec fleshes out and relabels it. Write `Issue: #N`, linked to the issue, beside `Status:`, commit and push, then sync the body. Acceptance is the yes; on a public repository, say that the branch (with the brief and any research) and the issue become public.
- **Share the draft.** Only when the user asks ("share the draft"), push the branch and open the issue early, labelled `draft`, the same way, with the same public-repository notice; acceptance relabels it `accepted`.
- **Labels.** Create `candidate`, `draft`, and `accepted` on first use. A spec carries exactly one.
- **Body.** A one-way copy of the file with a hash marker, built by [`lib/spec-issue.mjs`](lib/spec-issue.mjs): from the repository root, `node <skill-dir>/lib/spec-issue.mjs body <spec-path> <owner/repo> <branch>` prints it. Never hand-build or hand-hash a body.
- **Sync** after every change to the file. First save the issue's current body and run `node <skill-dir>/lib/spec-issue.mjs check <body-file>`; exit 1 means the body was edited by hand (a body with no marker counts as hand-edited unless this run just opened it): stop, show the difference from the file's copy, and ask before overwriting. Carry wanted edits into the file instead. On exit 0, replace the body with fresh `body` output.
- Without GitHub access, write the file, say the issue was not opened, and stop there.

## Process

1. Explore the repository when needed. Gather evidence with parallel read-only workers (fan-out rule: `write-agents` Workers): existing specs and decisions, code seams and tests, and the glossary. Use the project's domain vocabulary and respect decision records in the area you are touching unless the gate below confirms a change. Before writing, check for contradictions with accepted decisions, specs, and `PRODUCT.md` through `explore`'s [Direction changes](../explore/SKILL.md#direction-changes) gate, asking only about conflicts not already confirmed in this conversation or in a Proposed record on the current branch.

2. Sketch test seams at the highest practical level. Prefer existing seams; propose new ones only when necessary and as high as possible.

3. Write a proportionate spec using the relevant sections below, saved with status `draft` and the date, and any decision record it needs as **Proposed**. One writer owns the spec; decision records may be written in parallel, one worker per file. Commit them on the spec branch; push nothing and open no issue (see Spec issue). Do not show the text inline or ask before writing; report links to the files written, open assumptions, and that "accept the spec" is the next step (or "share the draft" for comments first in GitHub mode).

<spec-template>

## Problem Statement

The problem from the affected user's perspective.

## Solution

The intended solution from the user's perspective.

## User Stories

Essential scenarios and acceptance criteria when they improve clarity, for example:

1. As an <actor>, I want a <feature>, so that <benefit>

Cover consequential paths and failure cases without redundant stories.

## Implementation Decisions

Decisions that shape execution: modules, interfaces, contracts, schema, or interactions. Prefer stable interfaces and intent over exhaustive file lists.

**Exposure:** where the slice runs, who can reach it, and how writes behave when deployed without authentication. When authentication is out of scope and the slice can be deployed, write paths fail closed on deployment.

Write interfaces contract-first, before any UI: the typed API shape the UI uses; MCP tool definitions when the product names agent users; and errors and permissions an agent can act on. Specify an MCP App only when a journey needs the product's UI inside an agent host; otherwise plain MCP tools suffice.

When a prototype encodes a decision more precisely than prose (state machine, schema, type shape), inline the decision-rich excerpt and note that it came from a prototype.

## Testing Decisions

What good tests mean here, which behavior is in scope, and prior art in the codebase.

**Acceptance scenario** (required; `review` gives each step a verdict): one representative end-to-end journey. Name the actor, the starting state with realistic data, and numbered steps with the observable result of each. When the spec names agent users, give the same journey through the agent interface (MCP tool).

## Direction changes

Confirmed changes to accepted specs or `PRODUCT.md` facts that got no decision record: the file, the old position, and the new one.

## Out of Scope

What this increment explicitly does not include.

## Further Notes

Additional context that helps execution or review.

</spec-template>
