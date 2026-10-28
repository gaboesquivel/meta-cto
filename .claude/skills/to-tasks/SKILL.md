---
name: to-tasks
description: Break a plan, spec, or conversation into verifiable vertical-slice tasks with explicit blockers; list them in the spec's Tasks checklist and, in GitHub mode, open them as sub-issues of the spec issue. Use when the user says "break it down", "make tasks", or "split this into tasks".
disable-model-invocation: false
---

# To Tasks

Break a plan, spec, or conversation into **tasks**: independently verifiable vertical slices, each naming the tasks that **block** it.

Discover how the project already tracks work. A tracker, label vocabulary, or setup skill is not required. Keep a straightforward change as one task; split only when that helps execution or continuity.

## Process

### 1. Gather context

Work from the conversation. If the user passes a spec path, issue number, or URL, read the full body and comments.

### 2. Explore the codebase (optional)

When you have not already explored the codebase, do so to see the current state: one read-only explorer per area the work touches, launched together (fan-out rule: `write-agents` Workers). Task titles and descriptions should use the project glossary and respect decision records in the area you touch.

Look for prefactors that make the implementation easier: make the change easy, then make the easy change.

### 3. Draft vertical slices

Break the work into vertical-slice tasks.

<vertical-slice-rules>

- Each slice delivers narrow, verifiable behavior across the layers the product needs. Include schema, API, UI, or tests only where the task requires them.
- A completed slice is demoable or verifiable on its own.
- Each slice fits a single fresh context window.
- Do prefactoring first when it is part of the plan.

</vertical-slice-rules>

Give each task an **area**: every package or directory it changes, comma-separated (for example `lib/feedback/connect, app/opportunities`), coarse and never file paths. A vertical slice names every directory it touches, including pages or routes outside its main package, so disjoint areas mean disjoint changes. Overlapping areas need no blocking edge; `build` schedules by area.

Give each task its **blocking edges**: other tasks that must finish before it can start. An edge needs a real data or file dependency: one task uses what the other builds, or both must change the same file in order. Topic order is not a reason; prefer a wide frontier, where tasks that share only the spec have no blockers. A task with no blockers can start immediately.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **affected scope** spans the codebase, so one edit breaks many call sites and no vertical slice can land green. Sequence it as **expand–contract**. Expand: add the new form beside the old so nothing breaks. Migrate call sites in batches sized by impact (per package or directory), each batch its own task blocked by the expand, keeping CI green because the old form still exists. Contract: remove the old form once no caller remains, in a task blocked by every migrate batch. When batches cannot stay green alone, they may share an integration branch and a final integrate-and-verify task; green is promised only there.

### 4. Check the breakdown

Show the proposed tasks, what each delivers, their areas, real dependencies, and where they will be recorded. Resolve only consequential scope or sequencing uncertainty. "Break it down" authorizes recording them; opening the sub-issues needs no separate yes.

### 5. Record

Outside a Git repository, follow `write-agents` [Repository](../write-agents/SKILL.md#repository) before recording. Choose by the delivery mode: the `Delivery:` line in the project's Flow block. When it is unset or there is no block, ask before recording anything, as `build`'s Delivery mode section describes; a request that names a mode answers it.

- **GitHub mode:** a spec with no `Issue:` line is not accepted yet: suggest "accept the spec" (or "share the draft" for early comments) and stop, recording nothing. Otherwise open each task as a sub-issue of the spec issue (the spec's `Issue:` line names it) using the issue template below. Open them in parallel, since none needs another's number, then add each task's blocking links once every number exists, for example `gh issue create --parent <spec#>` followed by native blocked-by links. Without sub-issue or dependency support, start the body with plain `Part of #N` and `Blocked by #a, #b` lines. Use another tracker only when the project already uses one. On a public repository, the report says the issues are public. Without GitHub access, record the checklist without issue numbers and say so. If publishing stops partway, report which issues were created and which were not; on a retry, match existing sub-issues by title and open only the missing ones, never re-creating a task.
- **Local mode:** no issues. Below the checklist, detail each task with the local task template.

In both modes, write the spec's Tasks section as a checklist, one line per task: `- [ ] NN: Title (#N)`, without the issue number in local mode. Without a spec, write one with `to-spec` first, or return the tasks as a local draft and say so. In GitHub mode, then re-sync the spec issue body as `to-spec` describes. Do not introduce a `.scratch/` task system or new labels.

Tasks are not pull requests; `build` owns how tasks group into pull requests.

Tasks that are **ready** have their blockers complete. In a purely linear chain, that means top to bottom.

Do not close any parent issue; change the spec issue only through that sync.

### 6. Hand off

End by naming where the tasks live and the ready set, then wait for "build it". Do not start implementation.

<local-task-template>

### <NN>: <Task title>

**What to build:** the end-to-end behaviour this task makes work, from the user's perspective, not a layer-by-layer implementation list.

**Area:** every package or directory this task changes, comma-separated, never file paths.

**Blocked by:** the numbers or titles of tasks that gate this one, or "None (can start immediately)".

**Status:** planned (`build` sets `done` as the task integrates)

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2

</local-task-template>

<issue-template>

## Spec

A link to the spec this task belongs to, so `ship` can resolve it (omit only when the task belongs to no spec).

## What to build

Area: every package or directory this task changes, comma-separated, never file paths.

The end-to-end behaviour this task makes work, from the user's perspective, not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

</issue-template>

Avoid specific file paths or code snippets in task text; they go stale quickly. Exception: a prototype snippet that encodes a decision more precisely than prose (state machine, reducer, schema, type shape). Inline it, note that it came from a prototype, and keep only the decision-rich parts.
