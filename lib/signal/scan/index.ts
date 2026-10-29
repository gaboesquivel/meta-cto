import { setTimeout as sleep } from "node:timers/promises";

import type { Judge, JudgeOutput, ScanOptions, ScanResult } from "../contracts";
import { CANDIDATE_POOL, scanOptionsSchema } from "../contracts";
import { orderedPair } from "../repository";
import type { FeatureRequestRow, SignalRepository } from "../repository";
import { DEFAULT_JUDGE_TIMEOUT_MS, parseInput } from "../service/context";

export const DEFAULT_SCAN_LIMIT = 20;
/** Feature Requests judged at once; bounds cost and rate-limit pressure. */
export const SCAN_CONCURRENCY = 2;
/** Most Feature Requests one REST scan call may take, so it fits one serverless function run. */
export const REST_SCAN_LIMIT = 50;
/**
 * Elapsed time after which a scan call starts no new Feature Requests (the scan route's
 * `maxDuration` is 300 s; in-flight judgments still finish).
 */
export const DEFAULT_SCAN_DEADLINE_MS = 240_000;

export interface BacklogScanDeps {
  /** Stop starting new rows once this much time has elapsed in one scan call (default 240 s). */
  deadlineMs?: number;
  judge: Judge;
  judgeTimeoutMs?: number;
  /** The judge's model id, stored on each Suspected Duplicate for provenance. */
  model?: string | null;
  now?: () => Date;
  repo: SignalRepository;
  workspaceId: string;
}

export interface BacklogScan {
  scan: (options?: ScanOptions) => Promise<ScanResult>;
}

/** Runs `task` over `items` with at most `concurrency` in flight, in order of start. */
export const runPool = async <T>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<void>,
): Promise<void> => {
  let next = 0;
  const worker = async (): Promise<void> => {
    const item = items[next];
    if (next >= items.length || item === undefined) return;
    next += 1;
    await task(item);
    await worker();
  };
  const workers = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
};

/** Runs the judge with a deadline; null on error or timeout so the row stays unscanned. */
const judgeWithTimeout = async (
  judge: Judge,
  timeoutMs: number,
  input: Parameters<Judge["judge"]>[0],
): Promise<JudgeOutput | null> => {
  const controller = new AbortController();
  const timeout = sleep(timeoutMs, null, { signal: controller.signal });
  try {
    return await Promise.race([judge.judge(input), timeout]);
  } catch {
    return null;
  } finally {
    controller.abort();
    timeout.catch(() => null);
  }
};

const sameNeedJudgments = (output: JudgeOutput, candidateIds: Set<string>) =>
  output.judgments.filter(
    (judgment) =>
      judgment.verdict === "same_need" &&
      judgment.reason.trim().length > 0 &&
      candidateIds.has(judgment.featureRequestId),
  );

/**
 * The backlog scan (spec 002): finds Suspected Duplicates among existing open Feature Requests
 * with the spec 001 judge, Same Need only, once per Feature Request. An explicit Operator action;
 * never run in a build or deploy.
 */
export const createBacklogScan = (deps: BacklogScanDeps): BacklogScan => {
  const now = deps.now ?? (() => new Date());
  const timeoutMs = deps.judgeTimeoutMs ?? DEFAULT_JUDGE_TIMEOUT_MS;
  const deadlineMs = deps.deadlineMs ?? DEFAULT_SCAN_DEADLINE_MS;

  /** Judges one Feature Request against its open neighbors; returns newly stored pair keys, or null on judge failure. */
  const scanOne = async (row: FeatureRequestRow): Promise<string[] | null> => {
    const neighbors = await deps.repo.nearestFeatureRequests({
      embedding: row.embedding ?? [],
      limit: CANDIDATE_POOL + 1,
      openOnly: true,
      workspaceId: deps.workspaceId,
    });
    const pool = neighbors.filter((other) => other.id !== row.id).slice(0, CANDIDATE_POOL);
    if (pool.length === 0) return [];
    const output = await judgeWithTimeout(deps.judge, timeoutMs, {
      candidates: pool.map((other) => ({
        description: other.description,
        featureRequestId: other.id,
        title: other.title,
        underlyingNeed: other.underlyingNeed,
      })),
      draft: { description: row.description, title: row.title },
    });
    if (!output) return null;
    const judgedAt = now();
    const stored = await Promise.all(
      sameNeedJudgments(output, new Set(pool.map((other) => other.id))).map(async (judgment) => {
        const saved = await deps.repo.upsertSuspectedDuplicate({
          a: row.id,
          b: judgment.featureRequestId,
          judgedAt,
          model: deps.model ?? null,
          reason: judgment.reason.trim(),
          source: "scan",
          workspaceId: deps.workspaceId,
        });
        const fresh =
          saved.source === "scan" &&
          saved.reason === judgment.reason.trim() &&
          saved.judgedAt.getTime() === judgedAt.getTime();
        return fresh ? orderedPair(row.id, judgment.featureRequestId).join(":") : null;
      }),
    );
    return stored.filter((key): key is string => key !== null);
  };

  return {
    scan: async (options) => {
      const { limit = DEFAULT_SCAN_LIMIT } = parseInput(scanOptionsSchema, options ?? {});
      const rows = await deps.repo.listUnscannedFeatureRequests({
        limit,
        workspaceId: deps.workspaceId,
      });
      const pairs = new Set<string>();
      let scanned = 0;
      const startedAt = now().getTime();
      await runPool(rows, SCAN_CONCURRENCY, async (row) => {
        // Past the deadline the row stays unscanned and counts as remaining.
        if (now().getTime() - startedAt >= deadlineMs) return;
        const found = await scanOne(row);
        if (!found) return;
        for (const key of found) pairs.add(key);
        await deps.repo.markScanned([row.id], now());
        scanned += 1;
      });
      const remaining = await deps.repo.countUnscannedFeatureRequests(deps.workspaceId);
      return { pairsFound: pairs.size, remaining, scanned };
    },
  };
};
