import { and, asc, count, desc, eq, isNotNull, ne } from "drizzle-orm";

import type { SignalDb } from "./db";
import {
  evalRuns,
  pilotAnswerKey,
  pilotFeedback,
  pilotLoadAttempts,
  pilotLoads,
  workspaces,
} from "./schema";
import type { AnswerKeyLabels, NeedLabel } from "./service/answer-key";

/**
 * Private pilot data in the database (spec 004, decision 0004): the Pilot Workspace's ground truth
 * (feedback set, Answer Key, manifest) by load, and eval run readings. Reads return aggregates and
 * labels for scoring only; no REST or MCP operation serves these rows item by item.
 */

export type AnswerKeyKind = "feature_request" | "feedback";
export type EvalRunStatus = "completed" | "failed" | "refused";
export type PilotLoadRow = typeof pilotLoads.$inferSelect;
export type PilotLoadAttemptOutcome = "accepted" | "refused";

/** The latest pilot load attempt or eval run on a set: when, and the fingerprint it saw. */
export interface PilotLoadAttempt {
  at: string;
  fingerprint: string;
  outcome: PilotLoadAttemptOutcome;
}

export interface EvalAttempt {
  at: string;
  fingerprint: string;
  status: EvalRunStatus;
}

export interface PilotGroundTruthInput {
  answerKey: {
    confirmedAt: string | null;
    confirmedBy: string | null;
    key: string;
    kind: AnswerKeyKind;
    needId: string;
  }[];
  counts: { accounts: number; featureRequests: number; feedback: number; sharesNeed: number };
  expectedBacklogDuplicateRate: number | null;
  feedback: {
    accountId: string | null;
    accountKey: string;
    customerName: string;
    customerRole: string;
    description: string;
    key: string;
    title: string;
  }[];
  /** The pilot files' fingerprint (equal to the committed lock's). */
  fingerprint: string;
  manifest: unknown;
  now?: Date;
  workspaceId: string;
}

/** `loaded`: first load; `unchanged`: same fingerprint, nothing written; `reset`: replaced. */
export type StorePilotOutcome = "loaded" | "reset" | "unchanged";

export interface PilotGroundTruth {
  counts: {
    accounts: number;
    answerKey: number;
    featureRequests: number;
    feedback: number;
    sharesNeed: number;
  };
  expectedBacklogDuplicateRate: number | null;
  feedbackCount: number;
  fingerprint: string;
  /** In the shape Answer Key scoring reads; unconfirmed labels are excluded there. */
  labels: AnswerKeyLabels;
  loadedAt: string;
  loadId: string;
  manifest: unknown;
  /** This load replaced ground truth from another fingerprint. */
  reset: boolean;
}

export interface PilotLoadRecord {
  fingerprint: string;
  id: string;
  loadedAt: string;
  previousFingerprint: string | null;
  reset: boolean;
}

export interface NewEvalRun {
  completed: number;
  createdAt?: Date;
  failureDetails: { error: string; id: string }[];
  failures: number;
  fingerprint: string | null;
  message: string | null;
  model: string;
  pairs: number;
  promptVersion: string;
  readings: unknown;
  repeat: boolean;
  results: { expected: string; id: string; predicted: string }[];
  sameNeedPositives: number;
  setName: string;
  status: EvalRunStatus;
}

/** A stored eval run as the Proof Report reads it. */
export interface EvalReading {
  completed: number;
  createdAt: string;
  failures: number;
  fingerprint: string | null;
  id: string;
  judgedPairs: boolean;
  model: string;
  pairs: number;
  promptVersion: string;
  readings: unknown;
  repeat: boolean;
  sameNeedPositives: number;
  setName: string;
  status: EvalRunStatus;
}

export interface EvalRunKey {
  fingerprint: string;
  promptVersion: string;
  setName: string;
}

const isConfirmed = (row: { confirmedAt: string | null; confirmedBy: string | null }) =>
  Boolean(row.confirmedBy?.trim() && row.confirmedAt);

/** Whether any pair reached the judge: mirrors `judgedPairs` in the eval run log. */
const judged = (run: Pick<NewEvalRun, "completed" | "failures" | "status">) =>
  run.status !== "refused" && run.completed + run.failures > 0;

/** The columns a reading needs: never the per-pair `results` or `failure_details` jsonb. */
const readingColumns = {
  completed: evalRuns.completed,
  createdAt: evalRuns.createdAt,
  failures: evalRuns.failures,
  fingerprint: evalRuns.fingerprint,
  id: evalRuns.id,
  judgedPairs: evalRuns.judgedPairs,
  model: evalRuns.model,
  pairs: evalRuns.pairs,
  promptVersion: evalRuns.promptVersion,
  readings: evalRuns.readings,
  repeat: evalRuns.repeat,
  sameNeedPositives: evalRuns.sameNeedPositives,
  setName: evalRuns.setName,
  status: evalRuns.status,
};

