import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { composeQuery } from "../orchestration/compose";
import { gradeQueryMatrixCase } from "./grade-query-matrix";
import { queryMatrixCases, queryMatrixCount } from "./query-matrix";

const runCase = async (prompt: string) => {
  try {
    const result = await composeQuery({
      input: {
        clientRequestId: `matrix-${prompt.slice(0, 12)}`,
        query: prompt,
        version: 1,
      },
    });
    return { error: null, result };
  } catch (error) {
    return { error, result: null };
  }
};

describe("query matrix", () => {
  it("has at least 100 domain-neutral prompts", () => {
    assert.ok(queryMatrixCount() >= 100);
    assert.equal(queryMatrixCases.length, queryMatrixCount());
  });

  for (const matrixCase of queryMatrixCases) {
    it(`${matrixCase.id} — ${matrixCase.prompt.slice(0, 48)}`, async () => {
      const previous = process.env.AI_GATEWAY_API_KEY;
      process.env.AI_GATEWAY_API_KEY = "";
      try {
        const { error, result } = await runCase(matrixCase.prompt);
        const { grade, reason } = gradeQueryMatrixCase({
          error,
          matrixCase,
          result,
        });
        assert.equal(grade, "PASS", reason ?? "expected PASS");
      } finally {
        if (previous === undefined) {
          delete process.env.AI_GATEWAY_API_KEY;
        } else {
          process.env.AI_GATEWAY_API_KEY = previous;
        }
      }
    });
  }
});
