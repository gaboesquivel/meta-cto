# flow-next ↔ flow-mono interoperability

**Canonical migration target:** [flow-skills spec 005](https://github.com/gaboesquivel/flow-skills/blob/main/docs/specs/005-flow-templates-interop.md). [Spec 003](https://github.com/gaboesquivel/flow-skills/blob/main/docs/specs/003-flow-templates-baseline-v2.md) is historical baseline evidence only.

The sections below describe **implemented behavior on `main`** shared with flow-mono unless noted. They do **not** claim full spec 005 compliance or spec 005 release gates (REL).

## Public routes

| Route    | Role                                                                                     |
| -------- | ---------------------------------------------------------------------------------------- |
| `/`      | Replaceable product homepage (minimal stub; adopters replace with their product landing) |
| `/genui` | Public GenUI playground (OpenUI compose + public MCP catalog demos)                      |
| `/dev`   | Developer links                                                                          |

Assistant chat and MCP surfaces are listed under MCP and HTTP chat below.

## MCP

| Surface              | HTTP path           | Auth                                                                   |
| -------------------- | ------------------- | ---------------------------------------------------------------------- |
| Assistant (public)   | `/api/mcp`          | None                                                                   |
| Public alias         | `/mcp`              | None (same handler as `/api/mcp`)                                      |
| Operator (protected) | `/api/mcp/operator` | Bearer `OPERATOR_SECRET`, `X-Operator-Secret`, or operator web session |

MCP **server names** are template-specific (`flow-next` / `flow-mono` and `*-operator`); **tool names** below are shared.

**Protocol note:** Contract tests negotiate MCP `2025-03-26`. Spec 005 target `2026-07-28` and MCP Apps release evidence are **not** claimed here.

## Public MCP tool names

- `health`
- `list_component_catalog`
- `compose_ui`

## Operator-only MCP tool names

- `operator_health`
- `config_status`
- `public_tool_catalog`

Public discovery (OpenAPI, `.well-known`, server card) must list **public** tools only.

## Operator authentication (implemented)

Operator web (`/operator`), `/api/operator/chat`, and `/api/mcp/operator` use a shared **static secret** model:

- `OPERATOR_SECRET` (minimum 16 characters) enables protected surfaces.
- flow-next also accepts deprecated `OPERATOR_ACCESS_TOKEN` as an alias for `OPERATOR_SECRET`.
- Web console may use an HMAC session cookie after successful secret verification.
- **Fail closed** when `OPERATOR_SECRET` is unset or too short.

**Not implemented:** Operator OAuth/OIDC for web or MCP (spec 005 PROTO-3 / REL-3). Do not describe `OPERATOR_SECRET` as OIDC.

## Chat and inference

| Variable                      | Purpose                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `AI_GATEWAY_API_KEY`          | Preferred live inference via Vercel AI Gateway (Assistant, Operator HTTP chat, GenUI compose when configured) |
| `FLOW_ALLOW_DIRECT_ANTHROPIC` | Set to `1` to allow direct Anthropic when Gateway is unset (local override only)                              |
| `ANTHROPIC_API_KEY`           | Direct provider key; only used when `FLOW_ALLOW_DIRECT_ANTHROPIC=1`                                           |
| `CHAT_MODEL`                  | Optional model override (Gateway model id)                                                                    |
| `EVE_AGENT_MODEL`             | Eve default model override                                                                                    |
| `TYPESAFE_API_KEY`            | Optional compose routing                                                                                      |
| `GENUI_MODEL`                 | Optional compose model override                                                                               |

Without Gateway credentials and without the explicit direct-Anthropic override, HTTP chat returns a clear unavailable resolution. GenUI offline demos and fixtures work without credentials.

## Environment variables (summary)

| Variable             | Purpose                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `OPERATOR_SECRET`    | Enables Operator MCP and web console when ≥16 chars; fail-closed if unset |
| `AI_GATEWAY_API_KEY` | GenUI compose and HTTP chat via Vercel AI Gateway                         |
| `ANTHROPIC_API_KEY`  | Optional direct chat only with `FLOW_ALLOW_DIRECT_ANTHROPIC=1`            |

## Template differences

| Capability | flow-next          | flow-mono            |
| ---------- | ------------------ | -------------------- |
| Layout     | Single Next.js app | Turborepo `apps/web` |

Repositories are **independent** deployments; no runtime dependency between them.

## Demo behavior

- GenUI compose uses synthetic fixtures (no database).
- The public GenUI playground is at `/genui`.
- Operator diagnostics use `OPERATOR_SECRET` on both templates.

## Spec 005 gaps (outstanding, non-exhaustive)

- Operator OAuth/OIDC (REL-3)
- MCP `2026-07-28` and embedded MCP Apps release evidence (PROTO-1, REL-4–REL-6)
- Full REL release gate evidence on production
- Studio-first public UX per PRD-2 (dogfood uses `/` + `/genui`; see [flow-skills decision 0011](https://github.com/gaboesquivel/flow-skills/blob/main/docs/decisions/0011-homepage-and-genui-playground.md))
