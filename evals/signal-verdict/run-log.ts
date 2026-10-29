import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { ExpectedVerdict, PredictedVerdict } from "./metrics";
import { evalDir } from "./paths";
import type { V2Readings } from "./readings";

/** Append-only log of every eval run, one JSON object per line. Commit it with the reports. */
export const RUN_LOG_FILE = "runs.jsonl";

export { currentPromptVersion, promptVersion } from "./prompt-version";
export type { PromptConfig } from "./prompt-version";

export type RunStatus = "completed" | "failed" | "refused";

export interface RunLogEntry {
  at: string;
  counts: { completed: number; failures: number; pairs: number; sameNeedPositives: number };
  failures: { error: string; id: string }[];
  /** SHA-256 of the set as run; null when the set could not be read. */
  fingerprint: string | null;
  /** Refusal or run error. */
  message?: string;
  model: string;
  promptVersion: string;
  readings?: V2Readings;
  /** Held-Out Set v2 only: an earlier run on the same set and prompt version exists. */
  repeat: boolean;
  results: { expected: ExpectedVerdict; id: string; predicted: PredictedVerdict }[];
  set: string;
  status: RunStatus;
}

const entryKeySchema = z
  .object({
    counts: z.object({ completed: z.number(), failures: z.number() }).loose(),
    fingerprint: z.string().nullable(),
    promptVersion: z.string(),
    set: z.string(),
    status: z.enum(["completed", "failed", "refused"]),
  })
  .loose();

export const readRunLog = (dir = evalDir()): RunLogEntry[] => {
  const file = path.join(dir, RUN_LOG_FILE);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf-8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => entryKeySchema.parse(JSON.parse(line)) as unknown as RunLogEntry);
};

export const appendRunLog = (entry: RunLogEntry, dir = evalDir()): void => {
  appendFileSync(path.join(dir, RUN_LOG_FILE), `${JSON.stringify(entry)}\n`, "utf-8");
};

type RunKey = Pick<RunLogEntry, "counts" | "fingerprint" | "promptVersion" | "set" | "status">;

/**
 * Whether any pair reached the Check (and so the judge). A run that failed before that — service
 * unavailable, a target that would not resolve — is logged as failed with nothing completed or
 * failed, and never counts as a reading or makes a later run a repeat.
 */
export const judgedPairs = (entry: Pick<RunLogEntry, "counts" | "status">): boolean =>
  entry.status !== "refused" && entry.counts.completed + entry.counts.failures > 0;

/**
 * A run is a repeat when an earlier run that judged pairs (completed or failed mid-run) used the
 * same set, fingerprint and prompt version. Failed runs count once pairs were judged: they
 * already showed the set to that prompt.
 */
export const isRepeatRun = (
  entries: RunKey[],
  key: { fingerprint: string; promptVersion: string; set: string },
): boolean =>
  entries.some(
    (e) =>
      judgedPairs(e) &&
      e.set === key.set &&
      e.fingerprint === key.fingerprint &&
      e.promptVersion === key.promptVersion,
  );

/**
 * The reading the Proof Report shows: the latest non-repeat v2 run on the frozen fingerprint that
 * judged pairs. Null when there is none, or when the set changed after freeze (reading reset).
 */
export const currentV2Reading = (
  entries: RunLogEntry[],
  lock: { fingerprint: string } | null,
): RunLogEntry | null => {
  if (!lock) return null;
  const readings = entries.filter(
    (e) =>
      e.set === "held-out-v2" && judgedPairs(e) && !e.repeat && e.fingerprint === lock.fingerprint,
  );
  return readings.at(-1) ?? null;
};
