import { writeFileSync } from "node:fs";
import path from "node:path";

import { seedFeatureRequests } from "@/data/crewday/seed";
import type { SignalService } from "@/lib/signal/contracts";

import {
  checkV2Ready,
  fingerprintPairs,
  loadHeldOutV2,
  readV2Lock,
  V2_SET_NAME,
} from "./held-out-v2";
import { computeMetrics, formatRate, isCorrect, KILL_LINE } from "./metrics";
import { evalDir } from "./paths";
import type { EvalMetrics, PredictedVerdict } from "./metrics";
import { v2Readings } from "./readings";
import type { BarReading, V2Readings } from "./readings";
import { appendRunLog, currentPromptVersion } from "./run-log";
import type { RunLogEntry, RunStatus } from "./run-log";
import type { EvalRunStore } from "./run-store";
import { loadEvalSet } from "./sets";
import type { EvalPair, EvalSetName } from "./sets";

const CONCURRENCY = 3;

export type EvalService = Pick<SignalService, "check" | "search">;
export type RunSetName = EvalSetName | typeof V2_SET_NAME;

interface PairResult {
  error: string | null;
  pair: EvalPair;
  predicted: PredictedVerdict;
  reason: string | null;
}

const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const worker = async (): Promise<void> => {
    const index = next;
    next += 1;
    const item = items[index];
    if (index >= items.length || item === undefined) return;
    results[index] = await fn(item);
    await worker();
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
};

/** Seed key → Feature Request id, by exact title match among search results. */
const resolveTargets = async (
  service: EvalService,
  keys: string[],
): Promise<Map<string, string>> => {
  const ids = new Map<string, string>();
  const entries = await mapLimit([...new Set(keys)], CONCURRENCY, async (key) => {
    const seed = seedFeatureRequests.find((fr) => fr.key === key);
    if (!seed) throw new Error(`Target "${key}" is not a seeded Feature Request.`);
    const { items } = await service.search({ limit: 5, q: seed.title });
    const match = items.find((item) => item.title === seed.title);
    if (!match) throw new Error(`Seeded Feature Request "${seed.title}" not found. Seed the DB.`);
    return [key, match.id] as const;
  });
  for (const [key, id] of entries) ids.set(key, id);
  return ids;
};

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A thrown Check scores as `unknown` and is recorded as a failure; so is a degraded Check. */
const runPair = async (
  service: EvalService,
  targetId: string,
  pair: EvalPair,
): Promise<PairResult> => {
  try {
    const result = await service.check({
      actor: { name: "eval", type: "agent" },
      draft: pair.draft,
    });
    const candidate = result.candidates.find((c) => c.featureRequestId === targetId);
    return {
      error: result.degraded ? "degraded Check: the judge did not answer" : null,
      pair,
      predicted: candidate ? candidate.verdict : "absent",
      reason: candidate ? candidate.reason : null,
    };
  } catch (error) {
    return { error: errorText(error), pair, predicted: "unknown", reason: null };
  }
};

const tableRows = (results: PairResult[]): string[] =>
  results.map(({ pair, predicted }) => {
    const mark = isCorrect({ expected: pair.expected, predicted }) ? "ok" : "MISS";
    return `| ${pair.id} | ${pair.target} | ${pair.expected} | ${predicted} | ${mark} |`;
  });

const table = (results: PairResult[]): string[] => [
  "| id | target | expected | predicted | |",
  "| --- | --- | --- | --- | --- |",
  ...tableRows(results),
];

const summaryLines = (metrics: EvalMetrics): string[] => {
  const { relatedNeed, sameNeed } = metrics;
  let killLine = "Kill line: no same_need predictions, precision undefined.";
  if (metrics.belowKillLine === true) killLine = `Kill line: BELOW ${KILL_LINE * 100}%.`;
  if (metrics.belowKillLine === false) killLine = `Kill line: at or above ${KILL_LINE * 100}%.`;
  return [
    `- Pairs: ${metrics.total} (correct ${metrics.exactMatches}, absent ${metrics.absent}, unknown ${metrics.unknown})`,
    `- Same-Need Precision: ${formatRate(sameNeed.precision)} (${sameNeed.truePositives}/${sameNeed.predicted} predicted same_need)`,
    `- Same-Need Recall: ${formatRate(sameNeed.recall)} (${sameNeed.truePositives}/${sameNeed.expected} expected same_need)`,
    `- Related-Need Precision: ${formatRate(relatedNeed.precision)} (${relatedNeed.truePositives}/${relatedNeed.predicted} predicted related_need)`,
    `- ${killLine} About 25 pairs is a first reading, not a verdict.`,
  ];
};

