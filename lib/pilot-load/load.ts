import type { Embedder } from "@/lib/signal/contracts";
import { PILOT_WORKSPACE } from "@/lib/signal/pilot";
import type { SignalRepository } from "@/lib/signal/repository";
import { embeddingText } from "@/lib/signal/seed";

import { checkPilotReady } from "./files";
import type { PilotFiles, PilotLock, PilotStatus } from "./files";

/** Pilot rows get a prefixed seed key: seed keys are unique across Workspaces. */
export const PILOT_SEED_PREFIX = "pilot:";
export const pilotSeedKey = (key: string) => `${PILOT_SEED_PREFIX}${key}`;

export type LoadPilotResult =
  | {
      accounts: number;
      /** Backlog keys whose loaded row no longer matches the file; rows are never overwritten. */
      drifted: string[];
      embedded: number;
      featureRequests: number;
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

/**
 * Operator-run, idempotent pilot load: ensures the Pilot Workspace and inserts missing backlog
 * Accounts and Feature Requests (Origin `seed`) by prefixed seed key, then embeds rows without a
 * vector. Never updates existing rows and never touches another Workspace. Feedback and the
 * Answer Key stay in files. Refuses invalid files and files changed after freeze.
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

  return {
    accounts: accountIds.size,
    drifted: drifted.toSorted(),
    embedded,
    featureRequests: loadedIds.size,
    ok: true,
    status,
    workspaceId,
  };
};
