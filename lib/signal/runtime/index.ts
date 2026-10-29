import { workspace as crewdayWorkspace } from "@/data/crewday/seed";
import {
  createGatewayEmbedder,
  createLlmJudge,
  judgeModelId,
  resolveJudgeModel,
} from "@/lib/signal/agent";
import type { Embedder, Judge, Origin, ReviewService, SignalService } from "@/lib/signal/contracts";
import { getDb } from "@/lib/signal/db";
import type { SignalDb } from "@/lib/signal/db";
import { PILOT_ORIGIN, PILOT_WORKSPACE } from "@/lib/signal/pilot";
import { createRepository } from "@/lib/signal/repository";
import { createBacklogScan } from "@/lib/signal/scan";
import { createReviewService, createSignalService } from "@/lib/signal/service";
import { DEFAULT_JUDGE_TIMEOUT_MS } from "@/lib/signal/service/context";

/**
 * The Workspace an Origin acts on: `pilot` is the Pilot Workspace, every other Origin the Crewday
 * Demo Workspace. Pilot access is gated by the Pilot Key in the transports, never here.
 */
export const workspaceFor = (origin: Origin = "demo") =>
  origin === PILOT_ORIGIN ? PILOT_WORKSPACE : crewdayWorkspace;

/**
 * Builds the service for the Origin's Workspace (see `workspaceFor`). The workspace row is
 * resolved lazily on first use, so callers get a synchronous handle. `origin` is recorded on
 * everything it writes (demo by default; eval runs pass `eval`, the Pilot Key `pilot`). Pilot rows
 * are not demo data, so the demo seed reset never deletes them.
 */
export const createRuntimeService = (deps: {
  db: SignalDb;
  embedder: Embedder;
  judge: Judge;
  judgeTimeoutMs?: number;
  origin?: Origin;
}): SignalService => {
  const repo = createRepository(deps.db);
  let ready: Promise<SignalService> | null = null;
  const load = async () => {
    try {
      const row = await repo.ensureWorkspace(workspaceFor(deps.origin));
      return createSignalService({
        embedder: deps.embedder,
        judge: deps.judge,
        judgeTimeoutMs: deps.judgeTimeoutMs,
        markDemo: deps.origin !== PILOT_ORIGIN,
        origin: deps.origin,
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
    search: (input) => resolve().then((service) => service.search(input)),
    support: (id, input) => resolve().then((service) => service.support(id, input)),
  };
};

/** `SIGNAL_JUDGE_TIMEOUT_MS` when it is a positive number; otherwise the service default. */
export const judgeTimeoutFromEnv = (): number | undefined => {
  const value = Number(process.env.SIGNAL_JUDGE_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

const cached = new Map<Origin, SignalService>();

/**
 * Composed Signal service for one Origin (the demo caller's by default; `pilot` acts on the Pilot
 * Workspace), or null when the database or AI keys are not configured.
 */
export const getSignalService = (origin: Origin = "demo"): SignalService | null => {
  const existing = cached.get(origin);
  if (existing) return existing;
  const db = getDb();
  if (!db) return null;
  const embedder = createGatewayEmbedder();
  const model = resolveJudgeModel();
  if (!(embedder && model)) return null;
  const judgeTimeoutMs = judgeTimeoutFromEnv() ?? DEFAULT_JUDGE_TIMEOUT_MS;
  const service = createRuntimeService({
    db,
    embedder,
    // The judge aborts its own model call at the same budget the service waits for.
    judge: createLlmJudge({ model, timeoutMs: judgeTimeoutMs }),
    judgeTimeoutMs,
    origin,
  });
  cached.set(origin, service);
  return service;
};

/**
 * Review service for the Origin's Workspace (Crewday demo by default, `pilot` the Pilot
 * Workspace); review events record that Origin and metrics default to it. The backlog scan is
 * available only with a judge; reviewing, undo and metrics need just the database.
 */
export const createRuntimeReviewService = (deps: {
  db: SignalDb;
  judge?: Judge;
  judgeTimeoutMs?: number;
  model?: string | null;
  origin?: Origin;
}): ReviewService => {
  const repo = createRepository(deps.db);
  let ready: Promise<ReviewService> | null = null;
  const load = async () => {
    try {
      const row = await repo.ensureWorkspace(workspaceFor(deps.origin));
      const scan = deps.judge
        ? createBacklogScan({
            judge: deps.judge,
            judgeTimeoutMs: deps.judgeTimeoutMs,
            model: deps.model,
            repo,
            workspaceId: row.id,
          }).scan
        : undefined;
      return createReviewService({ origin: deps.origin, repo, scan, workspaceId: row.id });
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
    metrics: (input) => resolve().then((service) => service.metrics(input)),
    queue: () => resolve().then((service) => service.queue()),
    scan: (options) => resolve().then((service) => service.scan(options)),
    undo: (decisionId, actor) => resolve().then((service) => service.undo(decisionId, actor)),
  };
};

const cachedReview = new Map<Origin, ReviewService>();

/**
 * Review service for one Origin's Workspace (the Crewday demo by default, `pilot` the Pilot
 * Workspace), or null without a database.
 */
export const getReviewService = (origin: Origin = "demo"): ReviewService | null => {
  const existing = cachedReview.get(origin);
  if (existing) return existing;
  const db = getDb();
  if (!db) return null;
  const model = resolveJudgeModel();
  const judgeTimeoutMs = judgeTimeoutFromEnv() ?? DEFAULT_JUDGE_TIMEOUT_MS;
  const service = createRuntimeReviewService({
    db,
    judge: model ? createLlmJudge({ model, timeoutMs: judgeTimeoutMs }) : undefined,
    judgeTimeoutMs,
    model: model ? judgeModelId() : null,
    origin,
  });
  cachedReview.set(origin, service);
  return service;
};