/** v1 and Dev Set report, unchanged from spec 001. */
const v1Report = (
  set: EvalSetName,
  at: Date,
  results: PairResult[],
  metrics: EvalMetrics,
): string =>
  [
    `# Signal verdict eval: ${set}`,
    "",
    `Run: ${at.toISOString()}`,
    "",
    ...summaryLines(metrics),
    "",
    ...table(results),
    "",
  ].join("\n");

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

const barLine = (name: string, verdictName: string, reading: BarReading): string => {
  const interval = reading.interval
    ? ` (95% CI ${pct(reading.interval.lower)}–${pct(reading.interval.upper)})`
    : "";
  return `- ${name}: ${formatRate(reading.point)}${interval}, ${reading.truePositives}/${reading.predicted} predicted ${verdictName}. Bar ≥ ${pct(reading.bar)}: ${reading.verdict}`;
};

const v2Report = (input: {
  at: Date;
  entry: RunLogEntry;
  metrics: EvalMetrics;
  readings: V2Readings;
  results: PairResult[];
}): string => {
  const { entry, metrics, readings } = input;
  const failures = entry.failures.map((f) => `  - ${f.id}: ${f.error}`);
  return [
    `# Signal verdict eval: ${V2_SET_NAME}`,
    "",
    `Run: ${input.at.toISOString()}`,
    `Set fingerprint: ${entry.fingerprint}`,
    `Prompt version: ${entry.promptVersion} (model ${entry.model})`,
    ...(entry.repeat
      ? ["", "**Repeat run, not a new reading.** This prompt version already ran this set."]
      : []),
    "",
    `- Pairs: ${metrics.total} (correct ${metrics.exactMatches}, absent ${metrics.absent}, unknown ${metrics.unknown}, failures ${readings.failures})`,
    `- Same-need positives: ${readings.sameNeedPositives} (minimum ${readings.minPositives}: ${readings.enoughPositives ? "met" : "NOT met, readings inconclusive"})`,
    barLine("Same-Need Precision", "same_need", readings.sameNeed),
    barLine("Related-Need Precision", "related_need", readings.relatedNeed),
    `- Same-Need Recall: ${formatRate(metrics.sameNeed.recall)} (${metrics.sameNeed.truePositives}/${metrics.sameNeed.expected} expected same_need)`,
    ...(failures.length > 0
      ? ["- Failed pairs (run incomplete, readings inconclusive):", ...failures]
      : []),
    "",
    ...table(input.results),
    "",
  ].join("\n");
};

export interface RunEvalOptions {
  /**
   * Holds the v2 lock (committed) and receives the reports; v1 and Dev Set runs also go to its
   * local, gitignored `runs.jsonl`.
   */
  dir?: string;
  /** Called only after the set passes its gate, so a refused v2 never builds a service. */
  getService: () => Promise<EvalService | null>;
  now?: () => Date;
  prompt?: { id: string; model: string };
  set: RunSetName;
  /**
   * Holds the v2 pairs (`held-out-v2.json`): the private folder's `evals/` from the CLI
   * (spec 004). Defaults to `dir`.
   */
  setDir?: string;
  /**
   * The database record of runs (spec 004). Required for Held-Out Set v2, whose runs are only
   * recorded there; v1 and Dev Set runs are recorded there too when given.
   */
  store?: EvalRunStore;
}

export interface RunEvalOutcome {
  entry: RunLogEntry;
  message: string;
  report: string | null;
  reportFile: string | null;
  status: RunStatus;
}

const reportFileFor = (set: RunSetName, repeat: boolean): string => {
  if (set === V2_SET_NAME) return repeat ? "report.v2.repeat.md" : "report.v2.md";
  return set === "held-out" ? "report.md" : "report.dev.md";
};

const V2_NEEDS_DATABASE =
  "Refusing: Held-Out Set v2 runs are recorded in the database. Set DATABASE_URL to the database the Proof Report reads.";

/** Whether an earlier run judged this set at this fingerprint and prompt version (a repeat). */
const hasJudgedRun = async (
  store: EvalRunStore | undefined,
  key: { fingerprint: string | null; prompt: { id: string }; set: string },
): Promise<boolean> =>
  store
    ? await store.hasJudgedRun({
        fingerprint: key.fingerprint ?? "",
        promptVersion: key.prompt.id,
        set: key.set,
      })
    : false;

