---
name: handoff
description: Compact the current conversation into a handoff document so a fresh agent can continue the work. Use when the user says "hand off", "write a handoff", or "start fresh".
disable-model-invocation: false
---

# Handoff

Compact the current conversation into a handoff document a fresh agent can continue from. When the user describes what the next session is for, tailor the document to that focus.

Save the document in the operating system's temporary directory (`$TMPDIR`, otherwise `/tmp`; `%TEMP%` on Windows). Do not write it into the workspace.

Include:

- The goal, what is decided, and what is still open.
- The next useful action.
- Paths or URLs for specs, plans, decisions, issues, commits, and diffs. Do not copy their contents.
- A suggested-skills section that names relevant skills. The next agent invokes a skill only when asked.

Redact secrets, credentials, and personal data.

## Completion

Report the document's absolute path. If the temporary directory is not writable, return the handoff inline in the reply and say it was not saved.

Writing the handoff does not authorize implementation, commits, or edits in the workspace.
