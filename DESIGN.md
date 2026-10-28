# meta-cto — design notes

## Experience baseline

The UI inherits the flow-next template: a minimal home page, GenUI playground at `/genui`, and developer links at `/dev`. Replace the home experience when the product direction is known.

## Constraints carried from the template

- Operator and protected MCP require `OPERATOR_SECRET` (minimum 16 characters) and fail closed when unset.
- GenUI offline fixtures work without live model credentials; open-ended generation needs gateway or explicit local overrides documented in `.env.example`.
