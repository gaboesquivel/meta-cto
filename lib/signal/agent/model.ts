import { createGateway } from "@ai-sdk/gateway";
import type { LanguageModel } from "ai";

import { resolveChatModel } from "@/lib/ai/resolve-chat-model";

/** `SIGNAL_JUDGE_MODEL` (an AI Gateway model id), or null to use the template chat model. */
export const judgeModelId = (): string | null => process.env.SIGNAL_JUDGE_MODEL?.trim() || null;

/**
 * The verdict model: `SIGNAL_JUDGE_MODEL` through the AI Gateway when set, otherwise the
 * template's chat model resolution (`CHAT_MODEL`, gateway or direct Anthropic override).
 * Returns null when no credentials are configured.
 */
export const resolveJudgeModel = (): LanguageModel | null => {
  const modelId = judgeModelId();
  const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (modelId && gatewayKey) return createGateway({ apiKey: gatewayKey })(modelId);
  return resolveChatModel();
};
