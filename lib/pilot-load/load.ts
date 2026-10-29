import type { Embedder } from "@/lib/signal/contracts";
import { PILOT_WORKSPACE, pilotSeedKey } from "@/lib/signal/pilot";
import type { SignalRepository } from "@/lib/signal/repository";
import { embeddingText } from "@/lib/signal/seed";

import { checkPilotReady } from "./files";
import type { PilotFiles, PilotLock, PilotStatus } from "./files";

/** What happened to the stored ground truth (feedback set, Answer Key, manifest) on this load. */
export type GroundTruthResult =
  | { fingerprint: string; outcome: "loaded" | "reset" | "unchanged" }
  | { outcome: "skipped"; reason: string };

export { PILOT_SEED_PREFIX, pilotSeedKey } from "@/lib/signal/pilot";

export type LoadPilotResult =
  | {
      accounts: number;
      /** Backlog keys whose loaded row no longer matches the file; rows are never overwritten. */
      drifted: string[];
      embedded: number;
      featureRequests: number;
      groundTruth: GroundTruthResult;
      ok: true;
      status: PilotStatus;
      workspaceId: string;
    }
  | { message: string; ok: false; status: PilotStatus };

const BATCH_SIZE = 8;

/** Runs `task` over `items` in sequential batches, keeping database and embedder load bounded. */
const inBatches = async <T>(items: T[], task: (item: T) => Promise<unknown>) => {
  for (let index = 0; index < items.length; index += BATCH_SIZE) {
    // oxlint-disable-next-line no-await-in-loop
    await Promise.all(items.slice(index, index + BATCH_SIZE).map(task));
  }
};

const requireId = (ids: Map<string, string>, key: string) => {
  const id = ids.get(key);
  if (!id) throw new Error(`pilot account "${key}" is not defined`);
  return id;
};

const storeGroundTruth = async (input: {
  accountIds: Map<string, string>;
  files: PilotFiles;
  repo: SignalRepository;
  status: PilotStatus;
  workspaceId: string;
}): Promise<GroundTruthResult> => {
  const { files, status } = input;
  if (!status.ready) {
    const reason = status.frozen
      ? "the Answer Key is not fully confirmed"
      : "the pilot files are not frozen";
    return { outcome: "skipped", reason: `Ground truth not stored: ${reason}.` };
  }
  const stored = await input.repo.storePilotGroundTruth({
    answerKey: [
      ...files.answerKey.featureRequests.map((e) => ({
        confirmedAt: e.confirmedAt ?? null,
        confirmedBy: e.confirmedBy ?? null,
        key: e.featureRequest,
        kind: "feature_request" as const,
        needId: e.needId,
      })),
      ...files.answerKey.feedback.map((e) => ({
        confirmedAt: e.confirmedAt ?? null,
        confirmedBy: e.confirmedBy ?? null,
        key: e.feedback,
        kind: "feedback" as const,
        needId: e.needId,
      })),
    ],
    counts: {
      accounts: status.counts.accounts,
      featureRequests: status.counts.featureRequests,
      feedback: status.counts.feedback,
      sharesNeed: status.counts.sharesNeed,
    },
    expectedBacklogDuplicateRate: files.manifest.expectedBacklogDuplicateRate,
    feedback: files.feedback.map((item) => ({
      accountId: input.accountIds.get(item.account) ?? null,
      accountKey: item.account,
      customerName: item.customer.name,
      customerRole: item.customer.role,
      description: item.description,
      key: item.key,
      title: item.title,
    })),
    fingerprint: status.fingerprint,
    manifest: files.manifest,
    workspaceId: input.workspaceId,
  });
  return { fingerprint: stored.load.fingerprint, outcome: stored.outcome };
};

/**
 * Operator-run, idempotent pilot load: ensures the Pilot Workspace and inserts missing backlog
 * Accounts and Feature Requests (Origin `seed`) by prefixed seed key, then embeds rows without a
 * vector. Never updates existing rows and never touches another Workspace. Refuses invalid files
 * and files changed after freeze.
 *
 * Ground truth (spec 004): when the set is frozen, unchanged and fully confirmed, also stores the
 * feedback set, Answer Key and manifest in the Pilot Workspace with the lock's fingerprint. The same
 * fingerprint again is a no-op; a new one replaces them and is recorded as a reset. Otherwise the
 * ground truth is skipped with the reason, and nothing about it is written.
 */
export const loadPilot = async (input: {
  embedder: Embedder | null;
  files: PilotFiles;
  lock: PilotLock | null;
  repo: SignalRepository;
}): Promise<LoadPilotResult> => {
  const { embedder, files, repo } = input;
  const status = checkPilotReady(files, input.lock);
  if (status.changed) return { message: status.messages[0] ?? "", ok: false, status };
  if (status.problems.length > 0) {
    return {
      message: `Pilot files are invalid: ${status.problems.join("; ")}.`,
      ok: false,
      status,
    };
  }

  const { id: workspaceId } = await repo.ensureWorkspace(PILOT_WORKSPACE);
  const accountIds = new Map<string, string>();
  await inBatches(files.backlog.accounts, async (account) => {
    const row = await repo.upsertAccount({
      isDemo: false,
      name: account.name,
      plan: account.plan ?? null,
      seedKey: pilotSeedKey(account.key),
      segment: account.segment ?? null,
      size: account.size ?? null,
      workspaceId,
    });
    accountIds.set(account.key, row.id);
  });

  const drifted: string[] = [];
  const loadedIds = new Set<string>();
  await inBatches(files.backlog.featureRequests, async (request) => {
    const row = await repo.upsertSeedFeatureRequest({
      createdByActorName: request.actor.name,
      createdByActorType: request.actor.type,
      description: request.description,
      embedding: null,
      onBehalfOfAccountId: requireId(accountIds, request.account),
      requesterName: request.requester.name,
      requesterRole: request.requester.role,
      seedKey: pilotSeedKey(request.key),
      title: request.title,
      underlyingNeed: request.underlyingNeed ?? null,
      workspaceId,
    });
    if (row.workspaceId !== workspaceId || row.origin !== "seed") {
      throw new Error(
        `seed key ${pilotSeedKey(request.key)} belongs to another Workspace or Origin`,
      );
    }
    loadedIds.add(row.id);
    if (
      row.title !== request.title ||
      row.description !== request.description ||
      (row.underlyingNeed ?? null) !== (request.underlyingNeed ?? null)
    ) {
      drifted.push(request.key);
    }
  });

  let embedded = 0;
  if (embedder) {
    const withoutVector = await repo.missingEmbeddings(workspaceId);
    const missing = withoutVector.filter((row) => loadedIds.has(row.id));
    await inBatches(missing, async (row) => {
      await repo.setEmbedding(row.id, await embedder.embed(embeddingText(row)));
    });
    embedded = missing.length;
  }

  const groundTruth = await storeGroundTruth({ accountIds, files, repo, status, workspaceId });

  return {
    accounts: accountIds.size,
    drifted: drifted.toSorted(),
    embedded,
    featureRequests: loadedIds.size,
    groundTruth,
    ok: true,
    status,
    workspaceId,
  };
};
