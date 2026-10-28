---
name: debug
description: Investigate and fix a reproducible failure using evidence and bounded hypotheses. Use when the user says "debug this", "why is this failing", or "find the root cause".
disable-model-invocation: false
---

# Debug

Establish the observed failure, expected behavior, reproduction, and relevant recent changes. Inspect errors and evidence before changing code. For a simple failure, keep the investigation small; for a multi-component system, trace the boundary where behavior diverges.

Once the failure reproduces, form about three falsifiable hypotheses and test them in parallel, one worker each (fan-out rule: `write-agents` Workers). Each worker runs the smallest useful check and returns its evidence; give a worker its own worktree when its check changes files. If evidence is unavailable, state the uncertainty and collect it rather than presenting a guess as root cause.

Fixes stay sequential: apply one cause at a time so each result is interpretable.

For a meaningful behavior fix, reproduce the failure with an automated test or a documented manual check before applying the correction. Use existing public test interfaces. Fix the cause within the authorized scope and verify both the original failure and relevant surrounding behavior.

If attempts stop producing new evidence, reassess the hypothesis, dependencies, and architecture. Ask the user when the next step requires a consequential new decision, access, or authority; do not impose an arbitrary retry count as proof that architecture is wrong.

## Techniques

Read supporting techniques when relevant:

- [Root-cause tracing](root-cause-tracing.md) for failures far from their source.
- [Defense in depth](defense-in-depth.md) for validation at multiple boundaries.
- [Condition-based waiting](condition-based-waiting.md) for timing-dependent behavior.

## Completion

Report the cause supported by evidence, the fix, the checks run, and remaining uncertainty. If the failure does not reproduce, report it as unreproduced with the attempts, environment, and evidence collected; do not claim a speculative fix resolved it. Environmental or intermittent failures may require bounded recovery and monitoring rather than a fully determined cause. Redact secrets and personal data from diagnostics.