/** A refusal with nowhere to record it: nothing is written. */
const unrecordedRefusal = (base: RunLogEntry, message: string): RunEvalOutcome => ({
  entry: { ...base, message },
  message,
  report: null,
  reportFile: null,
  status: "refused",
});

/**
 * Runs one Eval Set through the Check and records the run, including refusals and failures: in
 * the database (`store`), and for v1 and the Dev Set also in the local run log. Held-Out Set v2
 * must be confirmed and frozen and needs the database; a repeat on the same prompt version is
 * flagged and never overwrites the reading's report.
 */
export const runEval = async (options: RunEvalOptions): Promise<RunEvalOutcome> => {
  const dir = options.dir ?? evalDir();
  const setDir = options.setDir ?? dir;
  const at = (options.now ?? (() => new Date()))();
  const prompt = options.prompt ?? currentPromptVersion();
  const isV2 = options.set === V2_SET_NAME;
  const v2Pairs = isV2 ? loadHeldOutV2(setDir) : null;
  const pairs: EvalPair[] = v2Pairs ?? loadEvalSet(options.set as EvalSetName);
  const base: RunLogEntry = {
    at: at.toISOString(),
    counts: {
      completed: 0,
      failures: 0,
      pairs: pairs.length,
      sameNeedPositives: pairs.filter((p) => p.expected === "same_need").length,
    },
    failures: [],
    fingerprint: fingerprintPairs(pairs),
    model: prompt.model,
    promptVersion: prompt.id,
    repeat: false,
    results: [],
    set: options.set,
    status: "refused",
  };
  const { store } = options;
  /** v2 runs live only in the database; v1 and Dev Set runs also keep the local log. */
  const record = async (entry: RunLogEntry) => {
    if (!isV2) appendRunLog(entry, dir);
    if (store) await store.record(entry);
  };
  const stop = async (status: RunStatus, message: string): Promise<RunEvalOutcome> => {
    const entry = { ...base, message, status };
    await record(entry);
    return { entry, message, report: null, reportFile: null, status };
  };

  if (isV2 && !store) return unrecordedRefusal(base, V2_NEEDS_DATABASE);
  if (v2Pairs) {
    const ready = checkV2Ready(v2Pairs, readV2Lock(dir));
    if (!ready.ok) return await stop("refused", ready.message);
  }
  const repeat =
    isV2 &&
    (await hasJudgedRun(store, { fingerprint: base.fingerprint, prompt, set: options.set }));

  // A failure before any pair reaches the Check is logged as failed with nothing completed: it is
  // never a reading and never makes the next run a repeat (see `judgedPairs`).
  let results: PairResult[];
  try {
    const service = await options.getService();
    if (!service) {
      return await stop(
        "failed",
        "Failed before any pair was judged: Signal service unavailable. Configure DATABASE_URL and AI keys (.env.local) and seed the Crewday Demo Workspace.",
      );
    }
    const ids = await resolveTargets(
      service,
      pairs.map((p) => p.target),
    );
    results = await mapLimit(pairs, CONCURRENCY, (pair) =>
      runPair(service, ids.get(pair.target) ?? "", pair),
    );
  } catch (error) {
    return await stop("failed", `Failed before any pair was judged: ${errorText(error)}`);
  }

  const failures = results.flatMap((r) => (r.error ? [{ error: r.error, id: r.pair.id }] : []));
  const metrics = computeMetrics(
    results.map(({ pair, predicted }) => ({ expected: pair.expected, predicted })),
  );
  const status: RunStatus = failures.length > 0 ? "failed" : "completed";
  const readings = isV2 ? v2Readings({ failures: failures.length, metrics }) : undefined;
  const entry: RunLogEntry = {
    ...base,
    counts: {
      ...base.counts,
      completed: results.length - failures.length,
      failures: failures.length,
    },
    failures,
    ...(readings ? { readings } : {}),
    repeat,
    results: results.map(({ pair, predicted }) => ({
      expected: pair.expected,
      id: pair.id,
      predicted,
    })),
    status,
  };
  const report = readings
    ? v2Report({ at, entry, metrics, readings, results })
    : v1Report(options.set as EvalSetName, at, results, metrics);
  const reportFile = reportFileFor(options.set, repeat);
  writeFileSync(path.join(dir, reportFile), report, "utf-8");
  await record(entry);
  const message = repeat ? "Repeat run, not a new reading." : `Run ${status}.`;
  return { entry, message, report, reportFile, status };
};
