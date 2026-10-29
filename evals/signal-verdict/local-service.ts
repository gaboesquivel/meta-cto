import { createGatewayEmbedder, createLlmJudge, resolveJudgeModel } from "@/lib/signal/agent";
import type { SignalService } from "@/lib/signal/contracts";
import { createRepository } from "@/lib/signal/repository";
import { createRuntimeService, judgeTimeoutFromEnv } from "@/lib/signal/runtime";
import { seedCrewday } from "@/lib/signal/seed";
import { createTestDb } from "@/lib/signal/test-db";

/**
 * Real embedder and judge over an in-memory Postgres seeded with the Crewday Demo Workspace,
 * so eval Checks never land in a shared database. Null when AI keys are missing.
 */
export const createLocalEvalService = async (): Promise<SignalService | null> => {
  const embedder = createGatewayEmbedder();
  const model = resolveJudgeModel();
  if (!(embedder && model)) return null;
  const db = await createTestDb();
  await seedCrewday({ embedder, repo: createRepository(db) });
  return createRuntimeService({
    db,
    embedder,
    judge: createLlmJudge({ model }),
    judgeTimeoutMs: judgeTimeoutFromEnv(),
    origin: "eval",
  });
};
