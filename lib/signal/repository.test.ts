import assert from "node:assert/strict";
import { beforeEach, describe, it } from "vitest";

import { createRepository } from "./repository";
import type { SignalRepository } from "./repository";
import { createTestDb } from "./test-db";

const unit = (index: number) => {
  const vector = Array.from({ length: 1536 }, () => 0);
  vector[index] = 1;
  return vector;
};

const mix = (a: number, b: number, weightB: number) => {
  const vector = Array.from({ length: 1536 }, () => 0);
  vector[a] = 1 - weightB;
  vector[b] = weightB;
  return vector;
};

describe("signal repository", () => {
  let repo: SignalRepository;
  let workspaceId: string;

  beforeEach(async () => {
    const db = await createTestDb();
    repo = createRepository(db);
    const workspace = await repo.ensureWorkspace({ name: "Crewday Demo", slug: "crewday" });
    workspaceId = workspace.id;
  });

  const addRequest = (title: string, embedding: number[]) =>
    repo.insertFeatureRequest({
      createdByActorName: "seed",
      createdByActorType: "staff",
      description: `${title} description`,
      embedding,
      origin: "demo",
      title,
      underlyingNeed: null,
      workspaceId,
    });

  it("returns nearest feature requests by cosine distance", async () => {
    const swaps = await addRequest("Shift swaps don't sync", unit(0));
    const approvals = await addRequest("Approve shift changes", mix(0, 1, 0.6));
    await addRequest("Payroll export", unit(5));

    const nearest = await repo.nearestFeatureRequests({
      embedding: mix(0, 1, 0.1),
      limit: 2,
      workspaceId,
    });

    assert.deepEqual(
      nearest.map((item) => item.id),
      [swaps.id, approvals.id],
    );
  });

  it("allows one support per account per feature request", async () => {
    const request = await addRequest("Shift swaps don't sync", unit(0));
    const account = await repo.upsertAccount({ name: "Cedar Market", workspaceId });

    const first = await repo.insertSupport({
      accountId: account.id,
      actorName: "Ana",
      actorType: "staff",
      featureRequestId: request.id,
      quote: "Trades vanish",
    });
    const second = await repo.insertSupport({
      accountId: account.id,
      actorName: "Bot",
      actorType: "agent",
      featureRequestId: request.id,
      quote: "Again",
    });

    assert.equal(first.created, true);
    assert.equal(second.created, false);
    assert.equal(second.support.id, first.support.id);
    assert.equal(first.support.originalFeatureRequestId, request.id);
  });

  it("upserts accounts by name within a workspace", async () => {
    const a = await repo.upsertAccount({ name: "Cedar Market", segment: "retail", workspaceId });
    const b = await repo.upsertAccount({ name: "Cedar Market", workspaceId });
    assert.equal(a.id, b.id);
  });
});
