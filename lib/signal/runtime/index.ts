import { workspace } from "@/data/crewday/seed";
import { createGatewayEmbedder, createLlmJudge, resolveJudgeModel } from "@/lib/signal/agent";
import type { Embedder, Judge, SignalService } from "@/lib/signal/contracts";
import { getDb } from "@/lib/signal/db";
import type { SignalDb } from "@/lib/signal/db";
import { createRepository } from "@/lib/signal/repository";
import { createSignalService } from "@/lib/signal/service";
import { DEFAULT_JUDGE_TIMEOUT_MS } from "@/lib/signal/service/context";

/**
 * Builds the service for the Crewday Demo Workspace. The workspace row is resolved lazily on
 * first use, so callers get a synchronous handle.
 */
export const createRuntimeService = (deps: {
  db: SignalDb;
  embedder: Embedder;
  judge: Judge;
  judgeTimeoutMs?: number;
}): SignalService => {
  const repo = createRepository(deps.db);
  let ready: Promise<SignalService> | null = null;
  const load = async () => {
    try {
      const row = await repo.ensureWorkspace(workspace);
      return createSignalService({
        embedder: deps.embedder,
        judge: deps.judge,
        judgeTimeoutMs: deps.judgeTimeoutMs,
        repo,
        workspaceId: row.id,
      });
    } catch (error) {
      // A transient failure must not poison this instance: the next call retries.
      ready = null;
      throw error;
    }
  };
  const resolve = () => {
    ready ??= load();
    return ready;
  };

  return {
    check: (input) => resolve().then((service) => service.check(input)),
    comment: (id, input) => resolve().then((service) => service.comment(id, input)),
    create: (input) => resolve().then((service) => service.create(input)),
    get: (id) => resolve().then((service) => service.get(id)),
    metrics: () => resolve().then((service) => service.metrics()),
    search: (input) => resolve().then((service) => service.search(input)),
    support: (id, input) => resolve().then((service) => service.support(id, input)),
  };
};

/** `SIGNAL_JUDGE_TIMEOUT_MS` when it is a positive number; otherwise the service default. */
export const judgeTimeoutFromEnv = (): number | undefined => {
  const value = Number(process.env.SIGNAL_JUDGE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

let cached: SignalService | null = null;

/** Composed Signal service, or null when the database or AI keys are not configured. */
export const getSignalService = (): SignalService | null => {
  if (cached) return cached;
  const db = getDb();
  if (!db) return null;
  const embedder = createGatewayEmbedder();
  const model = resolveJudgeModel();
  if (!(embedder && model)) return null;
  const judgeTimeoutMs = judgeTimeoutFromEnv() ?? DEFAULT_JUDGE_TIMEOUT_MS;
  cached = createRuntimeService({
    db,
    embedder,
    // The judge aborts its own model call at the same budget the service waits for.
    judge: createLlmJudge({ model, timeoutMs: judgeTimeoutMs }),
    judgeTimeoutMs,
  });
  return cached;
};
