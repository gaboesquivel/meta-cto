---
name: review
description: Review work against intent, specs, and root context on five axes (correctness, readability, architecture, security, performance). Use when the user says "check it against the spec", "does this match the intent", or "alignment review".
disable-model-invocation: false
---

# Review

## Outcome

An independent read of the change against intent, the spec when there is one, and root context. The implementing agent is not this review.

**Proof.** For a spec, a requirements table with a verdict per user story, acceptance criterion, and acceptance scenario step: `satisfied`, `unmet`, or `unresolved`, each with evidence. without evidence it is `unresolved`, never `satisfied`. Every `unmet` requirement is also a blocking finding. Findings are ranked by impact.

Choose how to inspect (one pass or separate reads per axis). Parallel axis workers and a verifier are allowed, not required. Without separate execution, assess the axes in order and label the review **single-agent**. Never claim independence or model diversity without actual separate execution.

## Establish scope

Read repository instructions and inspect Git status. Outside a Git repository, review named files; offer `git init` as `write-agents` [Repository](../write-agents/SKILL.md#repository) describes only when a diff is needed.

Scope may be working tree, committed comparison, pull request, or spec (every task's change together). Unspecced small work uses `build`'s self-check; escalated unspecced work uses this review without requirement verdicts.

Default to the working tree when unspecified. Ask only when scope ambiguity materially changes the work.

**Re-review after fix rounds** covers the commits since the last reviewed SHA and the findings they answer, not the whole change again. Conflict resolutions and updates from the default branch count as fix code. Widen it only when the fix reaches code the earlier review did not cover. A review of a different kind (an escalation after a self-check) covers the whole change. Earlier verdicts the fix did not touch stand. The new head becomes the reviewed head.

## Inspect

Recover intent from the request, spec, tests, and decisions. Assess every axis the change can affect:

- **Correctness:** intent match, regressions, failure paths, test coverage.
- **Readability and simplicity:** names, complexity, dead code.
- **Architecture:** boundaries, duplication, conventions.
- **Security:** trust boundaries, secrets, permissions.
- **Performance:** scaling, repeated I/O, blocking paths.

Workers read the reviewed commit with `git show`, `git diff`, or a detached worktree they create (`git worktree add --detach`) and remove when done. Never `checkout` or `switch` in a checkout they did not create.

For consequential changes, add proportional blast-radius checks when cheap tests or code can prove assumptions.

When scope is a spec, the verifier owns requirement verdicts; axis readers may cite requirements their evidence supports.

## Report

Open spec reviews with the requirements table, then findings. Note stale root docs as findings. Review is read-only unless fixes are requested. When `ship` runs the review, post on the pull request as a comment or COMMENT-type review, never an approval.
