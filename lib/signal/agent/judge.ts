import { generateText, Output } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";

import type { Judge, JudgeCandidate, JudgeOutput } from "@/lib/signal/contracts";

import { buildJudgePrompt, JUDGE_SYSTEM } from "./prompt";

export const judgeOutputSchema = z.object({
  judgments: z.array(
    z.object({
      featureRequestId: z.string(),
      reason: z.string().trim().min(1),
      sharedDimension: z.string().trim().nullable(),
      verdict: z.enum(["same_need", "related_need", "different"]),
    }),
  ),
  underlyingNeed: z.string().trim().min(1),
});

type Judgment = JudgeOutput["judgments"][number];

/** Keeps the first judgment per known candidate id; enforces the Shared Dimension rule. */
export const normalizeJudgments = (
  judgments: Judgment[],
  candidates: JudgeCandidate[],
): Judgment[] => {
  const known = new Set(candidates.map((candidate) => candidate.featureRequestId));
  const seen = new Set<string>();
  const kept: Judgment[] = [];
  for (const judgment of judgments) {
    const id = judgment.featureRequestId;
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    const sharedDimension = judgment.sharedDimension?.trim() || null;
    if (judgment.verdict === "related_need" && !sharedDimension)
      throw new Error(`Judge returned related_need without a Shared Dimension for ${id}`);
    kept.push({
      ...judgment,
      sharedDimension: judgment.verdict === "related_need" ? sharedDimension : null,
    });
  }
  return kept;
};

/**
 * Verdict model behind every Check: one structured-output call that returns the Draft's
 * Underlying Need and a Verdict, Reason and Shared Dimension per candidate.
 * Throws on model error or schema failure; the service degrades to `unknown`.
 */
export const createLlmJudge = (options: {
  model: LanguageModel;
  /** Per-call timeout in ms; the spec's Check budget is 8 s. */
  timeoutMs?: number;
}): Judge => ({
  judge: async ({ candidates, draft }) => {
    const { output } = await generateText({
      maxRetries: 0,
      model: options.model,
      output: Output.object({ name: "check_verdicts", schema: judgeOutputSchema }),
      prompt: buildJudgePrompt({ candidates, draft }),
      system: JUDGE_SYSTEM,
      timeout: options.timeoutMs,
    });
    return {
      judgments: normalizeJudgments(output.judgments, candidates),
      underlyingNeed: output.underlyingNeed,
    };
  },
});
