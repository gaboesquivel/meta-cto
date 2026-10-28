# Agent skills (template bundle)

This template ships a curated [Agent Skills](https://agentskills.io) lockfile for the stack in [flow-skills spec 005](https://github.com/gaboesquivel/flow-skills/blob/main/docs/specs/005-flow-templates-interop.md): Next.js, React, Eve, AI SDK / Gateway, OpenUI GenUI, MCP, shadcn, Vitest, Playwright, Portless, and related technical expertise.

This is **not** the [Flow Skills](https://github.com/gaboesquivel/flow-skills) methodology catalog. Install delivery workflow skills separately with `npx skills add gaboesquivel/flow-skills` when you want Flow's methodology.

## Layout

| Path                             | Purpose                                          |
| -------------------------------- | ------------------------------------------------ |
| `.agents/skills-lock.json`       | Pinned upstream skills and hashes                |
| `.agents/skills/<name>/`         | Symlinks for agents (after install)              |
| `.agents/.agents/skills/<name>/` | Vendored skill trees (committed in the template) |

## Commands

```bash
pnpm skills:install   # refresh from lock (also runs in pnpm setup)
pnpm skills:update    # bump lock from upstream (maintainers)
```

Set `FLOW_SETUP_SKIP_SKILLS=1` to skip skill install during `pnpm setup`.

After install, invoke skills explicitly in your agent host (for example open `.agents/skills/eve/SKILL.md`).

## Curated skills (23)

**Runtime and UI:** `ai-sdk`, `eve`, `typesafe-ai`, `nextjs`, `next-dev-loop`, `shadcn`, `building-components`, `nuqs`, `portless`, `vercel-cli`, `vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`

**MCP and testing:** `mcp-builder`, `agent-browser`, `vitest`, `playwright`

**Engineering expertise:** `diagnosing-bugs`, `domain-modeling`, `prototype`, `research`, `tdd`, `test-driven-development`
