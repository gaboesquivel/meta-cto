# Decision record format

Use the project's existing decision convention. Flow's default is `docs/decisions/NNNN-slug.md`; create the directory only when a significant choice needs recording. Scan existing numbers before choosing the next one.

Keep enough context to recover the choice and its rationale. A short record may be one paragraph after the metadata; add alternatives and consequences when they matter.

```markdown
---
status: proposed | accepted | superseded | rejected
category: product | design | architecture | infrastructure | process
date: YYYY-MM-DD
---

# Decision title

Context, choice, rationale, and material consequences.
```

Use one actual status and category in a record. Mark proposals as proposed until accepted. For a changed accepted choice, create a new numbered record with a `supersedes` pointer (or `Supersedes` / `Amends` on its Status line); preserve the historical record's body, add only a back-pointer to its status when the change is accepted, and reflect the current position in the owning product, design, or architecture document. Do not silently rewrite intent to match implementation.
