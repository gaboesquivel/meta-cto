# Signal verdict eval

Eval Set for the Check's Verdicts (spec 001, Testing Decisions → Quality eval; spec 003, Held-Out Set v2).

- `held-out.json`: **Held-Out Set (v1), frozen as of 2026-10-28. Never use it in prompts, few-shot examples or tuning; only for judging.** Changing it resets the kill-criterion reading. It stays the first reading and runs exactly as before.
- `held-out-v2.json`: **Held-Out Set v2** (decision 0003). Ships empty. People write and confirm its pairs without sight of the judge prompt; never use it for tuning.
- `held-out-v2.lock.json`: the freeze record (fingerprint, time, counts). Absent until the set is frozen; commit it once written.
- `dev.json`: Dev Set, for tuning prompts and retrieval. Its drafts never appear in either Held-Out Set.
- `runs.jsonl`: append-only run log, one JSON line per run (including refusals and failures). Commit it with the reports.
- Each pair: a Draft, a `target` seed key from `data/crewday/seed.ts`, the `expected` Verdict for that target, and a `note` on why.

## Held-Out Set v2 format

Same pair shape as v1, plus a person's confirmation on every pair:

```json
[
  {
    "id": "v2-001",
    "draft": { "title": "…", "description": "…" },
    "target": "swap-sync",
    "expected": "same_need",
    "note": "Why this label.",
    "confirmedBy": "Name of the person who confirmed the label",
    "confirmedAt": "2026-11-02T15:04:00Z"
  }
]
```

- `confirmedBy` (non-empty) and `confirmedAt` (ISO date or date-time) are both required for a pair to count as confirmed.
- At least 60 `same_need` pairs, spread across targets; below 60 every reading is inconclusive.
- Write drafts without looking at `lib/signal/agent/prompt.ts`; never reuse a Dev Set draft.

## Freeze (once)

```sh
pnpm exec tsx evals/signal-verdict/freeze.ts
```

It refuses an empty set, duplicate ids, unknown targets, Dev Set drafts, unconfirmed pairs, and a set that is already frozen. It writes `held-out-v2.lock.json` with a SHA-256 fingerprint of the pairs (sorted by id, keys sorted, so formatting does not matter). Any later change to a pair, label or confirmation no longer matches the fingerprint: the runner refuses with "changed after freeze: reading reset". To start over, delete the lock deliberately and freeze the new set; earlier readings do not carry over.

## Run (costs tokens, manual only, not in CI)

```sh
pnpm exec tsx evals/signal-verdict/run.ts                    # v1 held-out (default)
pnpm exec tsx evals/signal-verdict/run.ts --set dev
pnpm exec tsx evals/signal-verdict/run.ts --set held-out-v2  # needs a confirmed, frozen v2
```

Add `--local` to run against an in-memory database seeded with the Crewday Demo Workspace instead of the shared one. Otherwise it needs the seeded Crewday Demo Workspace and the database and AI keys (`getSignalService("eval")` must return a service). Eval Checks record Origin `eval`, so they never count in demo or pilot metrics. A target not returned among the candidates counts as `absent`.

- v1 and dev print a table and write `report.md` (held-out) or `report.dev.md` (dev), as before.
- v2 refuses (and logs the refusal) unless every pair is confirmed, the set is frozen, and it matches the frozen fingerprint. It writes `report.v2.md` with same-need and related-need precision, each with a 95% Wilson interval, its counts and a verdict against the bar, plus the same-need positives check.
- **One reading per prompt version.** Each run logs its prompt version: `pv-` plus a hash of the judge system prompt, user prompt template, output schema and model id (read from `lib/signal/agent`). A second v2 run on the same set and prompt version (after a completed run, or a failed run that judged pairs) is flagged "repeat run, not a new reading" and writes `report.v2.repeat.md`, leaving `report.v2.md` alone.
- A Check that throws or comes back degraded is a failure: it scores as `unknown`, is listed in the report and log, marks the run `failed`, and makes its verdicts inconclusive.
- A run that fails before any pair reaches the Check (service unavailable, a target that does not resolve) is logged `failed` with nothing completed. It is never a reading and never makes the next run a repeat.

## Bars and verdicts (`readings.ts`)

Same-need precision ≥ 85% (kill line) and related-need precision ≥ 75% (three-way verdict) on v2. A verdict is `pass` when the whole 95% interval is at or above the bar, `fail` when it is wholly below, and `inconclusive` when it straddles the bar, there are no predictions, there are fewer than 60 same-need positives, or a pair failed.

Exports for the Proof Report: `wilsonInterval`, `precisionReading`, `verdictFor`, `v2Readings`, the bars (`SAME_NEED_BAR`, `RELATED_NEED_BAR`, `MIN_SAME_NEED_POSITIVES`) from `readings.ts`; `readRunLog`, `currentV2Reading` from `run-log.ts`; `readV2Lock`, `checkV2Ready` from `held-out-v2.ts`.

Note: every pair runs a real Check, and each Check is recorded as an event in the database, so a run adds one Check per pair to the workspace (Origin `eval`).
