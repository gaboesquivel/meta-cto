---
name: review
description: Review work against intent, specs, and root context on five axes (correctness, readability, architecture, security, performance). Use when the user says "check it against the spec", "does this match the intent", or "alignment review".
disable-model-invocation: false
---

# Review

## Establish scope

Read repository instructions and inspect Git status before choosing the review surface. Outside a Git repository, review the named files as a repository audit; offer `git init` as `write-agents` [Repository](../write-agents/SKILL.md#repository) describes only when the request needs a diff.

- **Repository audit:** inspect current relevant source, supporting files, tests, and owning documents, including untracked files. No baseline commit is required.
- **Working tree:** inspect staged and unstaged diffs plus relevant untracked files. Use `git diff --cached`, `git diff`, and `git ls-files --others --exclude-standard`; read untracked content explicitly.
- **Committed comparison:** resolve the requested reference and use its merge-base with HEAD when appropriate. State the actual comparison. Include working-tree changes only when requested or relevant to the stated scope.
- **Pull request:** treat the PR as a committed comparison from `merge-base(base, head)` through `head`. Product, design, spec, and marketing edits get the same bar as code. Repositories that enforce the **pr-review-contract** (documented in the project's docs tree) in CI expect the same checks without a separate manual invocation.
- **Spec:** a spec gets one independent review, which `ship` runs on its final pull request (GitHub mode) or `build` runs on the spec branch before merging into local `main` (local mode), covering every task's change together: the per-axis workers and verifier below. `build` workers only self-check against their task; there are no per-task or per-wave reviews. Unspecced work gets `build`'s self-check when small (decision 0034), or this review against the request, with no requirement verdicts, when `build`'s size guard escalates it (decision 0039).

Default an unspecified review to the current working tree. If it has no changes, inspect the repository area implied by the request and state that scope. Ask only when scope ambiguity materially changes the work. An empty committed diff does not establish that there is nothing to review.

## Inspect

Recover intended behavior from the request, specifications, tests, and accepted product/architecture decisions. Retrieve tracker context only when useful and accessible; report unavailable intent rather than requiring setup.

Then assess the change on five **review axes** (adapted from Addy Osmani's code-review-and-quality): one read-only worker per axis the change can affect, launched in one batch, each given the scope, the intent, and its axis (fan-out rule: `write-agents` Workers). An axis the change cannot affect gets no worker and no comment.

- **Correctness:** intent and spec match, missing requirements, regressions, broken references, failure paths, unsafe side effects, preservation of existing work, and useful test coverage.
- **Readability and simplicity:** misleading names, needless complexity, dead code, and text a maintainer would misread.
- **Architecture:** documented conventions, boundaries, duplication, unnecessary abstraction, and one responsibility scattered across unrelated modules. Treat design smells as hypotheses, not automatic violations.
- **Security:** trust boundaries, input handling, secrets, permissions, and authorization.
- **Performance:** work that grows with input, repeated I/O, and blocking paths users or CI wait on.

Workers read the reviewed commit with `git show <sha>:<path>`, `git diff`, and `git log`, or in a detached worktree they create at that SHA outside the primary checkout (`git worktree add --detach <path> <sha>`) and remove when done. Never `checkout` or `switch` in a checkout they did not create; the user's and the orchestrator's checkouts keep their branch and files.

Each worker follows important paths through callers and dependencies. A passing test is evidence only for behavior it actually covers. Distinguish **confirmed findings**, **plausible risks**, and **preferences**.

For **consequential** changes (behavior many callers rely on, migrations, concurrency, security boundaries, or data-shape changes), add proportional blast-radius checks: state the observable behavior that must stay true, identify callers and indirect dependents beyond the diff, name the **safety-critical assumption** that makes the change safe, and prove that assumption with code or an executable test when cheap. A convincing explanation is not proof. Qualify unverified assumptions explicitly. Minor documentation or copy edits do not require this depth.

One verifier then merges the results: it dedupes findings across axes, checks each against the code, settles disagreements, and ranks by impact. Record actual models when the host exposes them. Without workers, assess the axes in order and label the review **single-agent**. Never claim independence or model diversity without actual separate execution.

**Requirement verdicts.** When the scope is a spec, the verifier lists each of its user stories, acceptance criteria, and acceptance scenario steps and gives each a **requirement verdict**: `satisfied`, `unmet`, or `unresolved`. Axis workers cite the requirements their evidence bears on; the verifier owns the verdict. A verdict cites its evidence (test, file and line, command output, or screenshot); without evidence it is `unresolved`, never `satisfied`. An `unresolved` verdict names what would settle it; scenario steps the review cannot exercise stay `unresolved`. Every `unmet` requirement is also a blocking finding.

## Report

For a spec review, open with a requirements table (requirement, verdict, evidence). Then list actionable findings ordered by impact. For each, name its axis and cite the file or line, concrete failure or mismatch, supporting evidence, and smallest viable correction. Separate open questions and verification limits. If no material findings remain, say what was checked.

When the reviewed change affects product intent, experience, architecture, or shared vocabulary, note whether root context (`PRODUCT.md`, `DESIGN.md`, `GLOSSARY.md`, `ARCHITECTURE.md`) still matches or needs alignment. Flag stale root docs as findings. Flag a change that replaces a project's product identity with Flow's methodology identity. Do not silently rewrite docs unless fixes are requested. The `flow` skill (when installed or surfaced by the host) owns detailed alignment passes. Absence of an always-on hook is not evidence the docs are current.

Review is read-only unless fixes are requested. A review request does not authorize publishing comments, changing source, committing, or modifying tracker state. When `ship` runs the review, its request authorizes the per-axis workers, the verifier, and posting the report on the pull request as a comment or COMMENT-type review, never an approval; when local-mode `build` runs it, its request authorizes the workers and the verifier, and the report goes in the conversation.
