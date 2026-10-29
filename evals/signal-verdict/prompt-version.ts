import { createHash } from "node:crypto";
import { z } from "zod";

import { judgeModelId, judgeOutputSchema } from "@/lib/signal/agent";
import { buildJudgePrompt, JUDGE_SYSTEM } from "@/lib/signal/agent/prompt";

/**
 * The judge's prompt version: a short hash of everything that shapes a Verdict on the judge's
 * side. No file I/O, so app code (the Proof Report) can import it without tracing eval files.
 */

export interface PromptConfig {
  model: string;
  outputSchema: string;
  system: string;
  /** The user prompt rendered for a fixed sample, so template changes count. */
  userTemplate: string;
}

/** Short hash of everything that shapes a Verdict on the judge's side. */
export const promptVersion = (config: PromptConfig): string =>
  `pv-${createHash("sha256")
    .update(JSON.stringify([config.system, config.userTemplate, config.outputSchema, config.model]))
    .digest("hex")
    .slice(0, 12)}`;

/** The model a Check would use: the gateway judge model, else the direct Anthropic fallback. */
const effectiveModel = (): string => {
  if (process.env.AI_GATEWAY_API_KEY?.trim()) return judgeModelId();
  return `direct:${process.env.CHAT_MODEL?.trim() || "default-chat-model"}`;
};

/** Read-only view of the judge in `lib/signal/agent`: its prompt version and model id. */
export const currentPromptVersion = (): { id: string; model: string } => {
  const model = effectiveModel();
  const userTemplate = buildJudgePrompt({
    candidates: [
      {
        description: "candidate",
        featureRequestId: "fr",
        title: "candidate",
        underlyingNeed: null,
      },
    ],
    draft: { description: "draft", title: "draft" },
  });
  const outputSchema = JSON.stringify(z.toJSONSchema(judgeOutputSchema));
  return { id: promptVersion({ model, outputSchema, system: JUDGE_SYSTEM, userTemplate }), model };
};
