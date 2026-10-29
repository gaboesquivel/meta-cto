---
status: proposed
category: product
date: 2026-10-29
---

# Keep pilot ground truth out of the public repo; production reads it from the database

Status: Proposed (2026-10-29). Amends [spec 003](../specs/003-prove-the-verdict.md) (where the pilot files, Held-Out Set v2 and the v2 run log live, and how the Proof Report reads them). [Decision 0003](0003-proof-before-slice-3.md)'s bars and ground-truth rules are unchanged.

**Context.** Spec 003 keeps the pilot backlog, feedback set, Answer Key, Held-Out Set v2 and the v2 run log as committed files, and production's Proof Report reads them from the deployment bundle. The repository is public. Once filled, any pilot agent or model with web access could read the expected answer for each feedback item and each v2 pair, which breaks "written without sight of the current prompt" and makes Agent Correctness measure lookup, not verdict quality.

**Choice.**

1. **Filled files stay private.** Operators keep the filled pilot files and Held-Out Set v2 pairs in a private folder outside the repository (`SIGNAL_PRIVATE_DATA_DIR`). Commands refuse a folder inside the working tree.
2. **The repository holds only templates and fingerprints.** Empty templates, formats and the freeze locks (fingerprint, time, counts) are committed; content never is.
3. **Production reads the database.** The pilot load writes the feedback set, Answer Key and manifest into the Pilot Workspace, with the fingerprint they were loaded from. The eval runner records each v2 reading (status, prompt version, fingerprint, counts) in the database instead of a committed run log. The Proof Report reads both from the database and compares their fingerprints with the committed locks.
4. **Answers are never served item by item.** No REST or MCP operation returns Answer Key entries, feedback items or v2 pairs; only the Proof Report's aggregates leave the database.

**Alternatives considered.**

- A gitignored folder inside the repo: rejected; Vercel builds from git, so production could not read it, and one `git add -f` publishes it.
- A private repository as a submodule bundled at build: rejected; Vercel needs access to it and every deployment ships the answers inside the bundle.
- Private Vercel Blob: rejected; adds a service, a token and a network read per report for data the database already scopes.
- Keeping files public and running agents without web or repo access: rejected; unenforceable and invisible when broken.

**Consequences.**

- Spec 003's "commit the lock before the run" holds; "commit the run log with the reports" and the files traced into `/api/proof`, `/proof` and the MCP routes no longer do.
- The v1 Held-Out Set (25 pairs) stays public as the first reading; it was published before this decision.
- A database reset loses the loaded pilot ground truth; the private folder plus its committed fingerprint lets an Operator reload it unchanged.
