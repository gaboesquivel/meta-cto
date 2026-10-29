# Signal verdict eval

Eval Set for the Check's Verdicts (spec 001, Testing Decisions → Quality eval).

- `held-out.json`: **Held-Out Set, frozen as of 2026-10-28. Never use it in prompts, few-shot examples or tuning; only for judging.** Changing it resets the kill-criterion reading.
- `dev.json`: Dev Set, for tuning prompts and retrieval. Its drafts never appear in the Held-Out Set.
- Each pair: a Draft, a `target` seed key from `data/crewday/seed.ts`, and the `expected` Verdict for that target.

Run (costs tokens, manual only, not in CI):

```sh
pnpm exec tsx evals/signal-verdict/run.ts            # held-out (default)
pnpm exec tsx evals/signal-verdict/run.ts --set dev
```

It needs the seeded Crewday Demo Workspace and the database and AI keys (`getSignalService()` must return a service). A target not returned among the candidates counts as `absent`. It prints a table and writes `report.md` (held-out) or `report.dev.md` (dev). Kill line: Same-Need Precision below 85% on the Held-Out Set.

Note: every pair runs a real Check, and each Check is recorded as an event in the database, so a run adds about 25 Checks to the workspace's metrics.
