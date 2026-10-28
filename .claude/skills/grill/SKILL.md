---
name: grill
description: Stress-test an idea or plan through focused questions and evidence. Use when the user says "grill me", "grill this", or "poke holes in it".
disable-model-invocation: false
---

# Grill

Stress-test the idea or plan. Read the relevant conversation, code, and accepted project decisions before asking questions. Find facts with available tools; ask the user only for consequential choices or missing information you cannot recover.

When intent is already confirmed (for example by `interview` or `explore`), do not re-extract it; challenge only the riskiest claims. Optionally offer a short pre-mortem: assume it failed six months from now and list the most plausible reasons. Skip it when a pre-mortem already ran in this exploration (`explore` runs one) and reuse its failure modes. Use those reasons to name the riskiest assumptions and a kill criterion.

Map the important uncertainty first. Then, as parallel groups (fan-out rule: `write-agents` Workers), launch one read-only evidence worker per risky claim, plus a pre-mortem worker when the pre-mortem is in play; the main thread verifies their findings.

Ask a small round of independent questions in the main thread, each with a recommended answer and its tradeoff. Wait only for answers needed to proceed. Revise downstream questions when answers change their premise.

Stop when the intended outcome, constraints, and next useful action are clear enough for the requested work. Reuse existing authorization; do not require an exhaustive interview or a second approval of settled decisions. Keep unrelated possibilities outside the current scope.

Return one outcome: a resolved direction, **clearer** (intent sharpened, nothing to write beyond a direction-change record `explore` confirmed), or **killed** (the idea does not survive); all are valid. Include remaining assumptions, the kill criterion when named, and a sensible next action, or none when killed (for example `to-spec`, `domain-modeling`, or `to-tasks` when the user wants those). Discussion does not itself authorize implementation.
