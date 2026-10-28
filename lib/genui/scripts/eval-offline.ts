import { gradeQueryMatrixCase } from "../eval/grade-query-matrix";
import { queryMatrixCases } from "../eval/query-matrix";
import { composeQuery } from "../orchestration/compose";

const runCase = async (matrixCase: (typeof queryMatrixCases)[number]) => {
  try {
    const result = await composeQuery({
      input: {
        clientRequestId: matrixCase.id,
        query: matrixCase.prompt,
        version: 1,
      },
    });
    return gradeQueryMatrixCase({ error: null, matrixCase, result });
  } catch (error) {
    return gradeQueryMatrixCase({ error, matrixCase, result: null });
  }
};

const run = async () => {
  const previous = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = "";

  let pass = 0;
  let fail = 0;

  try {
    const grades = await Promise.all(
      queryMatrixCases.map(async (matrixCase) => ({
        id: matrixCase.id,
        ...(await runCase(matrixCase)),
      })),
    );
    for (const { grade, id, reason } of grades) {
      if (grade === "PASS") pass += 1;
      else {
        fail += 1;
        console.error(`${id} FAIL: ${reason}`);
      }
    }
  } finally {
    if (previous === undefined) {
      delete process.env.AI_GATEWAY_API_KEY;
    } else {
      process.env.AI_GATEWAY_API_KEY = previous;
    }
  }

  const report = {
    cases: queryMatrixCases.length,
    fail,
    pass,
  };
  console.log(JSON.stringify(report, null, 2));
  if (fail > 0) process.exit(1);
};

try {
  await run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
