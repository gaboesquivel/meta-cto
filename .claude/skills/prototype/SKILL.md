---
name: prototype
description: Build a disposable experiment to answer a design, interaction, API, or logic question. Use when the user says "prototype this", "spike it", or "try a quick throwaway".
disable-model-invocation: false
---

# Prototype

State the question and the observation that would help answer it. Choose the smallest runnable artifact suited to the audience and existing environment:

- Visual alternatives in a web application: [UI guidance](UI.md).
- A nontechnical walkthrough of state transitions: [logic demo guidance](LOGIC.md).
- API, CLI, backend, or data questions: a focused script, request collection, fixture, or existing interface. A browser UI is optional.

Mark experimental code clearly and isolate it from production behavior. Reuse the project's conventions; use in-memory data or an explicit scratch resource by default. Avoid live mutations and credentials. Add only the checks and error handling needed to run safely and interpret the result.

Make the experiment easy to run and expose the state or measurements needed to assess it. Capture the question, result, limitations, and useful artifact in the project's existing location. Preserve alternatives only when they are useful evidence; a throwaway branch is optional and must fit existing authorization.

A prototype answers a question. Promoting it into production code, committing it, or publishing it requires corresponding authorization. If implementation is authorized, apply production standards and relevant verification before retaining code.
