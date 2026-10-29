import { MockEmbeddingModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmbedder, createGatewayEmbedder, embeddingModelId } from "./embedder";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createEmbedder", () => {
  it("embeds the text with the given model", async () => {
    const model = new MockEmbeddingModelV4({
      doEmbed: { embeddings: [[0.1, 0.2, 0.3]], warnings: [] },
    });
    const vector = await createEmbedder(model).embed("Shift swaps don't sync");

    expect(vector).toEqual([0.1, 0.2, 0.3]);
    expect(model.doEmbedCalls[0]?.values).toEqual(["Shift swaps don't sync"]);
  });

  it("surfaces model errors", async () => {
    const model = new MockEmbeddingModelV4({
      doEmbed: () => Promise.reject(new Error("gateway down")),
    });
    await expect(createEmbedder(model).embed("x")).rejects.toThrow("gateway down");
  });
});

describe("createGatewayEmbedder", () => {
  it("returns null without AI_GATEWAY_API_KEY", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    expect(createGatewayEmbedder()).toBeNull();
  });

  it("returns an embedder when the gateway key is set (no network until called)", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    expect(createGatewayEmbedder()).not.toBeNull();
  });
});

describe("embeddingModelId", () => {
  it("defaults to openai/text-embedding-3-small", () => {
    vi.stubEnv("SIGNAL_EMBEDDING_MODEL", "");
    expect(embeddingModelId()).toBe("openai/text-embedding-3-small");
  });

  it("reads SIGNAL_EMBEDDING_MODEL", () => {
    vi.stubEnv("SIGNAL_EMBEDDING_MODEL", " openai/text-embedding-3-large ");
    expect(embeddingModelId()).toBe("openai/text-embedding-3-large");
  });
});
