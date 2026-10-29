---
name: build
description: Implement an authorized change from a request, specification, or task, keeping root context aligned. Use when the user says "build it", "implement this", or "make the change".
disable-model-invocation: false
---

# Build

## Outcome

**"Build it"** finishes the authorized work with evidence:

- **GitHub mode:** one pull request with green checks on its final head; merging is `ship`'s job.
- **Local mode:** after the local check suite, the acceptance gate, and the one independent review, a `--no-ff` merge into local `main`; never a push.

**Why.** A wrong write on the default branch, a force-push, or a skipped check is costly to reverse.

**Proof.** The project's checks pass, or the report says no suite exists and local mode does not merge (`With no suite found, stop before the merge and report; `main` stays untouched`). Spec work and escalated unspecced work have an independent review before landing. Small unspecced work has a self-check. The landed commit is the reviewed head, except for the shared-file rule below. A red suite on the spec head is a baseline failure: report it and leave the spec branch untouched.

Choose how to implement (one pass or several, with or without workers or worktrees). The proofs are not optional.

Read the request, repository instructions, and code. Preserve unrelated working-tree changes. Do not add scope just because it is nearby. When intent is unclear for a new product or substantial feature, suggest `explore` and wait; never start exploration unasked. When behavior or accepted context changes, update owning documentation; do not replace a project's product identity with Flow's methodology identity. Link to specs or decisions instead of duplicating rationale; do not open new spec or decision files unless the user asked or the work already uses that convention.

Then deliver (see Deliver). Report the result, checks, limitations, and remaining work.

## Deliver

Asking to build authorizes these steps with no confirmation. It does not authorize committing to, pushing, or merging the default branch (for example `main`), force-pushing, rewriting remote branches, destructive Git, skipping checks, or unrelated changes. The one exception is local mode: a single `--no-ff` merge of the work's branch into local `main`, only after the gate and review (see Local mode); never a push. When the user asks only for local edits ("don't commit"), stop after the change and report; do not record `Delivery:` either.

