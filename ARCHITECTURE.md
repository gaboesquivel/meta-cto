# meta-cto — architecture

## Foundation

Initialized from [`flow-next`](https://github.com/gaboesquivel/flow-next) at commit `a041f135f02b3ed277607eaf21982807e1c6af4a`.

## Runtime surfaces

| Surface          | Path                                | Notes                                 |
| ---------------- | ----------------------------------- | ------------------------------------- |
| Web home         | `/`                                 | Replaceable stub                      |
| GenUI playground | `/genui`                            | OpenUI compose + preview              |
| Public MCP       | `/api/mcp`, `/.well-known/mcp.json` | Streamable HTTP                       |
| Operator         | `/operator`, `/api/mcp/operator`    | Protected; fail closed without secret |

Cross-template interoperability details live in `docs/INTEROP.md` from the template (upstream template names may appear there by design).

## Local development

- `pnpm setup` — dependencies and template technical skills
- `pnpm dev` — Portless at `meta-cto.localhost`
