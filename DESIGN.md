# Signal — design notes

## Experience principle

The pre-create verdict is the hero moment. Before anything is filed, the person (or agent) sees the Draft's Underlying Need and each similar Feature Request labeled Same Need, Related Need or Different, with a Reason. Same Need is styled as the strongest signal and leads to Support or Comment; creating anyway asks for a Skip Reason.

## Internal UI (spec 001)

- `/`: one paragraph on the differentiator (a verdict before every create) and links into the flow.
- `/requests/new`: Draft → Check → Underlying Need and Verdict cards → Support, Comment or Create.
- `/requests`: semantic search and a list with Support and Account counts.
- `/requests/[id]`: Underlying Need, Supports grouped by Account with Account Context and quotes, Related Links with Shared Dimension and Reason, Comments, and Support and Comment forms.

UI copy uses the [glossary](GLOSSARY.md) terms. Pages work at phone width. There is no sign-in: the MVP is an internal tool on the Crewday Demo Workspace.

## Constraints carried from the template

- Operator and protected MCP require `OPERATOR_SECRET` (minimum 16 characters) and fail closed when unset.
- GenUI offline fixtures work without live model credentials; open-ended generation needs gateway or explicit local overrides documented in `.env.example`.
