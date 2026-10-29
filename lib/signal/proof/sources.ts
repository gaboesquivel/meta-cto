import { z } from "zod";

import { currentPromptVersion } from "@/evals/signal-verdict/prompt-version";
import type { ReviewMetrics } from "@/lib/signal/contracts";
import { getDb } from "@/lib/signal/db";
import { PILOT_ORIGIN, PILOT_WORKSPACE } from "@/lib/signal/pilot";
import { createRepository } from "@/lib/signal/repository";
import type { SignalRepository } from "@/lib/signal/repository";
import type { EvalReading, PilotGroundTruth } from "@/lib/signal/repository-pilot-data";
import { getReviewService } from "@/lib/signal/runtime";
import { createAnswerKeyScoring } from "@/lib/signal/service/answer-key";
import type { AnswerKeyLabels, AnswerKeyScores } from "@/lib/signal/service/answer-key";

import { readProofLocks, V2_LOCK_SET_NAME } from "./locks";
import type { HeldOutV2Lock, LockRead, PilotLock, ProofLocks } from "./locks";
import { buildProofReport } from "./report";
import type { HeldOutV2State, PilotFilesState, ProofInputs, ProofReport, V2Run } from "./report";

/**
 * Reads what the Proof Report needs (spec 004, decision 0004): pilot metrics (Origin `pilot`), the
 * pilot ground truth and v2 readings stored in the database, Answer Key scores from the stored
 * labels, and the two committed freeze locks. No pilot or v2 content is read from files. Every
 * source degrades to a stated reason ("pilot data not loaded", "no v2 reading") instead of failing
 * the report.
 */

/** The database records the report reads; no operation serves them item by item. */
export interface ProofStore {
  answerKeyScores: (labels: AnswerKeyLabels) => Promise<AnswerKeyScores | null>;
  /** The Pilot Workspace's stored ground truth; null before a load or without the Workspace. */
  pilotGroundTruth: () => Promise<PilotGroundTruth | null>;
  /** The latest judged, non-repeat Held-Out Set v2 run, optionally by fingerprint and prompt. */
  v2Reading: (key: { fingerprint?: string; promptVersion?: string }) => Promise<EvalReading | null>;
}

export interface ProofSourceDeps {
  locks: () => ProofLocks;
  now: () => Date;
  /** Null when the database is not configured. */
  pilotMetrics: () => Promise<ReviewMetrics | null>;
  promptVersion: () => string;
  /** Null when the database is not configured. */
  store: () => ProofStore | null;
}

/** A stable, path-free reason for an unreadable lock; the raw error goes to the server log. */
const lockReason = (label: string, error: unknown): string => {
  console.error(`[signal] proof report: ${label} lock unreadable`, error);
  if (error instanceof SyntaxError) return "a lock file is not valid JSON.";
  if (error instanceof z.ZodError) return "a lock file does not match its expected shape.";
  return "a lock file could not be read; check the server log.";
};

const STORE_FAILED =
  "the database could not be read; retry, and check the server log if it persists.";

const safely = async <T>(label: string, run: () => Promise<T>): Promise<T | Error> => {
  try {
    return await run();
  } catch (error) {
    console.error(`[signal] proof report: ${label} failed`, error);
    return error instanceof Error ? error : new Error(String(error));
  }
};

const countUnconfirmed = (labels: AnswerKeyLabels) =>
  [...labels.featureRequests, ...labels.feedback].filter((label) => !label.confirmed).length;

const pilotMessages = (
  lock: PilotLock | null,
  truth: PilotGroundTruth | null,
  changed: boolean,
): string[] => {
  const messages: string[] = [];
  if (changed && lock) {
    messages.push(
      `Pilot data changed after freeze: reading reset. The stored data no longer matches the fingerprint frozen at ${lock.frozenAt}; earlier pilot readings do not apply.`,
    );
  }
  if (!lock)
    messages.push("Pilot files are not frozen. Run the freeze command and commit the lock file.");
  if (!truth) messages.push("Pilot data not loaded: run the pilot load against this database.");
  const unconfirmed = truth ? countUnconfirmed(truth.labels) : 0;
  if (unconfirmed > 0) messages.push(`Answer Key has ${unconfirmed} unconfirmed entries.`);
  return messages;
};

