import { createGateway } from "@ai-sdk/gateway";
import { embed } from "ai";
import type { EmbeddingModel } from "ai";

import type { Embedder } from "@/lib/signal/contracts";

export const DEFAULT_EMBEDDING_MODEL = "openai/text-embedding-3-small";
/** Must match `vector(1536)` in the schema. */
export const EMBEDDING_DIMENSIONS = 1536;

/** `SIGNAL_EMBEDDING_MODEL` (an AI Gateway model id), default `openai/text-embedding-3-small`. */
export const embeddingModelId = (): string =>
  process.env.SIGNAL_EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;

export const createEmbedder = (model: EmbeddingModel): Embedder => ({
  embed: async (text) => {
    const result = await embed({ maxRetries: 1, model, value: text });
    return result.embedding;
  },
});

/** AI Gateway embedder, or null when `AI_GATEWAY_API_KEY` is not set. */
export const createGatewayEmbedder = (): Embedder | null => {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) return null;
  return createEmbedder(createGateway({ apiKey }).embeddingModel(embeddingModelId()));
};
