---
name: domain-modeling
description: Refine project terminology and record resolved meanings in GLOSSARY.md; offer decision records sparingly. Use when the user says "what do we call this", "define this term", or "update the glossary".
disable-model-invocation: false
---

# Domain Modeling

Sharpen the project's shared language while you design. Read `GLOSSARY.md` before inventing terms. This skill is for **changing** the model (terms and consequential decisions), not for routine vocabulary lookup during other work.

Use one project glossary at `GLOSSARY.md`. Record significant choices under `docs/decisions/` when the project has no other convention. Create those files lazily when the first term or decision is ready to write. Do not introduce bounded contexts, context maps, or other domain-driven design structure unless the product already uses them.

## During the session

### Challenge against the glossary

When a term conflicts with `GLOSSARY.md`, say so. Example: "Your glossary defines cancellation as X, but you seem to mean Y. Which is it?"

### Sharpen fuzzy language

When language is vague or overloaded, propose a precise term. Example: "You said account: do you mean Customer or User?"

### Discuss concrete scenarios

Stress-test relationships with specific scenarios, including edge cases that force clear boundaries between concepts.

### Cross-reference with code

When the user states how something works, check the code. Surface contradictions: "The code cancels entire orders, but you described partial cancellation. Which is right?"

### Update GLOSSARY.md inline

When a term is resolved, update `GLOSSARY.md` immediately. Follow [GLOSSARY-FORMAT.md](./GLOSSARY-FORMAT.md). Keep implementation detail out of the glossary; it is vocabulary, not a spec or scratch pad.

### Offer decision records sparingly

Write a decision record only when the choice passes the decision test in `to-spec`; otherwise keep it in its owning context. Write it with status **Proposed**. Existing user authorization applies; a resolved choice does not need duplicate approval to document it.

Use [DECISION-FORMAT.md](./DECISION-FORMAT.md) and the project's conventions when present. Preserve accepted records and supersede explicitly when direction changes.

## Completion

Report the terms added or changed in `GLOSSARY.md`, any decision record written with its path, and terms still unresolved with the open question for each. If nothing was resolved, say so and name the next question.
