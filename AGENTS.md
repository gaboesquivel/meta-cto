# Project Rules

## Prompt Logging

Every time you receive a new instruction or prompt, append it to prompts.txt in the project root with a timestamp (ISO 8601) and a brief summary of what you did in response. The summary must list which skills were used (if any) and which docs files were changed or created (if any). Also log every question asked during a session — questions you ask the user (e.g. clarifying questions) and questions the user asks you — together with the answer given. Create the file if it doesn't exist. Keep this log updated throughout all sessions.
