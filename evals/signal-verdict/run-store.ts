import type { SignalRepository } from "@/lib/signal/repository";

import type { RunLogEntry } from "./run-log";

/**
 * Where eval runs are recorded (spec 004, decision 0004): the database, replacing the committed
 * run log. Every Held-Out Set v2 run is recorded here, refusals and failures included.
 */
export interface EvalRunStore {
  /** An earlier run on this set, fingerprint and prompt version judged pairs (a repeat). */
  hasJudgedRun: (key: {
    fingerprint: string;
    promptVersion: string;
    set: string;
  }) => Promise<boolean>;
  record: (entry: RunLogEntry) => Promise<void>;
}

/** The run as stored: counts, readings and per-pair Verdicts by pair id; Origin `eval`. */
export const toNewEvalRun = (entry: RunLogEntry) => ({
  completed: entry.counts.completed,
  createdAt: new Date(entry.at),
  failureDetails: entry.failures,
  failures: entry.counts.failures,
  fingerprint: entry.fingerprint,
  message: entry.message ?? null,
  model: entry.model,
  pairs: entry.counts.pairs,
  promptVersion: entry.promptVersion,
  readings: entry.readings ?? null,
  repeat: entry.repeat,
  results: entry.results,
  sameNeedPositives: entry.counts.sameNeedPositives,
  setName: entry.set,
  status: entry.status,
});

export const repositoryRunStore = (
  repo: Pick<SignalRepository, "hasJudgedEvalRun" | "recordEvalRun">,
): EvalRunStore => ({
  hasJudgedRun: (key) =>
    repo.hasJudgedEvalRun({
      fingerprint: key.fingerprint,
      promptVersion: key.promptVersion,
      setName: key.set,
    }),
  record: async (entry) => {
    await repo.recordEvalRun(toNewEvalRun(entry));
  },
});
