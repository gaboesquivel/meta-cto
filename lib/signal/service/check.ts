import { setTimeout as sleep } from "node:timers/promises";

import type { Candidate, CheckInput, CheckResult, JudgeOutput, NextAction } from "../contracts";
import {
  CANDIDATE_POOL,
  CHECK_TTL_MINUTES,
  MAX_RELATED_NEED,
  MAX_SAME_NEED,
  checkInputSchema,
} from "../contracts";
import type { FeatureRequestRow } from "../repository";
import type { ServiceContext } from "./context";
import { draftHash, draftText, embedOrUnavailable, parseInput } from "./context";

const DEGRADED_CANDIDATES = 5;

/** Runs the judge with a deadline; null on error or timeout so the caller degrades. */
const judgeWithTimeout = async (
  context: ServiceContext,
  input: Parameters<ServiceContext["judge"]["judge"]>[0],
): Promise<JudgeOutput | null> => {
  const controller = new AbortController();
  const timeout = sleep(context.judgeTimeoutMs, null, { signal: controller.signal });
  try {
    return await Promise.race([context.judge.judge(input), timeout]);
  } catch {
    // Any judge failure (error, schema, abort) degrades; never fabricate a verdict.
    return null;
  } finally {
    controller.abort();
    // The aborted sleep rejects; swallow it so it is not an unhandled rejection.
    timeout.catch(() => null);
  }
};

type Judgment = JudgeOutput["judgments"][number];

const isUsable = (judgment: Judgment) => {
  if (judgment.verdict === "different") return false;
  if (!judgment.reason.trim()) return false;
  return judgment.verdict !== "related_need" || Boolean(judgment.sharedDimension?.trim());
};

/** Applies caps in retrieval order and drops `different` and incomplete verdicts. */
const selectCandidates = (pool: FeatureRequestRow[], output: JudgeOutput): Candidate[] => {
  const byId = new Map(output.judgments.map((judgment) => [judgment.featureRequestId, judgment]));
  const limits = { related_need: MAX_RELATED_NEED, same_need: MAX_SAME_NEED };
  const taken = { related_need: 0, same_need: 0 };
  const candidates: Candidate[] = [];
  for (const row of pool) {
    const judgment = byId.get(row.id);
    if (!judgment || !isUsable(judgment)) continue;
    const verdict = judgment.verdict as "related_need" | "same_need";
    if (taken[verdict] >= limits[verdict]) continue;
    taken[verdict] += 1;
    candidates.push({
      featureRequestId: row.id,
      reason: judgment.reason,
      sharedDimension: verdict === "related_need" ? (judgment.sharedDimension ?? null) : null,
      title: row.title,
      verdict,
    });
  }
  return candidates;
};

const degradedCandidates = (pool: FeatureRequestRow[]): Candidate[] =>
  pool.slice(0, DEGRADED_CANDIDATES).map((row) => ({
    featureRequestId: row.id,
    reason: null,
    sharedDimension: null,
    title: row.title,
    verdict: "unknown",
  }));

export const nextActionFor = (candidates: Candidate[]): NextAction => {
  if (candidates.some((candidate) => candidate.verdict === "same_need")) {
    return "support_or_comment";
  }
  if (candidates.some((candidate) => candidate.verdict === "related_need")) {
    return "create_with_related_link";
  }
  return "create";
};

const judgePool = async (context: ServiceContext, input: CheckInput, pool: FeatureRequestRow[]) => {
  if (pool.length === 0) return { candidates: [], degraded: false, underlyingNeed: null };
  const output = await judgeWithTimeout(context, {
    candidates: pool.map((row) => ({
      description: row.description,
      featureRequestId: row.id,
      title: row.title,
      underlyingNeed: row.underlyingNeed,
    })),
    draft: input.draft,
  });
  if (!output)
    return { candidates: degradedCandidates(pool), degraded: true, underlyingNeed: null };
  return {
    candidates: selectCandidates(pool, output),
    degraded: false,
    underlyingNeed: output.underlyingNeed.trim() || null,
  };
};

const countVerdict = (candidates: Candidate[], verdict: Candidate["verdict"]) =>
  candidates.filter((candidate) => candidate.verdict === verdict).length;

export const runCheck = async (context: ServiceContext, raw: CheckInput): Promise<CheckResult> => {
  const input = parseInput(checkInputSchema, raw);
  const embedding = await embedOrUnavailable(context, draftText(input.draft));
  const pool = await context.repo.nearestFeatureRequests({
    embedding,
    limit: CANDIDATE_POOL,
    // Confirmed duplicates are never offered; their canonical Feature Request is.
    openOnly: true,
    workspaceId: context.workspaceId,
  });
  const judged = await judgePool(context, input, pool);
  const createdAt = context.now();
  const expiresAt = new Date(createdAt.getTime() + CHECK_TTL_MINUTES * 60_000);
  const checkId = crypto.randomUUID();
  const result: CheckResult = {
    candidates: judged.candidates,
    checkId,
    consideredCount: pool.length,
    degraded: judged.degraded,
    expiresAt: expiresAt.toISOString(),
    nextAction: nextActionFor(judged.candidates),
    underlyingNeed: judged.underlyingNeed,
  };
  await context.repo.insertCheck({
    actorName: input.actor.name,
    actorType: input.actor.type,
    createdAt,
    draft: input.draft,
    draftHash: draftHash(input.draft),
    expiresAt,
    id: checkId,
    origin: context.origin,
    result,
    workspaceId: context.workspaceId,
  });
  await context.repo.insertEvent({
    origin: context.origin,
    payload: {
      actor: input.actor,
      checkId,
      degraded: judged.degraded,
      // The pilot feedback item this Check files, when the agent harness names it (spec 003).
      ...(input.feedbackItemId ? { feedbackItemId: input.feedbackItemId } : {}),
      relatedNeed: countVerdict(judged.candidates, "related_need"),
      sameNeed: countVerdict(judged.candidates, "same_need"),
    },
    subjectId: checkId,
    type: "draft_checked",
    workspaceId: context.workspaceId,
  });
  return result;
};
