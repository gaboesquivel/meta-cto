# GLOSSARY.md format

Use one `GLOSSARY.md` at the project root unless the repository already documents a different convention.

## Structure

```md
# {Project or domain name}

{One or two sentences on what this vocabulary covers.}

## Language

**Order**:
{A one- or two-sentence definition}
_Avoid_: Purchase, transaction

**Invoice**:
A request for payment sent to a customer after delivery.
_Avoid_: Bill, payment request
```

## Rules

- **Be opinionated.** When several words fit one concept, pick one and list the others under `_Avoid_`.
- **Keep definitions tight.** One or two sentences. Say what the term **is**, not every behavior.
- **Project-specific only.** Skip general programming vocabulary unless this project gives it a special meaning.
- **Use subheadings** when terms fall into clear groups; a flat list is fine for a small glossary.

Create `GLOSSARY.md` lazily when the first term is resolved.