type ReadingRow = Omit<EvalReading, "createdAt"> & { createdAt: Date };

const toEvalReading = (row: ReadingRow): EvalReading => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});

const toLoadRecord = (row: PilotLoadRow): PilotLoadRecord => ({
  fingerprint: row.fingerprint,
  id: row.id,
  loadedAt: row.loadedAt?.toISOString() ?? "",
  previousFingerprint: row.previousFingerprint,
  reset: row.reset,
});

export const createPilotDataRepository = (db: SignalDb) => {
  /** The latest completed load of the Workspace; null before any. */
  const currentLoad = async (workspaceId: string) => {
    const [row] = await db
      .select()
      .from(pilotLoads)
      .where(and(eq(pilotLoads.workspaceId, workspaceId), isNotNull(pilotLoads.loadedAt)))
      .orderBy(desc(pilotLoads.loadedAt), desc(pilotLoads.createdAt))
      .limit(1);
    return row ?? null;
  };

  return {
    /** A Workspace by slug, without creating it. */
    async findWorkspace(slug: string) {
      const [row] = await db.select().from(workspaces).where(eq(workspaces.slug, slug));
      return row ?? null;
    },

    /** Whether a run that judged pairs exists for this set, fingerprint and prompt version. */
    async hasJudgedEvalRun(key: EvalRunKey) {
      const [row] = await db
        .select({ value: count() })
        .from(evalRuns)
        .where(
          and(
            eq(evalRuns.setName, key.setName),
            eq(evalRuns.fingerprint, key.fingerprint),
            eq(evalRuns.promptVersion, key.promptVersion),
            eq(evalRuns.judgedPairs, true),
          ),
        );
      return (row?.value ?? 0) > 0;
    },

    /**
     * The latest run on a set that saw a fingerprint, whatever its status (refused and failed
     * included): the Proof Report compares it with the lock to flag a set changed after freeze.
     */
    async latestEvalAttempt(setName: string): Promise<EvalAttempt | null> {
      const [row] = await db
        .select({
          createdAt: evalRuns.createdAt,
          fingerprint: evalRuns.fingerprint,
          status: evalRuns.status,
        })
        .from(evalRuns)
        .where(and(eq(evalRuns.setName, setName), isNotNull(evalRuns.fingerprint)))
        .orderBy(desc(evalRuns.createdAt))
        .limit(1);
      if (!row?.fingerprint) return null;
      return { at: row.createdAt.toISOString(), fingerprint: row.fingerprint, status: row.status };
    },

    /**
     * The reading: the latest run on this set that judged pairs and is not a repeat, optionally
     * for one fingerprint and one prompt version. Null when there is none.
     */
    async latestEvalReading(key: Partial<Omit<EvalRunKey, "setName">> & { setName: string }) {
      const [row] = await db
        .select(readingColumns)
        .from(evalRuns)
        .where(
          and(
            eq(evalRuns.setName, key.setName),
            key.fingerprint === undefined ? undefined : eq(evalRuns.fingerprint, key.fingerprint),
            eq(evalRuns.judgedPairs, true),
            eq(evalRuns.repeat, false),
            key.promptVersion === undefined
              ? undefined
              : eq(evalRuns.promptVersion, key.promptVersion),
          ),
        )
        .orderBy(desc(evalRuns.createdAt))
        .limit(1);
      return row ? toEvalReading(row) : null;
    },

    /** The latest pilot load attempt of the Workspace, accepted or refused; null before any. */
    async latestPilotLoadAttempt(workspaceId: string): Promise<PilotLoadAttempt | null> {
      const [row] = await db
        .select()
        .from(pilotLoadAttempts)
        .where(eq(pilotLoadAttempts.workspaceId, workspaceId))
        .orderBy(desc(pilotLoadAttempts.createdAt))
        .limit(1);
      return row
        ? { at: row.createdAt.toISOString(), fingerprint: row.fingerprint, outcome: row.outcome }
        : null;
    },

    /** The current pilot ground truth for scoring and the Proof Report; null before a load. */
    async pilotGroundTruth(workspaceId: string): Promise<PilotGroundTruth | null> {
      const load = await currentLoad(workspaceId);
      if (!load?.loadedAt) return null;
      const labelRows = await db
        .select()
        .from(pilotAnswerKey)
        .where(eq(pilotAnswerKey.loadId, load.id))
        .orderBy(asc(pilotAnswerKey.key));
      const [feedbackRow] = await db
        .select({ value: count() })
        .from(pilotFeedback)
        .where(eq(pilotFeedback.loadId, load.id));
      const label = (row: (typeof labelRows)[number]): NeedLabel => ({
        confirmed: isConfirmed(row),
        key: row.key,
        needId: row.needId,
      });
      return {
        counts: {
          accounts: load.accounts,
          answerKey: load.answerKeyEntries,
          featureRequests: load.featureRequests,
          feedback: load.feedback,
          sharesNeed: load.sharesNeed,
        },
        expectedBacklogDuplicateRate: load.expectedBacklogDuplicateRate,
        feedbackCount: feedbackRow?.value ?? 0,
        fingerprint: load.fingerprint,
        labels: {
          featureRequests: labelRows.filter((r) => r.kind === "feature_request").map(label),
          feedback: labelRows.filter((r) => r.kind === "feedback").map(label),
        },
        loadId: load.id,
        loadedAt: load.loadedAt.toISOString(),
        manifest: load.manifest,
        reset: load.reset,
      };
    },

    /** Every completed load of the Workspace, oldest first, resets included. */
    async pilotLoadHistory(workspaceId: string): Promise<PilotLoadRecord[]> {
      const rows = await db
        .select()
        .from(pilotLoads)
        .where(and(eq(pilotLoads.workspaceId, workspaceId), isNotNull(pilotLoads.loadedAt)))
        .orderBy(asc(pilotLoads.loadedAt), asc(pilotLoads.createdAt));
      return rows.map(toLoadRecord);
    },

    /** Records one eval run, refusals and failures included; Origin is always `eval`. */
    async recordEvalRun(input: NewEvalRun): Promise<EvalReading> {
      const { createdAt, ...rest } = input;
      const [row] = await db
        .insert(evalRuns)
        .values({
          ...rest,
          ...(createdAt ? { createdAt } : {}),
          judgedPairs: judged(input),
          origin: "eval",
        })
        .returning(readingColumns);
      if (!row) throw new Error("eval run insert returned nothing");
      return toEvalReading(row);
    },

    /** Records a pilot load attempt with the fingerprint it saw; a refusal writes nothing else. */
    async recordPilotLoadAttempt(input: {
      at?: Date;
      fingerprint: string;
      outcome: PilotLoadAttemptOutcome;
      workspaceId: string;
    }): Promise<void> {
      await db.insert(pilotLoadAttempts).values({
        fingerprint: input.fingerprint,
        outcome: input.outcome,
        workspaceId: input.workspaceId,
        ...(input.at ? { createdAt: input.at } : {}),
      });
    },

    /**
     * Stores the pilot ground truth for a Workspace. The same fingerprint as the current load is a
     * no-op; a different one writes a new load, replaces the stored feedback and Answer Key, and
     * records a reset. Writes run in order without a transaction (Neon over HTTP): the load counts
     * only once `loaded_at` is set, after every row is written; stale rows are removed last.
     */
    async storePilotGroundTruth(
      input: PilotGroundTruthInput,
    ): Promise<{ load: PilotLoadRecord; outcome: StorePilotOutcome }> {
      const { workspaceId } = input;
      const current = await currentLoad(workspaceId);
      if (current?.fingerprint === input.fingerprint) {
        return { load: toLoadRecord(current), outcome: "unchanged" };
      }
      const [load] = await db
        .insert(pilotLoads)
        .values({
          accounts: input.counts.accounts,
          answerKeyEntries: input.answerKey.length,
          expectedBacklogDuplicateRate: input.expectedBacklogDuplicateRate,
          featureRequests: input.counts.featureRequests,
          feedback: input.counts.feedback,
          fingerprint: input.fingerprint,
          manifest: input.manifest,
          previousFingerprint: current?.fingerprint ?? null,
          reset: current !== null,
          sharesNeed: input.counts.sharesNeed,
          workspaceId,
        })
        .returning();
      if (!load) throw new Error("pilot load insert returned nothing");
      if (input.feedback.length > 0) {
        await db
          .insert(pilotFeedback)
          .values(input.feedback.map((item) => ({ ...item, loadId: load.id, workspaceId })));
      }
      if (input.answerKey.length > 0) {
        await db
          .insert(pilotAnswerKey)
          .values(input.answerKey.map((entry) => ({ ...entry, loadId: load.id, workspaceId })));
      }
      // Strictly after the current load, so a same-millisecond reload still orders after it.
      const now = input.now ?? new Date();
      const loadedAt =
        current?.loadedAt && now <= current.loadedAt
          ? new Date(current.loadedAt.getTime() + 1)
          : now;
      const [done] = await db
        .update(pilotLoads)
        .set({ loadedAt })
        .where(eq(pilotLoads.id, load.id))
        .returning();
      if (!done) throw new Error("pilot load vanished before completion");
      const stale = (table: typeof pilotFeedback | typeof pilotAnswerKey) =>
        and(eq(table.workspaceId, workspaceId), ne(table.loadId, load.id));
      await db.delete(pilotFeedback).where(stale(pilotFeedback));
      await db.delete(pilotAnswerKey).where(stale(pilotAnswerKey));
      return { load: toLoadRecord(done), outcome: current ? "reset" : "loaded" };
    },
  };
};
