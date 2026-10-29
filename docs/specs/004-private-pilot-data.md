# 004 — Keep pilot ground truth private

Status: implemented (2026-10-29) · Issue: [#32](https://github.com/gaboesquivel/meta-cto/issues/32)
Slice: hardening of the proof slice ([spec 003](003-prove-the-verdict.md)) before any pilot data is written
Decisions: [0004 Keep pilot ground truth out of the public repo](../decisions/0004-private-pilot-data-in-the-database.md) (Accepted), [0003](../decisions/0003-proof-before-slice-3.md) (Accepted)

## Problem Statement

Spec 003's proof depends on ground truth that agents and the judge must not see: the Answer Key, the feedback set the agents file, and the Held-Out Set v2 pairs. Today those are committed files in a public repository, and production's Proof Report reads them, and the v2 run log, from the deployment bundle. As soon as someone fills them in, any pilot agent or model that can browse GitHub could look up the expected answer. Agent Correctness would measure lookup, and v2 would no longer be "written without sight". Nothing is filled yet, so this is the moment to fix it.

## Solution

1. **A private folder outside the repository** holds the filled pilot files and the v2 pairs. Its location comes from `SIGNAL_PRIVATE_DATA_DIR`; the pilot and eval commands refuse a folder inside the working tree, and say why.
2. **The repository keeps only what is safe to publish:** empty templates, formats, and the freeze locks (fingerprint, time, counts). Freezing writes the lock into the repository and leaves content where it is.
3. **The database is how production sees the results.** Loading the pilot writes the feedback set, the Answer Key and the manifest into the Pilot Workspace with the fingerprint they came from. Each v2 eval run records its reading (status, prompt version, fingerprint, counts) in the database instead of a committed run log.
4. **The Proof Report reads only the database and the committed locks.** A fingerprint that differs from its lock reads "changed after freeze: reading reset", as in spec 003. Nothing is read from files at runtime and no pilot data is traced into the deployment.
5. **No answer leaves the database item by item.** REST and MCP never return Answer Key entries, feedback items or v2 pairs; only the Proof Report's aggregates do.

## User Stories

1. As the person writing the Answer Key, I want it kept out of the public repository, so that no pilot agent can look up the expected answer.
2. As the founder, I want the production Proof Report to show the pilot and v2 results, so that the slice-3 decision rests on the shared, deployed report.
3. As an Operator, I want the load and eval commands to refuse a private folder inside the repository, so that I can't publish the answers by accident.
4. As a reviewer, I want each loaded data set and v2 reading tied to the committed fingerprint, so that a change after freeze is still visible.
5. Failure: an empty or missing private folder makes the Proof Report read Inconclusive with "pilot data not loaded" or "no v2 reading", never an error page.
6. Failure: an agent asking the API or MCP for Answer Key entries, feedback items or v2 pairs gets nothing beyond what it already sees today.

## Implementation Decisions

- **Contracts first.** The pilot loader gains a step that stores, per Pilot Workspace, the feedback set (id, text, account context), the Answer Key need clusters (backlog and feedback, with confirmations) and the manifest, plus the fingerprint; replacing them requires the fingerprint to change and is recorded as a reset. The eval runner stores each v2 run as a record with set name, fingerprint, prompt version, status, judged pairs and counts, Origin `eval`; v1 keeps writing its public report as today.
- **Proof Report sources** read those records and the committed locks only. Spec 003's file readers stay for the CLI (check, freeze, load, eval run) against the private folder.
- **Private folder rules.** `SIGNAL_PRIVATE_DATA_DIR` must resolve outside the git working tree (checked with git's top level); missing or inside → refusal with the reason. Templates in the repository stay empty; a test fails if a committed template has content.
- **Migration.** One additive migration for the stored pilot data and v2 readings; no change to existing rows.
- **Exposure:** no new routes. The stored data is reachable only through the existing Proof Report (Pilot Key or Operator access, fail closed). The commands run only from an Operator's machine; `load` keeps refusing on Vercel.
- **Remove** the data files from the deployment's file tracing and the "commit `runs.jsonl`" instruction.

## Testing Decisions

Test-first with PGlite and mocks, as in spec 003: loading stores the data with its fingerprint and refuses a folder inside the repository; a reload with changed content records a reset; v2 runs are stored and the latest judged run for the current prompt version is the reading; the Proof Report builds the same verdicts from database records as spec 003's tests do from files; no REST or MCP operation returns Answer Key entries, feedback items or v2 pairs (a contract test over the operation list); committed templates are empty.

**Acceptance scenario (Operator, branch preview with its own database branch).**

1. Starting state: spec 003 live; empty templates in the repository; a private folder outside it holding a small person-confirmed pilot set and a small frozen v2 set (test-sized, not the real pilot).
2. `freeze` writes locks into the repository; `git status` shows only lock files, no content.
3. `load` with `SIGNAL_PRIVATE_DATA_DIR` pointing inside the repository is refused with the reason; pointing outside, it loads the Pilot Workspace and stores the feedback set and Answer Key with the lock's fingerprint.
4. A v2 eval run against the preview's database stores its reading.
5. The preview's Proof Report shows readiness as frozen and loaded, the v2 reading with its prompt version, and bars computed from the stored data; the deployment bundle contains no pilot or v2 content.
6. Editing one Answer Key entry and reloading shows "changed after freeze: reading reset".

**Acceptance scenario (agent, MCP):** with the Pilot Key, an agent can check, support and read the Proof Report, and no tool returns Answer Key entries, feedback items or v2 pairs.

## Direction changes

- [Spec 003](003-prove-the-verdict.md) (implemented): the pilot files, Held-Out Set v2 and the v2 run log are no longer committed or read from the deployment; production reads them from the database (decision 0004). Freeze locks are still committed.
- `ARCHITECTURE.md` and the `data/pilot` and `evals/signal-verdict` READMEs change to match when this spec is built.

## Out of Scope

Encrypting data at rest beyond what Neon provides, sharing the private folder between people (each Operator keeps their own copy; the fingerprint proves it's the same), moving Held-Out Set v1, and running the pilot itself.

## Further Notes

The v1 Held-Out Set stays public: it was published before this decision and remains the first reading.

## Verification (2026-10-29)

- Step 3 refusals, live CLI (`pnpm signal:pilot:check`): unset → "SIGNAL_PRIVATE_DATA_DIR is not set"; inside the repo → "inside the git working tree … Move the folder outside the repository"; outside but empty → names the missing files and says to copy the templates there. Pass.
- Step 5 bundle: `pnpm build` traces no `data/pilot` content, `held-out-v2.json` or `runs.jsonl` into any route; only the two lock files are allowed. Pass.
- Steps 2–6 data paths (freeze writes only locks; load stores ground truth with the lock fingerprint; v2 run stored; Proof Report from stored data; edit → "changed after freeze: reading reset"): covered by PGlite tests (`lib/signal/repository-pilot-data`, `lib/pilot-load`, `evals/signal-verdict`, `lib/signal/proof`). Not exercised against a preview database: that needs the preview's `DATABASE_URL` and `SIGNAL_PILOT_KEY` set on the deployment.
- Agent scenario: `tests/signal-contract/ground-truth-exposure.test.ts` walks every OpenAPI operation and public and Operator MCP tool; no payload carries ground truth. Pass.
- Suite: 72 files / 898 tests, `pnpm build` green.

## Tasks

- [x] 01: Private data folder outside the repository (#33) — [e365f96](https://github.com/gaboesquivel/meta-cto/commit/e365f9690c78be038a88724531f085bbe08aaf73)
- [x] 02: Store pilot ground truth and v2 readings in the database (#34) — [f546b95](https://github.com/gaboesquivel/meta-cto/commit/f546b95193022bafaccfdbf55563a5fd994a13e5)
- [x] 03: Proof Report reads the database (#35) — [5904939](https://github.com/gaboesquivel/meta-cto/commit/5904939595f17792ce6ec36584e19068867e01df)
- [x] 04: Verify on a preview and align docs (#36) — [d0f114a](https://github.com/gaboesquivel/meta-cto/commit/d0f114a08612f908d6d751eebd5e423253b23499)
