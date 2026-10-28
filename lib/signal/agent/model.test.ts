import { afterEach, describe, expect, it, vi } from "vitest";

import { judgeModelId, resolveJudgeModel } from "./model";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveJudgeModel", () => {
  it("returns null without any model credentials", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("FLOW_ALLOW_DIRECT_ANTHROPIC", "");
    expect(resolveJudgeModel()).toBeNull();
  });

  it("uses SIGNAL_JUDGE_MODEL through the gateway", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    vi.stubEnv("SIGNAL_JUDGE_MODEL", "openai/gpt-5-mini");
    const model = resolveJudgeModel();
    expect(typeof model === "object" && model?.modelId).toBe("openai/gpt-5-mini");
  });

  it("falls back to the template chat model", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    vi.stubEnv("SIGNAL_JUDGE_MODEL", "");
    vi.stubEnv("CHAT_MODEL", "anthropic/claude-haiku-4-5");
    const model = resolveJudgeModel();
    expect(typeof model === "object" && model?.modelId).toBe("anthropic/claude-haiku-4-5");
    expect(judgeModelId()).toBeNull();
  });
});
