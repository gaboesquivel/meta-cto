import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { judgeModelId, judgeOutputSchema } from "@/lib/signal/agent";
import { buildJudgePrompt, JUDGE_SYSTEM } from "@/lib/signal/agent/prompt";

import type { ExpectedVerdict, PredictedVerdict } from "./metrics";
import { evalDir } from "./paths";
import type { V2Readings } from "./readings";

/** Append-only log of every eval run, one JSON object per line. Commit it with the reports. */
export const RUN_LOG_FILE = "runs.jsonl";

export interface PromptConfig {
  model: string;
  outputSchema: string;
  system: string;
  /** The user prompt rendered for a fixed sample, so template changes count. */
  userTemplate: string;
}

/** Short hash of everything that shapes a Verdict on the judge's side. */
export const promptVersion = (config: PromptConfig): string =>
  `pv-${createHash("sha256")
    .update(JSON.stringify([config.system, config.userTemplate, config.outputSchema, config.model]))
    .digest("hex")
    .slice(0, 12)}`;

/** The model a Check would use: the gateway judge model, else the direct Anthropic fallback. */
const effectiveModel = (): string => {
  if (process.env.AI_GATEWAY_API_KEY?.trim()) return judgeModelId();
  return `direct:${process.env.CHAT_MODEL?.trim() || "default-chat-model"}`;
};

/** Read-only view of the judge in `lib/signal/agent`: its prompt version and model id. */
export const currentPromptVersion = (): { id: string; model: string } => {
  const model = effectiveModel();
  const userTemplate = buildJudgePrompt({
    candidates: [
      {
        description: "candidate",
        featureRequestId: "fr",
        title: "candidate",
        underlyingNeed: null,
      },
    ],
    draft: { description: "draft", title: "draft" },
  });
  const outputSchema = JSON.stringify(z.toJSONSchema(judgeOutputSchema));
  return { id: promptVersion({ model, outputSchema, system: JUDGE_SYSTEM, userTemplate }), model };
};

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

/**
 * A run is a repeat when an earlier run (completed or failed, not refused) used the same set,
 * fingerprint and prompt version. Failed runs count: they already showed the set to that prompt.
 */
export const isRepeatRun = (
  entries: Pick<RunLogEntry, "fingerprint" | "promptVersion" | "set" | "status">[],
  key: { fingerprint: string; promptVersion: string; set: string },
): boolean =>
  entries.some(
    (e) =>
      e.status !== "refused" &&
      e.set === key.set &&
      e.fingerprint === key.fingerprint &&
      e.promptVersion === key.promptVersion,
  );

/**
 * The reading the Proof Report shows: the latest non-repeat, non-refused v2 run on the frozen
 * fingerprint. Null when there is none, or when the set changed after freeze (reading reset).
 */
export const currentV2Reading = (
  entries: RunLogEntry[],
  lock: { fingerprint: string } | null,
): RunLogEntry | null => {
  if (!lock) return null;
  const readings = entries.filter(
    (e) =>
      e.set === "held-out-v2" &&
      e.status !== "refused" &&
      !e.repeat &&
      e.fingerprint === lock.fingerprint,
  );
  return readings.at(-1) ?? null;
};
