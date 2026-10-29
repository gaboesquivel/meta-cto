import { workspace } from "../data/crewday/seed";
import { loadRootEnv } from "../lib/env";
import { createLlmJudge, resolveJudgeModel } from "../lib/signal/agent";
import { SignalError } from "../lib/signal/contracts";
import { getDb } from "../lib/signal/db";
import { createRepository } from "../lib/signal/repository";
import { judgeTimeoutFromEnv } from "../lib/signal/runtime";
import { createBacklogScan } from "../lib/signal/scan";

/**
 * Backlog scan for the Crewday Demo Workspace: `pnpm signal:scan [--limit N]`.
 * An Operator action; never part of a build, deploy, predev or seed.
 */

loadRootEnv();

const limitArg = () => {
  const index = process.argv.indexOf("--limit");
  return index === -1 ? undefined : Number(process.argv[index + 1]);
};

const run = async () => {
  if (process.env.CI || process.env.VERCEL) {
    console.error("signal:scan: scan is an Operator action; not run in builds");
    process.exitCode = 1;
    return;
  }
  const db = getDb();
  if (!db) {
    console.log("signal:scan: DATABASE_URL is not set; skipping scan");
    return;
  }
  const model = resolveJudgeModel();
  if (!model) {
    console.log(
      "signal:scan: no AI credentials (AI_GATEWAY_API_KEY, or FLOW_ALLOW_DIRECT_ANTHROPIC=1 with ANTHROPIC_API_KEY); skipping scan",
    );
    return;
  }
  const repo = createRepository(db);
  const row = await repo.ensureWorkspace(workspace);
  const judgeTimeoutMs = judgeTimeoutFromEnv();
  const scan = createBacklogScan({
    judge: createLlmJudge({ model, timeoutMs: judgeTimeoutMs }),
    judgeTimeoutMs,
    model: typeof model === "string" ? model : model.modelId,
    repo,
    workspaceId: row.id,
  });
  try {
    const result = await scan.scan({ limit: limitArg() });
    console.log(
      `signal:scan: scanned ${result.scanned} Feature Requests; ${result.pairsFound} suspected duplicate pairs found; ${result.remaining} remaining`,
    );
  } catch (error) {
    if (!(error instanceof SignalError)) throw error;
    console.error(`signal:scan: ${error.message} Use --limit with a number from 1 to 200.`);
    process.exitCode = 1;
  }
};

await run();
