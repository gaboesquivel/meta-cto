---
name: interview
description: Interview the user, with a guess attached to each question, to extract what they actually want before any plan, spec, or code exists. Use when the user says "interview me", "ask me questions", or "figure out what I want".
disable-model-invocation: false
---

# Interview

Use when the ask is missing who it is for, why now, what success looks like, or the binding constraint, and you would otherwise fill those in silently. Skip it for unambiguous, mechanical, or purely informational requests, and in non-interactive runs; there, report the underspecified ask as a blocker instead of guessing.

Read the conversation, root context, and relevant code first. Recover facts with tools; ask the user only about intent.

Open with a one-sentence hypothesis of what the user wants and an honest confidence percentage. Below about 70%, name what is still missing.

Ask open questions one question per message in plain text, each with your guess and the reasoning behind it. Batch closed questions: up to three independent multiple-choice questions per form, using the host's structured question UI, marking your guess among the options and giving each option's tradeoff. Without a form UI, use numbered options in text. Wait for the answers before asking more, and update the hypothesis and confidence as you go. Be visibly willing to be wrong, and sometimes guess in a direction you expect pushback on, so agreement is not mere politeness.

Forms make accepting the marked guess easy. Occasionally present a closed question without a marked guess.

Watch for answers that describe what a good answer sounds like rather than what the user wants: buzzwords as goals ("scalable", "clean", "modern"), deference to convention, or "I should probably". Then ask what they would want if they did not have to justify it to anyone. Treat "whatever you think" as delegation, not a decision; re-ask as a choice between two concrete options.

Stop asking when you can predict the user's reaction to the next three questions you would ask. If several rounds pass without confidence rising, say so and suggest stepping back rather than grinding on.

Restate intent in the user's words, one line each: outcome, user, why now, success, constraint, out of scope. Always include out of scope. Note how many of your guesses were accepted unchanged. Ask for confirmation. "Sounds good", "sure", or silence are not a yes; ask what they would refine. Fold corrections in and restate until the user gives an explicit yes.

On an explicit yes, return the confirmed statement of intent, offer sensible next steps (for example `grill`, `to-spec`, or saving the intent when the user wants it), and end the turn. Do not save, plan, or start downstream work in the same turn. A confirmed intent does not authorize implementation.
