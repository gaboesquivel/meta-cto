import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import type { JudgeCandidate } from "@/lib/signal/contracts";

import { createLlmJudge } from "./judge";

type GenerateResult = Exclude<
  NonNullable<ConstructorParameters<typeof MockLanguageModelV4>[0]>["doGenerate"],
  ((...args: never[]) => unknown) | unknown[] | undefined
>;

const result = (payload: unknown): GenerateResult => ({
  content: [{ text: JSON.stringify(payload), type: "text" }],
  finishReason: { raw: "stop", unified: "stop" },
  usage: {
    inputTokens: { cacheRead: undefined, cacheWrite: undefined, noCache: 10, total: 10 },
    outputTokens: { reasoning: undefined, text: 20, total: 20 },
  },
  warnings: [],
});

const draft = {
  description: "When I trade a shift with a coworker it often does not show up on my schedule.",
  title: "Traded shifts sometimes don't show on my schedule",
};

const candidates: JudgeCandidate[] = [
  {
    description: "Swapped shifts do not appear for both employees.",
    featureRequestId: "fr-swap",
    title: "Shift swaps don't sync reliably",
    underlyingNeed: "Employees need shift trades reflected reliably on their schedules.",
  },
  {
    description: "Managers want to approve every change to the schedule.",
    featureRequestId: "fr-approve",
    title: "Manager approval for shift changes",
    underlyingNeed: null,
  },
  {
    description: "Export payroll to CSV.",
    featureRequestId: "fr-payroll",
    title: "Payroll export",
    underlyingNeed: null,
  },
];

const validPayload = {
  judgments: [
    {
      featureRequestId: "fr-swap",
      reason: "Both describe traded shifts failing to appear on schedules; support it.",
      sharedDimension: null,
      verdict: "same_need",
    },
    {
      featureRequestId: "fr-approve",
      reason: "Both concern shift changes, but this one is about approval control.",
      sharedDimension: "Shift change workflow",
      verdict: "related_need",
    },
    {
      featureRequestId: "fr-payroll",
      reason: "Payroll export does not address schedule updates.",
      sharedDimension: null,
      verdict: "different",
    },
  ],
  underlyingNeed: "Employees need traded shifts to appear reliably on their schedules.",
};

const judgeWith = (payload: unknown) => {
  const model = new MockLanguageModelV4({ doGenerate: result(payload) });
  return { judge: createLlmJudge({ model }), model };
};

describe("createLlmJudge", () => {
  it("parses the underlying need and one judgment per candidate", async () => {
    const { judge, model } = judgeWith(validPayload);
    const output = await judge.judge({ candidates, draft });

    expect(output.underlyingNeed).toBe(validPayload.underlyingNeed);
    expect(output.judgments).toEqual(validPayload.judgments);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("sends the draft and every candidate id in a single call", async () => {
    const { judge, model } = judgeWith(validPayload);
    await judge.judge({ candidates, draft });

    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(prompt).toContain(draft.title);
    for (const candidate of candidates) expect(prompt).toContain(candidate.featureRequestId);
    expect(prompt).toContain("Same Need");
    expect(prompt).toContain("Related Need");
    expect(prompt).toContain("Shared Dimension");
  });

  it("drops judgments for unknown ids and duplicate ids", async () => {
    const { judge } = judgeWith({
      ...validPayload,
      judgments: [
        ...validPayload.judgments,
        { ...validPayload.judgments[0], featureRequestId: "fr-invented" },
        { ...validPayload.judgments[2], verdict: "same_need" },
      ],
    });
    const output = await judge.judge({ candidates, draft });

    expect(output.judgments.map((j) => j.featureRequestId)).toEqual([
      "fr-swap",
      "fr-approve",
      "fr-payroll",
    ]);
    expect(output.judgments[2]?.verdict).toBe("different");
  });

  it("keeps the shared dimension for related_need and clears it otherwise", async () => {
    const { judge } = judgeWith({
      ...validPayload,
      judgments: validPayload.judgments.map((j) =>
        j.verdict === "different" ? { ...j, sharedDimension: "Scheduling" } : j,
      ),
    });
    const output = await judge.judge({ candidates, draft });
    const byId = new Map(output.judgments.map((j) => [j.featureRequestId, j]));

    expect(byId.get("fr-approve")?.sharedDimension).toBe("Shift change workflow");
    expect(byId.get("fr-payroll")?.sharedDimension).toBeNull();
  });

  it("throws when a related_need judgment has no shared dimension", async () => {
    const { judge } = judgeWith({
      ...validPayload,
      judgments: [{ ...validPayload.judgments[1], sharedDimension: null }],
    });
    await expect(judge.judge({ candidates, draft })).rejects.toThrow(/shared dimension/iu);
  });

  it("throws when a reason is missing or blank", async () => {
    const { reason: _reason, ...withoutReason } = validPayload.judgments[0] ?? {};
    await expect(
      judgeWith({ ...validPayload, judgments: [withoutReason] }).judge.judge({ candidates, draft }),
    ).rejects.toThrow();
    await expect(
      judgeWith({
        ...validPayload,
        judgments: [{ ...validPayload.judgments[0], reason: "  " }],
      }).judge.judge({ candidates, draft }),
    ).rejects.toThrow();
  });

  it("throws on output that does not match the schema", async () => {
    await expect(
      judgeWith({ judgments: [{ featureRequestId: "fr-swap", verdict: "duplicate" }] }).judge.judge(
        { candidates, draft },
      ),
    ).rejects.toThrow();

    const model = new MockLanguageModelV4({
      doGenerate: { ...result({}), content: [{ text: "not json", type: "text" }] },
    });
    await expect(createLlmJudge({ model }).judge({ candidates, draft })).rejects.toThrow();
  });

  it("still asks for the underlying need when there are no candidates", async () => {
    const { judge, model } = judgeWith(validPayload);
    const output = await judge.judge({ candidates: [], draft });

    expect(model.doGenerateCalls).toHaveLength(1);
    expect(output.judgments).toEqual([]);
  });
});
