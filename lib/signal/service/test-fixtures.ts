import { once } from "node:events";

import type {
  Embedder,
  Judge,
  JudgeOutput,
  Origin,
  ReviewService,
  ScanOptions,
  ScanResult,
  SignalService,
} from "../contracts";
import type { SignalDb } from "../db";
import { createRepository } from "../repository";
import type { SignalRepository } from "../repository";
import { EMBEDDING_DIMENSIONS } from "../schema";
import { createTestDb } from "../test-db";
import { createReviewService, createSignalService } from "./index";

export const unit = (index: number) => {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  vector[index] = 1;
  return vector;
};

export const mix = (a: number, b: number, weightB: number) => {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  vector[a] = 1 - weightB;
  vector[b] = weightB;
  return vector;
};

/** Deterministic embedder: the first keyword found in the text picks the vector. */
export const fakeEmbedder = (vectors: Record<string, number[]>) => {
  const calls: string[] = [];
  const embedder: Embedder = {
    embed: async (text) => {
      calls.push(text);
      await Promise.resolve();
      const key = Object.keys(vectors).find((keyword) => text.includes(keyword));
      return key ? (vectors[key] as number[]) : unit(EMBEDDING_DIMENSIONS - 1);
    },
  };
  return { calls, embedder };
};

export type JudgeBehavior =
  | { kind: "output"; build: (candidateIds: string[]) => JudgeOutput }
  | { kind: "error" }
  | { kind: "hang" };

export const fakeJudge = (initial: JudgeBehavior) => {
  const state = { behavior: initial, calls: [] as Parameters<Judge["judge"]>[0][] };
  const judge: Judge = {
    judge: async (input) => {
      state.calls.push(input);
      await Promise.resolve();
      if (state.behavior.kind === "error") throw new Error("model exploded");
      if (state.behavior.kind === "hang") {
        await once(new EventTarget(), "never");
        throw new Error("unreachable");
      }
      return state.behavior.build(input.candidates.map((candidate) => candidate.featureRequestId));
    },
  };
  return { judge, state };
};

export interface Harness {
  clock: { now: Date };
  db: SignalDb;
  embedder: ReturnType<typeof fakeEmbedder>;
  judge: ReturnType<typeof fakeJudge>;
  origin: Origin;
  repo: SignalRepository;
  review: ReviewService;
  service: SignalService;
  workspaceId: string;
}

export const createHarness = async (input: {
  /** Share of new Feature Requests chosen for Blind Review (0 by default, as in the demo). */
  blindShare?: number;
  judge?: JudgeBehavior;
  judgeTimeoutMs?: number;
  /** The caller's Origin for both services; demo when omitted. */
  origin?: Origin;
  /** Repository overrides for the review service only, to simulate storage failures. */
  reviewRepo?: (repo: SignalRepository) => SignalRepository;
  scan?: (options?: ScanOptions) => Promise<ScanResult>;
  vectors?: Record<string, number[]>;
}): Promise<Harness> => {
  const db = await createTestDb();
  const repo = createRepository(db);
  const workspace = await repo.ensureWorkspace({ name: "Crewday Demo", slug: "crewday" });
  const embedder = fakeEmbedder(input.vectors ?? {});
  const judge = fakeJudge(
    input.judge ?? { build: () => ({ judgments: [], underlyingNeed: "need" }), kind: "output" },
  );
  const clock = { now: new Date("2026-10-28T12:00:00.000Z") };
  const origin = input.origin ?? "demo";
  const service = createSignalService({
    embedder: embedder.embedder,
    judge: judge.judge,
    judgeTimeoutMs: input.judgeTimeoutMs,
    now: () => clock.now,
    origin,
    repo,
    workspaceId: workspace.id,
  });
  const review = createReviewService({
    blindShare: input.blindShare,
    now: () => clock.now,
    origin,
    repo: input.reviewRepo ? input.reviewRepo(repo) : repo,
    scan: input.scan,
    workspaceId: workspace.id,
  });
  return {
    clock,
    db,
    embedder,
    judge,
    origin,
    repo,
    review,
    service,
    workspaceId: workspace.id,
  };
};

export const addRequest = async (
  harness: Harness,
  title: string,
  embedding: number[] | null,
  underlyingNeed: string | null = null,
) =>
  await harness.repo.insertFeatureRequest({
    createdByActorName: "seed",
    createdByActorType: "staff",
    description: `${title} description`,
    embedding,
    origin: harness.origin,
    title,
    underlyingNeed,
    workspaceId: harness.workspaceId,
  });

/** A Feature Request created through a Check (spec 001), i.e. a new one for review metrics. */
export const addNewRequest = async (harness: Harness, title: string, embedding: number[] | null) =>
  await harness.repo.insertFeatureRequest({
    createdByActorName: "Ana",
    createdByActorType: "staff",
    createdViaCheck: true,
    description: `${title} description`,
    embedding,
    origin: harness.origin,
    title,
    underlyingNeed: null,
    workspaceId: harness.workspaceId,
  });

/** Event payloads are jsonb; tests read them as plain records. */
export const payloadOf = (row: { payload: unknown } | undefined) =>
  (row?.payload ?? {}) as Record<string, unknown>;

export const staff = { name: "Ana", type: "staff" as const };
export const agent = { name: "Helper bot", type: "agent" as const };
export const cedar = { account: { name: "Cedar Market", segment: "retail", size: "24 stores" } };
