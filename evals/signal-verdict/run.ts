import { writeFileSync } from "node:fs";
import path from "node:path";

import { seedFeatureRequests } from "@/data/crewday/seed";
import { loadRootEnv } from "@/lib/env";
import type { SignalService } from "@/lib/signal/contracts";
import { getSignalService } from "@/lib/signal/runtime";

import { computeMetrics, formatRate, KILL_LINE } from "./metrics";
import type { EvalMetrics, PredictedVerdict } from "./metrics";
import { loadEvalSet } from "./sets";
import type { EvalPair, EvalSetName } from "./sets";

const CONCURRENCY = 3;

interface PairResult {
  pair: EvalPair;
  predicted: PredictedVerdict;
  reason: string | null;
}

const parseSet = (argv: string[]): EvalSetName => {
  const index = argv.indexOf("--set");
  const value = index === -1 ? "held-out" : argv[index + 1];
  if (value === "dev" || value === "held-out") return value;
  throw new Error(`Unknown --set "${value}". Use --set dev or --set held-out.`);
};

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
  service: SignalService,
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

const runPair = async (
  service: SignalService,
  targetId: string,
  pair: EvalPair,
): Promise<PairResult> => {
  const result = await service.check({ actor: { name: "eval", type: "agent" }, draft: pair.draft });
  const candidate = result.candidates.find((c) => c.featureRequestId === targetId);
  return {
    pair,
    predicted: candidate ? candidate.verdict : "absent",
    reason: candidate ? candidate.reason : null,
  };
};

const tableRows = (results: PairResult[]): string[] =>
  results.map(({ pair, predicted }) => {
    const mark = pair.expected === predicted ? "ok" : "MISS";
    return `| ${pair.id} | ${pair.target} | ${pair.expected} | ${predicted} | ${mark} |`;
  });

const summaryLines = (metrics: EvalMetrics): string[] => {
  const { relatedNeed, sameNeed } = metrics;
  let killLine = "Kill line: no same_need predictions, precision undefined.";
  if (metrics.belowKillLine === true) killLine = `Kill line: BELOW ${KILL_LINE * 100}%.`;
  if (metrics.belowKillLine === false) killLine = `Kill line: at or above ${KILL_LINE * 100}%.`;
  return [
    `- Pairs: ${metrics.total} (exact matches ${metrics.exactMatches}, absent ${metrics.absent}, unknown ${metrics.unknown})`,
    `- Same-Need Precision: ${formatRate(sameNeed.precision)} (${sameNeed.truePositives}/${sameNeed.predicted} predicted same_need)`,
    `- Same-Need Recall: ${formatRate(sameNeed.recall)} (${sameNeed.truePositives}/${sameNeed.expected} expected same_need)`,
    `- Related-Need Precision: ${formatRate(relatedNeed.precision)} (${relatedNeed.truePositives}/${relatedNeed.predicted} predicted related_need)`,
    `- ${killLine} About 25 pairs is a first reading, not a verdict.`,
  ];
};

const report = (set: EvalSetName, results: PairResult[], metrics: EvalMetrics): string =>
  [
    `# Signal verdict eval: ${set}`,
    "",
    `Run: ${new Date().toISOString()}`,
    "",
    ...summaryLines(metrics),
    "",
    "| id | target | expected | predicted | |",
    "| --- | --- | --- | --- | --- |",
    ...tableRows(results),
    "",
  ].join("\n");

const main = async () => {
  loadRootEnv();
  const set = parseSet(process.argv.slice(2));
  const service = getSignalService();
  if (!service) {
    console.error(
      "Signal service unavailable: configure DATABASE_URL and AI keys (.env.local) and seed the Crewday Demo Workspace.",
    );
    process.exit(1);
  }
  const pairs = loadEvalSet(set);
  const ids = await resolveTargets(
    service,
    pairs.map((p) => p.target),
  );
  const results = await mapLimit(pairs, CONCURRENCY, (pair) =>
    runPair(service, ids.get(pair.target) ?? "", pair),
  );
  const metrics = computeMetrics(
    results.map(({ pair, predicted }) => ({ expected: pair.expected, predicted })),
  );
  const markdown = report(set, results, metrics);
  console.log(markdown);
  const file = set === "held-out" ? "report.md" : "report.dev.md";
  writeFileSync(path.join(import.meta.dirname, file), markdown, "utf-8");
  console.log(`Wrote evals/signal-verdict/${file}`);
};

await main();
