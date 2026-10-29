---
status: proposed
category: product
date: 2026-10-29
---

# Fragmentation as unresolved duplication; duplicates as reversible associations

Status: Proposed. Amends `PRODUCT.md` (main metric, journey 3, MVP slice 1) and `GLOSSARY.md` (Fragmentation Rate, Merge, Split).

**Context.** `PRODUCT.md` defined the main metric, fragmentation rate, as "the share of new Feature Requests later marked as duplicates", and Merge/Split as moving Supports between Feature Requests. While shaping spec 002 the user pointed out that this conflates two things: how often incoming requests are duplicates, and how much unresolved duplication sits in the backlog. Moving evidence between rows also costs more than the demo value it adds.

**Choice.**

- **Fragmentation (main metric)** = open Feature Requests with an unresolved suspected duplicate ÷ open Feature Requests. A suspected duplicate is another open Feature Request the AI judged Same Need that no Product Manager has decided on yet. Lower is better; every Review Decision on a suspected pair resolves it.
- **Duplicate Rate** = new Feature Requests decided Duplicate ÷ new Feature Requests reviewed, always reported with **Review Coverage** = reviewed ÷ incoming.
- **Mark Duplicate** replaces Merge: a reversible association from a Feature Request to a canonical Feature Request. No Support, Comment or Account moves; the canonical Feature Request shows the associated evidence with its provenance. **Undo** replaces Split: it removes the association.
- A Feature Request marked Duplicate is no longer a Check candidate; its page points to the canonical Feature Request.

**Alternatives considered.** Keep "share of new requests later marked duplicate" as the main metric (rejected: it measures incoming duplication, not backlog health, and rewards not reviewing unless paired with coverage); duplicates ÷ all new requests (rejected: improves as review coverage falls); lossless merge that moves Supports with an original-request pointer (rejected: more code and migration risk for the same user-visible provenance).

**Consequences.** `PRODUCT.md` and `GLOSSARY.md` change on acceptance; spec 001's metrics endpoint gains the new metrics in spec 002; suspected-duplicate pairs must be computed and stored (they come from the AI judge, so their quality follows the same-need precision kill line).
