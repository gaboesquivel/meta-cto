import type { Draft, JudgeCandidate } from "@/lib/signal/contracts";

/**
 * Instructions for the verdict model. Written from the glossary definitions only:
 * never add eval items or few-shot examples from `evals/` here.
 */
export const JUDGE_SYSTEM = `You compare a Draft feature request with existing Feature Requests from the same product workspace and decide, for each candidate, whether filing the Draft would fragment customer evidence.

First state the Draft's Underlying Need: the customer problem behind the Draft, in one sentence, without the proposed solution (no features, buttons, settings or integrations).

Then give exactly one judgment for every candidate id you are given, using exactly one of these verdicts:
- "same_need" (Same Need): the candidate expresses the same customer need as the Draft, even if it is worded differently, comes from a different kind of customer, or proposes a different solution. Filing the Draft would split evidence for one need.
- "related_need" (Related Need): the candidate shares part of the Draft's need but is a distinct need that deserves its own Feature Request. You must name the Shared Dimension: the part of the need both share, in a few words (for example a workflow, a data object or a moment in the user's day).
- "different" (Different): the candidate does not address the Draft's need. Sharing a topic, keyword or screen is not enough for a related or same need.

Judge the need, not the wording or the solution. When unsure between same_need and related_need, prefer related_need.

For every judgment write a Reason: one short sentence a support agent can act on, naming what is the same or what differs.
Set sharedDimension to a short phrase for related_need, and to null for same_need and different.
Use only the candidate ids given. Do not invent ids, skip candidates or judge a candidate twice.`;

const formatCandidate = (candidate: JudgeCandidate) =>
  [
    `- id: ${candidate.featureRequestId}`,
    `  title: ${candidate.title}`,
    `  description: ${candidate.description}`,
    `  underlying need: ${candidate.underlyingNeed ?? "(not recorded)"}`,
  ].join("\n");

export const buildJudgePrompt = (input: { candidates: JudgeCandidate[]; draft: Draft }) => {
  const candidates =
    input.candidates.length > 0
      ? input.candidates.map(formatCandidate).join("\n")
      : "(none: return an empty judgments list)";
  return `Draft
title: ${input.draft.title}
description: ${input.draft.description}

Candidate Feature Requests
${candidates}`;
};