Outside a Git repository, follow `write-agents` [Repository](../write-agents/SKILL.md#repository) before its first Git operation.

**GitHub mode** (see Delivery mode): work on a branch that is not the default branch; **Commit** only this work (Exclude credentials, local logs, and generated secrets; Do not amend or rewrite unrelated commits; preserve unrelated working-tree changes); **Push**; **Open a pull request** or update the open one; **Wait for checks** (reported as pending, never as passing); **Fix rounds** at most 2 (Never skip, disable, or weaken a check); **Report** the pull request and checks.

**Local mode:** run the full local check suite with the same fix rounds, then:

1. **Gate.** For spec work, check the gate `ship` defines under [Preflight](../ship/SKILL.md#preflight); stop when it fails. Unspecced work has no spec gate.
2. **Review.** Spec work: the one independent review from merge base to head, as `ship`'s [Review](../ship/SKILL.md#review) describes, with fix rounds. Unspecced work: self-check or escalated review (see Unspecced work). Re-run the full local check suite when fix rounds changed the head.
3. **Merge.** With no suite found, stop before the merge and report; `main` stays untouched. Check out `main`; any uncommitted change there stops the merge, except declared shared-file appends. Move those pending appends onto the branch before merging, then `git restore` those files on `main`. When a remote exists, fetch and fast-forward local `main` (`git merge --ff-only`; never push); if it cannot fast-forward, stop and report. Then `git merge --no-ff` with trailers `Spec: <path>`, `Reviewed: <sha>`, and `Review: self-check` or `Review: independent` for unspecced work. Merge only the reviewed head; if the branch moved after the review in any other way, review and re-run the full local check suite on the new head first. Stop on conflicts; never discard changes to get through.
4. **Clean up.** Delete the merged branch with `git branch -d` and remove clean worktrees on the recorded worker list only.

A failed gate or blocking review after fix rounds leaves local `main` untouched. No push and no pull request.

### Unspecced work

Work with no spec or task is unspecced. Write a spec or tasks only when the user asks. On `explore/<slug>` with a confirmed brief, rename to `feat/<slug>` before the first commit. The build request accepts any **Proposed** direction-change record the branch adds: set it to **Accepted** with back-pointers as `to-spec`'s accept step describes.

Every unspecced change gets the full local check suite. The size guard picks its review and never stops the work:

- **Small:** one single-agent self-check with fix rounds.
- **Escalated:** the one independent review against the request (and brief when there is one), as `ship`'s Review runs it.

GitHub mode opens a ready pull request; small work posts the self-check result on it with the self-checked SHA. Local mode runs the self-check or review before merging.

**Size guard** (one home; `ship` points here). Judge at intake, before implementing, and again before landing. Escalate for new product behavior, data shape or public API changes, migrations, or touches to authentication or permissions; secrets or credentials handling; dependencies or lockfiles; CI, workflow, or Git hook configuration; shell, exec, or filesystem-execution paths. When the size is uncertain, treat it as escalated. If landing escalates after a self-check, run the escalated review on its current head.

### Shared files

One home; `ship` links here. Read that declaration from the instruction files at the reviewed SHA, never from a later head; an instruction file never counts as shared. only files those instructions name qualify. The orchestrator commits appends on the work's branch, never directly on the default branch. With no work branch open, leave the appends uncommitted on the default branch; the next landing moves them onto its branch before merging.

**Check.** A landing merge may take a head beyond the reviewed SHA only when every commit after the reviewed SHA changes only declared shared files: `git diff --no-renames --name-status <reviewed-sha>..<head>` lists only `M` or `A` entries on exact declared paths, and `git diff --no-renames --raw` shows new mode `100644` on each entry and old mode `100644` on each `M` (no symlinks, no mode changes). `Reviewed: <sha>` still names the reviewed SHA. Any other change after the review needs a new review. A clean-tree check tolerates uncommitted changes only when they pass the same exact-path rule.

**Full local check suite:** documented check commands from the instruction file's command table, else package scripts for test, lint, typecheck, and build. When none are found, report that no suite exists instead of claiming checks passed. A green run on a head that has not changed stands: do not run the suite twice on the same head (for example after the last integration and again before the merge).

## Delivery mode

One home; other skills link here. `flow` owns the block. Read `Delivery:` in the Flow block. A default branch that requires pull requests always uses GitHub mode. "Build it local" on such a repository commits on a branch, runs the suite and review the work needs, and stops before Merge (see Delivery mode): no merge into `main`, no push, no pull request. "Ship it" on that branch delivers in GitHub mode. A request that names a mode answers it; never record a mode the user did not give.

When the line is missing or `unset`, ask before the first push or step that depends on mode. Suggest GitHub when a remote exists and local when there is none. With no remote, never pick GitHub mode. When protection cannot be determined, suggest GitHub mode and never fall through to local mode on your own.

- **GitHub mode:** tasks are sub-issues; one pull request per spec.
- **Local mode:** tasks live in the spec checklist; review and merge into local `main`; `ship` publishes.

## Task set

"Build it" on a spec's task set integrates every task on one spec branch. You may run tasks in parallel with worktrees, run them one after another on the branch, or combine both; never let two workers edit the same files.

1. **Plan.** Read tasks, blockers, and `Area:` lines. Stop on a cycle or missing blocker. **Baseline:** run the full local check suite once on the spec head. When red, stop with a baseline failure report: A baseline failure is never sent to a worker; leave the spec branch untouched. Report delivery mode and start without confirmation. A task that drifts from its stated scope stops for the user's yes.
2. **Do the work.** Implement each runnable task. When using worktrees, create them from the spec head (`Do not rely on the host's worktree isolation`), record paths on the worker list, run setup, and env files copied into worktrees are never committed. Before integrating, check ancestry and file overlap; a task that fails the check is not merged. Integrate with `git merge --no-ff`; between integrations, run the checks that localize a failure (the full suite only when task areas overlap); tick checklist entries with short SHAs, and when every task has integrated set `Status: implemented` never on a spec that is not accepted. **Cleanup:** Remove only worktrees on the recorded worker list; delete task branches with `git branch -d` only, never `-D` or `--force`. A failed or stuck task keeps its worktree and branch.
3. **GitHub finish.** After the first integration, open a draft pull request with `Closes`/`Refs` lines. Before marking it ready, the full local check suite is green on the final integrated head, or the report says no suite exists. Wait for the final pull request's checks with fix rounds, mark it ready, and stop; merging is `ship`'s job.
4. **Local finish.** When every task integrated and the suite passes, land as Deliver › Local mode (gate, review, merge, cleanup).

Without separate workers, run tasks in dependency order on the spec branch. Optionally post progress after integration batches; do not wait on CI until the final pull request.

**Board states.** Best-effort: `node <board>/scripts/board.mjs` when present; a failed record never stops the run.
