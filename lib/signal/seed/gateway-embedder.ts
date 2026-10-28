import { createGateway } from "@ai-sdk/gateway";
import { embed } from "ai";

import type { Embedder } from "../contracts";

export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";

/** Minimal AI Gateway embedder for the seed script; null when AI_GATEWAY_API_KEY is missing. */
export const createGatewayEmbedder = (): Embedder | null => {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) return null;
  const modelId = process.env.SIGNAL_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
  const model = createGateway({ apiKey }).embeddingModel(modelId);
  return {
    embed: async (text: string) => {
      const result = await embed({ model, value: text });
      return result.embedding;
    },
  };
};
