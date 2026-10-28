import { createHash } from "node:crypto";

import type { z } from "zod";

import type { Actor, Draft, Embedder, Judge, OnBehalfOf } from "../contracts";
import { SignalError } from "../contracts";
import type { SignalRepository } from "../repository";

export interface SignalServiceDeps {
  embedder: Embedder;
  judge: Judge;
  judgeTimeoutMs?: number;
  now?: () => Date;
  repo: SignalRepository;
  workspaceId: string;
}

export interface ServiceContext {
  embedder: Embedder;
  judge: Judge;
  judgeTimeoutMs: number;
  now: () => Date;
  repo: SignalRepository;
  workspaceId: string;
}

export const DEFAULT_JUDGE_TIMEOUT_MS = 20_000;

export const toContext = (deps: SignalServiceDeps): ServiceContext => ({
  embedder: deps.embedder,
  judge: deps.judge,
  judgeTimeoutMs: deps.judgeTimeoutMs ?? DEFAULT_JUDGE_TIMEOUT_MS,
  now: deps.now ?? (() => new Date()),
  repo: deps.repo,
  workspaceId: deps.workspaceId,
});

/** Validates input at the service boundary so REST and MCP get the same `invalid_input`. */
export const parseInput = <T extends z.ZodType>(schema: T, input: unknown): z.infer<T> => {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new SignalError({
    code: "invalid_input",
    details: parsed.error.issues,
    message: "The request body is invalid.",
    resolution: "Fix the fields listed in details and retry.",
    status: 400,
  });
};

export const notFound = (featureRequestId: string) =>
  new SignalError({
    code: "not_found",
    message: `Feature Request ${featureRequestId} does not exist.`,
    resolution: "Call search_feature_requests to find a valid Feature Request id.",
    status: 404,
  });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Loads a Feature Request in this Workspace or throws `not_found`. */
export const requireFeatureRequest = async (context: ServiceContext, id: string) => {
  if (!UUID.test(id)) throw notFound(id);
  const row = await context.repo.getFeatureRequest(id);
  if (!row || row.workspaceId !== context.workspaceId) throw notFound(id);
  return row;
};

const normalize = (text: string) => text.trim().replaceAll(/\s+/gu, " ").toLowerCase();

/** Same Draft, same hash: whitespace and case do not count as a change. */
export const draftHash = (draft: Draft) =>
  createHash("sha256")
    .update(`${normalize(draft.title)}\n${normalize(draft.description)}`, "utf-8")
    .digest("hex");

export const draftText = (draft: Draft) => `${draft.title}\n\n${draft.description}`;

export const actorOf = (row: { actorName: string; actorType: string }): Actor => ({
  name: row.actorName,
  type: row.actorType === "agent" ? "agent" : "staff",
});

export const upsertOnBehalfOf = async (
  context: ServiceContext,
  onBehalfOf: OnBehalfOf | undefined,
) => {
  if (!onBehalfOf) return null;
  const { account } = onBehalfOf;
  return await context.repo.upsertAccount({
    externalId: account.externalId ?? null,
    name: account.name,
    plan: account.plan ?? null,
    segment: account.segment ?? null,
    size: account.size ?? null,
    workspaceId: context.workspaceId,
  });
};
