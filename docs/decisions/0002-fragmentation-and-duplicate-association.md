---
status: accepted
category: product
date: 2026-10-29
accepted: 2026-10-29
---

# Measure prevention with confirmed duplicates; duplicates as reversible associations

Status: Accepted (2026-10-29). Amends `PRODUCT.md` (main metric, journey 3) and `GLOSSARY.md` (Fragmentation Rate, Review Coverage, Merge, Split). The 85% same-need precision kill criterion is unchanged.

**Context.** Signal's goal is to stop fragmentation before a Feature Request is created (`PRODUCT.md`). Its main metric, "the share of new Feature Requests later marked as duplicates", has the right intent but a fragile definition: its denominator includes requests nobody reviewed, and it doesn't separate AI suspicion from human confirmation. A first draft of this decision moved the main metric to unresolved backlog duplication. That measures review workload, not prevention, so it drifted from the product goal.

**Choice.**

1. **Only a Product Manager's Review Decision confirms a duplicate.** An AI Same Need judgment between two existing Feature Requests is a _suspected duplicate_: a prompt for review, never counted as duplication.
2. **Main metric, Intake Duplicate Rate:** among new Feature Requests (created through a Check) that have been reviewed, the share confirmed Duplicate. Lower is better. It is always shown with its counts and with:
   - **Review Coverage:** reviewed new Feature Requests ÷ new Feature Requests. A Feature Request counts as reviewed when a decision covers it as a whole, not when one of several suggestions is decided.
   - **Backlog baseline:** the same rate over pre-Signal Feature Requests (seeded or imported) that were reviewed, so prevention is shown as a comparison, not an absolute.
3. **Supporting signal, Suspected Duplication:** open Feature Requests with an undecided suspected duplicate ÷ open Feature Requests. Labeled AI-suspected and unconfirmed; it measures review workload and falls as a Product Manager decides.
4. **Mark Duplicate replaces Merge:** a reversible association from a Feature Request to a canonical one. No evidence moves; the canonical Feature Request shows its duplicates' evidence with provenance, counting each Account once. **Undo replaces Split:** it ends the association and keeps the decision history.
5. **AI verdicts and human decisions stay distinct:** the AI suggests only Same Need (Related Need precision is weaker: 62.5% on the held-out reading). Related is a human decision that requires a human-stated Shared Dimension. Distinct records that two Feature Requests are different needs.

**Alternatives considered.**

- Backlog duplication as the main metric: rejected; it measures review workload, not prevention.
- Duplicates ÷ all new requests: rejected; it reads better the less anyone reviews.
- Counting AI-suspected pairs as duplication: rejected; it conflates suspicion with confirmation.
- Lossless merge that moves Supports: rejected; more risk for the same visible provenance.

**Consequences.**

- `PRODUCT.md` and `GLOSSARY.md` change on acceptance.
- Spec 001's `fragmentationRate: null` is replaced by these measures.
- Small samples are expected at first, so every rate ships with its counts.
- Suspected duplicates inherit the judge's same-need precision; a wrong suspicion costs one Distinct decision, never evidence.
