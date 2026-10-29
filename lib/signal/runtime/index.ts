import { workspace } from "@/data/crewday/seed";
import {
  createGatewayEmbedder,
  createLlmJudge,
  judgeModelId,
  resolveJudgeModel,
} from "@/lib/signal/agent";
import type { Embedder, Judge, ReviewService, SignalService } from "@/lib/signal/contracts";
import { getDb } from "@/lib/signal/db";
import type { SignalDb } from "@/lib/signal/db";
import { createRepository } from "@/lib/signal/repository";
import { createBacklogScan } from "@/lib/signal/scan";
import { createReviewService, createSignalService } from "@/lib/signal/service";
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

/**
 * Review service for the Crewday Demo Workspace. The backlog scan is available only with a
 * judge; reviewing, undo and metrics need just the database.
 */
export const createRuntimeReviewService = (deps: {
  db: SignalDb;
  judge?: Judge;
  judgeTimeoutMs?: number;
  model?: string | null;
}): ReviewService => {
  const repo = createRepository(deps.db);
  let ready: Promise<ReviewService> | null = null;
  const load = async () => {
    try {
      const row = await repo.ensureWorkspace(workspace);
      const scan = deps.judge
        ? createBacklogScan({
            judge: deps.judge,
            judgeTimeoutMs: deps.judgeTimeoutMs,
            model: deps.model,
            repo,
            workspaceId: row.id,
          }).scan
        : undefined;
      return createReviewService({ repo, scan, workspaceId: row.id });
    } catch (error) {
      ready = null;
      throw error;
    }
  };
  const resolve = () => {
    ready ??= load();
    return ready;
  };

  return {
    decide: (input, actor) => resolve().then((service) => service.decide(input, actor)),
    queue: () => resolve().then((service) => service.queue()),
    scan: (options) => resolve().then((service) => service.scan(options)),
    undo: (decisionId, actor) => resolve().then((service) => service.undo(decisionId, actor)),
  };
};

let cachedReview: ReviewService | null = null;

/** Review service for the Crewday Demo Workspace, or null without a database. */
export const getReviewService = (): ReviewService | null => {
  if (cachedReview) return cachedReview;
  const db = getDb();
  if (!db) return null;
  const model = resolveJudgeModel();
  const judgeTimeoutMs = judgeTimeoutFromEnv() ?? DEFAULT_JUDGE_TIMEOUT_MS;
  cachedReview = createRuntimeReviewService({
    db,
    judge: model ? createLlmJudge({ model, timeoutMs: judgeTimeoutMs }) : undefined,
    judgeTimeoutMs,
    model: model ? judgeModelId() : null,
  });
  return cachedReview;
};
