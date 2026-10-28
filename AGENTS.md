# Project Rules

## Prompt Logging

Every time you receive a new instruction or prompt, append it to prompts.txt in the project root with a timestamp (ISO 8601) and a brief summary of what you did in response. The summary must list which skills were used (if any) and which docs files were changed or created (if any). Also log every question asked during a session — questions you ask the user (e.g. clarifying questions) and questions the user asks you — together with the answer given. Create the file if it doesn't exist. Keep this log updated throughout all sessions.

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