/** Counts from the stored ground truth, else the lock's; null when neither exists. */
const pilotCounts = (lock: PilotLock | null, truth: PilotGroundTruth | null) => {
  if (truth) {
    return {
      backlogRequests: truth.counts.featureRequests,
      feedback: truth.feedbackCount,
      rate: lock?.expectedBacklogDuplicateRate ?? truth.expectedBacklogDuplicateRate,
    };
  }
  if (lock) {
    return {
      backlogRequests: lock.featureRequests,
      feedback: lock.feedback,
      rate: lock.expectedBacklogDuplicateRate,
    };
  }
  return null;
};

/** Readiness from the lock and the stored ground truth (null when not loaded). */
const pilotState = (lock: PilotLock | null, truth: PilotGroundTruth | null): PilotFilesState => {
  const changed = Boolean(lock && truth && truth.fingerprint !== lock.fingerprint);
  const unconfirmed = truth ? countUnconfirmed(truth.labels) : 0;
  const counts = pilotCounts(lock, truth);
  return {
    backlogRequests: counts?.backlogRequests ?? 0,
    changed,
    expectedBacklogDuplicateRate: counts?.rate ?? null,
    feedback: counts?.feedback ?? 0,
    frozen: lock !== null,
    frozenAt: lock?.frozenAt ?? null,
    frozenFeedback: counts?.feedback ?? null,
    loaded: truth !== null,
    loadedAt: truth?.loadedAt ?? null,
    messages: pilotMessages(lock, truth, changed),
    readable: true,
    ready: lock !== null && truth !== null && !changed && unconfirmed === 0,
    unconfirmed,
  };
};

const readPilot = async (
  read: LockRead<PilotLock>,
  store: ProofStore | null,
): Promise<{ state: PilotFilesState; truth: PilotGroundTruth | null }> => {
  if (!read.ok) {
    return { state: { message: lockReason("pilot", read.error), readable: false }, truth: null };
  }
  const truth = store ? await safely("pilot ground truth", store.pilotGroundTruth) : null;
  if (truth instanceof Error) {
    return { state: { message: STORE_FAILED, readable: false }, truth: null };
  }
  return { state: pilotState(read.lock, truth), truth };
};

const precisionSchema = z.object({ predicted: z.number(), truePositives: z.number() });
const readingsSchema = z.object({
  failures: z.number().optional(),
  relatedNeed: precisionSchema,
  sameNeed: precisionSchema,
  sameNeedPositives: z.number().optional(),
});

const precisionCounts = (p: z.infer<typeof precisionSchema>) => ({
  predicted: p.predicted,
  truePositives: p.truePositives,
});

const toRun = (reading: EvalReading | null): V2Run | null => {
  if (!reading) return null;
  const parsed = readingsSchema.safeParse(reading.readings);
  const counts = parsed.success ? parsed.data : null;
  return {
    at: reading.createdAt,
    failures: counts?.failures ?? reading.failures,
    promptVersion: reading.promptVersion,
    relatedNeed: counts ? precisionCounts(counts.relatedNeed) : null,
    sameNeed: counts ? precisionCounts(counts.sameNeed) : null,
    sameNeedPositives: counts?.sameNeedPositives ?? reading.sameNeedPositives,
    status: reading.status === "completed" ? "completed" : "failed",
  };
};

interface V2Sources {
  latest: V2Run | null;
  reading: V2Run | null;
  state: HeldOutV2State;
}

const V2_CHANGED_MESSAGE =
  "Held-Out Set v2 changed after freeze: reading reset. The latest stored reading is from another fingerprint than the committed lock's; earlier v2 readings do not apply.";

const V2_NOT_FROZEN =
  "Held-Out Set v2 is not frozen. Run the freeze command and commit the lock file.";

const fetchReadings = (store: ProofStore, lock: HeldOutV2Lock, promptVersion: string | null) =>
  Promise.all([
    promptVersion ? store.v2Reading({ fingerprint: lock.fingerprint, promptVersion }) : null,
    store.v2Reading({ fingerprint: lock.fingerprint }),
    store.v2Reading({}),
  ]);

