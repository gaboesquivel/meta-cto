import { createGateway } from "@ai-sdk/gateway";
import type { LanguageModel } from "ai";

import { resolveChatModel } from "@/lib/ai/resolve-chat-model";

/** Served by the AI Gateway; the template's chat default is not. */
export const DEFAULT_JUDGE_MODEL = "anthropic/claude-sonnet-5.5";

/** `SIGNAL_JUDGE_MODEL` (an AI Gateway model id), defaulting to `DEFAULT_JUDGE_MODEL`. */
export const judgeModelId = (): string =>
  process.env.SIGNAL_JUDGE_MODEL?.trim() || DEFAULT_JUDGE_MODEL;

/**
 * The verdict model through the AI Gateway. Without a gateway key it falls back to the
 * template's direct Anthropic override. Returns null when no credentials are configured.
 */
export const resolveJudgeModel = (): LanguageModel | null => {
  const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (gatewayKey) return createGateway({ apiKey: gatewayKey })(judgeModelId());
  return resolveChatModel();
};
