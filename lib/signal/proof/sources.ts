import { ZodError } from "zod";

import {
  checkV2Ready,
  loadHeldOutV2,
  readV2Lock,
  unconfirmedPairs,
} from "@/evals/signal-verdict/held-out-v2";
import { evalDir } from "@/evals/signal-verdict/paths";
import { currentPromptVersion, currentV2Reading, readRunLog } from "@/evals/signal-verdict/run-log";
import type { RunLogEntry } from "@/evals/signal-verdict/run-log";
import {
  answerKeyLabels,
  checkPilotReady,
  pilotDir,
  readPilotFiles,
  readPilotLock,
} from "@/lib/pilot-load/files";
import type { ReviewMetrics } from "@/lib/signal/contracts";
import { getDb } from "@/lib/signal/db";
import { PILOT_ORIGIN } from "@/lib/signal/pilot";
import { createRepository } from "@/lib/signal/repository";
import { getReviewService } from "@/lib/signal/runtime";
import { createAnswerKeyScoring } from "@/lib/signal/service/answer-key";
import type { AnswerKeyLabels, AnswerKeyScores } from "@/lib/signal/service/answer-key";

import { buildProofReport } from "./report";
import type { HeldOutV2State, PilotFilesState, ProofInputs, ProofReport, V2Run } from "./report";

/**
 * Reads what the Proof Report needs: pilot metrics (Origin `pilot`), Answer Key scores, the frozen
 * pilot files and Held-Out Set v2, and the eval run log. Every source degrades to a stated reason
 * instead of failing the report. Files resolve from the project root (`process.cwd()`); the routes
 * that read them list them in `outputFileTracingIncludes`.
 */

export interface ProofSourceDeps {
  /** Null when there is no database to score against. */
  answerKeyScores: (labels: AnswerKeyLabels) => Promise<AnswerKeyScores | null>;
  evalDir: string;
  now: () => Date;
  pilotDir: string;
  /** Null when the database is not configured. */
  pilotMetrics: () => Promise<ReviewMetrics | null>;
  promptVersion: () => string;
}

/**
 * A stable, path-free reason for an unreadable file set, safe to show in the report. The raw
 * error (which may name server paths) goes to the server log only.
 */
const unreadableReason = (label: string, error: unknown): string => {
  console.error(`[signal] proof report: ${label} unreadable`, error);
  if (error instanceof SyntaxError) return "a file is not valid JSON.";
  if (error instanceof ZodError) return "a file does not match its expected shape.";
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "ENOENT") return "a file is missing from this deployment.";
  if (code === "EACCES" || code === "EPERM") return "a file cannot be opened on this deployment.";
  return "they could not be read; check the server log.";
};

const readPilot = (dir: string): { labels: AnswerKeyLabels | null; state: PilotFilesState } => {
  try {
    const files = readPilotFiles(dir);
    const lock = readPilotLock(dir);
    const status = checkPilotReady(files, lock);
    return {
      labels: answerKeyLabels(files),
      state: {
        backlogRequests: status.counts.featureRequests,
        changed: status.changed,
        expectedBacklogDuplicateRate:
          lock?.expectedBacklogDuplicateRate ?? files.manifest.expectedBacklogDuplicateRate,
        feedback: status.counts.feedback,
        frozen: status.frozen,
        frozenAt: lock?.frozenAt ?? null,
        frozenFeedback: lock?.feedback ?? null,
        messages: status.messages,
        readable: true,
        ready: status.ready,
        unconfirmed: status.counts.unconfirmed,
      },
    };
  } catch (error) {
    return {
      labels: null,
      state: { message: unreadableReason("pilot files", error), readable: false },
    };
  }
};

const readV2 = (dir: string) => {
  try {
    const pairs = loadHeldOutV2(dir);
    const lock = readV2Lock(dir);
    const ready = checkV2Ready(pairs, lock);
    const state: HeldOutV2State = {
      changed: !ready.ok && ready.code === "changed_after_freeze",
      frozen: lock !== null,
      frozenAt: lock?.frozenAt ?? null,
      message: ready.ok ? null : ready.message,
      pairs: pairs.length,
      readable: true,
      sameNeedPositives: pairs.filter((p) => p.expected === "same_need").length,
      unconfirmed: unconfirmedPairs(pairs).length,
    };
    return { lock, state };
  } catch (error) {
    return {
      lock: null,
      state: { message: unreadableReason("Held-Out Set v2", error), readable: false } as const,
    };
  }
};

const toRun = (entry: RunLogEntry | null): V2Run | null => {
  if (!entry) return null;
  const { readings } = entry;
  return {
    at: entry.at,
    failures: readings?.failures ?? entry.counts.failures,
    promptVersion: entry.promptVersion,
    relatedNeed: readings
      ? {
          predicted: readings.relatedNeed.predicted,
          truePositives: readings.relatedNeed.truePositives,
        }
      : null,
    sameNeed: readings
      ? { predicted: readings.sameNeed.predicted, truePositives: readings.sameNeed.truePositives }
      : null,
    sameNeedPositives: readings?.sameNeedPositives ?? entry.counts.sameNeedPositives,
    status: entry.status === "completed" ? "completed" : "failed",
  };
};

const safely = async <T>(label: string, run: () => Promise<T>): Promise<T | Error> => {
  try {
    return await run();
  } catch (error) {
    console.error(`[signal] proof report: ${label} failed`, error);
    return error instanceof Error ? error : new Error(String(error));
  }
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
  const pilot = readPilot(deps.pilotDir);
  const v2 = readV2(deps.evalDir);
  let entries: RunLogEntry[] = [];
  try {
    entries = readRunLog(deps.evalDir);
  } catch (error) {
    console.error("[signal] proof report: run log unreadable", error);
  }
  const promptVersion = tryPromptVersion(deps.promptVersion);
  const { labels } = pilot;

  const [metrics, scores] = await Promise.all([
    safely("pilot metrics", deps.pilotMetrics),
    labels ? safely("Answer Key scoring", () => deps.answerKeyScores(labels)) : null,
  ]);

  return {
    answerKeyScores: scores instanceof Error ? null : scores,
    generatedAt: deps.now().toISOString(),
    heldOutV2: v2.state,
    pilotFiles: pilot.state,
    pilotMetrics: metrics instanceof Error ? null : metrics,
    pilotMetricsError: metricsErrorOf(metrics),
    promptVersion,
    v2LatestReading: toRun(currentV2Reading(entries, v2.lock)),
    v2Reading: promptVersion
      ? toRun(
          currentV2Reading(
            entries.filter((e) => e.promptVersion === promptVersion),
            v2.lock,
          ),
        )
      : null,
  };
};

export const runtimeProofDeps = (): ProofSourceDeps => ({
  answerKeyScores: async (labels) => {
    const db = getDb();
    if (!db) return null;
    return await createAnswerKeyScoring({ answerKey: labels, repo: createRepository(db) }).score();
  },
  evalDir: evalDir(),
  now: () => new Date(),
  pilotDir: pilotDir(),
  pilotMetrics: async () => {
    const service = getReviewService(PILOT_ORIGIN);
    return service ? await service.metrics({ origin: PILOT_ORIGIN }) : null;
  },
  promptVersion: () => currentPromptVersion().id,
});

/** The Proof Report for this deployment. Callers enforce access (Pilot Key or Operator) first. */
export const getProofReport = async (
  deps: ProofSourceDeps = runtimeProofDeps(),
): Promise<ProofReport> => buildProofReport(await loadProofInputs(deps));
