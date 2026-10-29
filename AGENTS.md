# Project Rules

## Prompt Logging

When a user request's work is done, append one entry to `prompts.txt`: ISO 8601 timestamp, the prompt, a one-line summary of the result, skills used, docs changed or created, and any question the user answered with that answer.

`prompts.txt` is a shared file for Flow's `build` and `ship`. Commit its entry on the branch of the work it describes, in that work's commit or the next one. Never make a commit that changes only `prompts.txt`; with no work branch open, leave the entry uncommitted. Worker agents never write it.

## Checks

Run the narrowest check that proves the change while implementing; run the full suite once per head before review and landing.

| Check         | Command                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| One test file | `pnpm exec vitest run <path>` (after one `pnpm test` or `pnpm build:mcp-app`)    |
| Types         | `pnpm check-types`                                                               |
| Full suite    | `pnpm security:check && pnpm qa && pnpm eval:offline && pnpm build` (same as CI) |

CI runs on pushes to `main` and pull requests. Dispatch it (`gh workflow run CI --ref <branch>`) only when a head has no CI run.

<!-- BEGIN FLOW -->

## Flow

This project uses Flow skills. Say a phrase to load its skill; the installed `flow` skill describes this block. Delete the block to opt out.

Delivery: github

| Say                                                  | Skill       |
| ---------------------------------------------------- | ----------- |
| "explore this"                                       | `explore`   |
| "interview me"                                       | `interview` |
| "grill this"                                         | `grill`     |
| "spec it"                                            | `to-spec`   |
| "share the draft"                                    | `to-spec`   |
| "break it down"                                      | `to-tasks`  |
| "build it"                                           | `build`     |
| "check it against the spec"                          | `review`    |
| "ship it" (add "local" or "with GitHub" for one run) | `ship`      |
| "update the docs"                                    | `flow`      |

<!-- END FLOW -->

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