const readV2 = async (
  read: LockRead<HeldOutV2Lock>,
  store: ProofStore | null,
  promptVersion: string | null,
): Promise<V2Sources> => {
  if (!read.ok) {
    const state = { message: lockReason("Held-Out Set v2", read.error), readable: false } as const;
    return { latest: null, reading: null, state };
  }
  const { lock } = read;
  const base = {
    frozen: lock !== null,
    frozenAt: lock?.frozenAt ?? null,
    pairs: lock?.pairs ?? 0,
    readable: true as const,
    sameNeedPositives: lock?.sameNeedPositives ?? 0,
  };
  if (!lock) {
    return {
      latest: null,
      reading: null,
      state: { ...base, changed: false, message: V2_NOT_FROZEN },
    };
  }
  const fetched = store
    ? await safely("v2 readings", () => fetchReadings(store, lock, promptVersion))
    : null;
  if (fetched instanceof Error) {
    return { latest: null, reading: null, state: { message: STORE_FAILED, readable: false } };
  }
  const [current, latest, latestAny] = fetched ?? [null, null, null];
  // The latest reading on the set is from another fingerprint: the set changed after freeze.
  const changed = latestAny !== null && latestAny.fingerprint !== lock.fingerprint;
  return {
    latest: toRun(latest),
    reading: toRun(current),
    state: { ...base, changed, message: changed ? V2_CHANGED_MESSAGE : null },
  };
};

/** Why pilot metrics are missing, in words safe to show (never the raw error). */
const metricsErrorOf = (metrics: ReviewMetrics | Error | null): string | null => {
  if (metrics instanceof Error)
    return "they could not be read; retry, and check the server log if it persists.";
  if (metrics === null) return "the database is not configured on this deployment.";
  return null;
};

const tryPromptVersion = (read: () => string): string | null => {
  try {
    return read();
  } catch {
    return null;
  }
};

export const loadProofInputs = async (deps: ProofSourceDeps): Promise<ProofInputs> => {
  const locks = deps.locks();
  const store = deps.store();
  const promptVersion = tryPromptVersion(deps.promptVersion);

  const [pilot, v2, metrics] = await Promise.all([
    readPilot(locks.pilot, store),
    readV2(locks.v2, store, promptVersion),
    safely("pilot metrics", deps.pilotMetrics),
  ]);
  const labels = pilot.truth?.labels;
  const scores =
    store && labels
      ? await safely("Answer Key scoring", () => store.answerKeyScores(labels))
      : null;

  return {
    answerKeyScores: scores instanceof Error ? null : scores,
    generatedAt: deps.now().toISOString(),
    heldOutV2: v2.state,
    pilotFiles: pilot.state,
    pilotMetrics: metrics instanceof Error ? null : metrics,
    pilotMetricsError: metricsErrorOf(metrics),
    promptVersion,
    v2LatestReading: v2.latest,
    v2Reading: v2.reading,
  };
};

/** The report's view of the repository; finds the Pilot Workspace without creating it. */
export const repositoryProofStore = (repo: SignalRepository): ProofStore => {
  let workspace: Promise<string | null> | undefined;
  const workspaceId = () => {
    workspace ??= repo.findWorkspace(PILOT_WORKSPACE.slug).then((row) => row?.id ?? null);
    return workspace;
  };
  return {
    answerKeyScores: async (labels) => {
      const id = await workspaceId();
      if (!id) return null;
      return await createAnswerKeyScoring({ answerKey: labels, repo, workspaceId: id }).score();
    },
    pilotGroundTruth: async () => {
      const id = await workspaceId();
      return id ? await repo.pilotGroundTruth(id) : null;
    },
    v2Reading: (key) => repo.latestEvalReading({ ...key, setName: V2_LOCK_SET_NAME }),
  };
};

export const runtimeProofDeps = (): ProofSourceDeps => ({
  locks: () => readProofLocks(),
  now: () => new Date(),
  pilotMetrics: async () => {
    const service = getReviewService(PILOT_ORIGIN);
    return service ? await service.metrics({ origin: PILOT_ORIGIN }) : null;
  },
  promptVersion: () => currentPromptVersion().id,
  store: () => {
    const db = getDb();
    return db ? repositoryProofStore(createRepository(db)) : null;
  },
});

/** The Proof Report for this deployment. Callers enforce access (Pilot Key or Operator) first. */
export const getProofReport = async (
  deps: ProofSourceDeps = runtimeProofDeps(),
): Promise<ProofReport> => buildProofReport(await loadProofInputs(deps));
