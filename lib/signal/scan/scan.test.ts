import assert from "node:assert/strict";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { beforeEach, describe, it } from "vitest";

import type { Judge, JudgeOutput } from "../contracts";
import { createRepository } from "../repository";
import type { SignalRepository } from "../repository";
import { mix, unit } from "../service/test-fixtures";
import { createTestDb } from "../test-db";
import { createBacklogScan } from "./index";

const ROOT = path.resolve(import.meta.dirname, "../../..");

interface Context {
  add: (title: string, embedding: number[] | null) => Promise<string>;
  repo: SignalRepository;
  workspaceId: string;
}

const setup = async (): Promise<Context> => {
  const repo = createRepository(await createTestDb());
  const { id: workspaceId } = await repo.ensureWorkspace({ name: "Crewday Demo", slug: "crewday" });
  const add = async (title: string, embedding: number[] | null) => {
    const row = await repo.insertFeatureRequest({
      createdByActorName: "seed",
      createdByActorType: "staff",
      description: `${title} description`,
      embedding,
      title,
      underlyingNeed: null,
      workspaceId,
    });
    return row.id;
  };
  return { add, repo, workspaceId };
};

interface Verdicts {
  /** Unordered title pairs judged Same Need. */
  related?: [string, string][];
  same?: [string, string][];
}

const hasPair = (pairs: [string, string][] | undefined, x: string, y: string) =>
  Boolean(pairs?.some(([p, q]) => (p === x && q === y) || (p === y && q === x)));

/** A judge that decides by the titles of the Draft and each candidate. */
const titleJudge = (verdicts: Verdicts) => {
  const state = {
    calls: [] as Parameters<Judge["judge"]>[0][],
    mode: "judge" as "error" | "hang" | "judge",
  };
  const judge: Judge = {
    judge: async (input) => {
      state.calls.push(input);
      await Promise.resolve();
      if (state.mode === "error") throw new Error("model exploded");
      if (state.mode === "hang") {
        await once(new EventTarget(), "never");
        throw new Error("unreachable");
      }
      return {
        judgments: input.candidates.map((candidate): JudgeOutput["judgments"][number] => {
          const id = candidate.featureRequestId;
          if (hasPair(verdicts.same, input.draft.title, candidate.title))
            return {
              featureRequestId: id,
              reason: `same as ${candidate.title}`,
              sharedDimension: null,
              verdict: "same_need",
            };
          if (hasPair(verdicts.related, input.draft.title, candidate.title))
            return {
              featureRequestId: id,
              reason: "nearby",
              sharedDimension: "scheduling",
              verdict: "related_need",
            };
          return {
            featureRequestId: id,
            reason: "unrelated",
            sharedDimension: null,
            verdict: "different",
          };
        }),
        underlyingNeed: "need",
      };
    },
  };
  return { judge, state };
};

const SWAP: [string, string] = ["Shift swap", "Swap shifts"];

const pairsOf = async (context: Context, ids: string[]) =>
  await context.repo.listSuspectedDuplicates(ids);

describe("backlog scan", () => {
  let context: Context;
  const titles = new Map<string, string>();

  beforeEach(async () => {
    context = await setup();
    titles.clear();
  });

  const addTitled = async (title: string, embedding: number[] | null) => {
    const id = await context.add(title, embedding);
    titles.set(id, title);
    return id;
  };

  it("stores Same Need pairs once, ignores Related and Different, and skips scanned rows", async () => {
    const a = await addTitled("Shift swap", unit(0));
    const b = await addTitled("Swap shifts", mix(0, 1, 0.1));
    const c = await addTitled("Shift calendar", mix(0, 2, 0.3));
    await addTitled("Payroll export", unit(5));
    const judge = titleJudge({ related: [["Shift swap", "Shift calendar"]], same: [SWAP] });
    const scan = createBacklogScan({
      judge: judge.judge,
      model: "test/model",
      repo: context.repo,
      workspaceId: context.workspaceId,
    });

    const first = await scan.scan();
    assert.deepEqual(first, { pairsFound: 1, remaining: 0, scanned: 4 });
    const pairs = await pairsOf(context, [a, b, c]);
    assert.equal(pairs.length, 1);
    const [pair] = pairs;
    assert.equal(pair?.source, "scan");
    assert.equal(pair?.model, "test/model");
    assert.match(pair?.reason ?? "", /same as/u);
    assert.deepEqual(new Set([pair?.featureRequestAId, pair?.featureRequestBId]), new Set([a, b]));

    // Each Feature Request is judged once and never against itself.
    assert.equal(judge.state.calls.length, 4);
    for (const call of judge.state.calls) {
      const self = [...titles].find(([, title]) => title === call.draft.title)?.[0];
      assert.ok(!call.candidates.some((candidate) => candidate.featureRequestId === self));
    }

    const second = await scan.scan();
    assert.deepEqual(second, { pairsFound: 0, remaining: 0, scanned: 0 });
    assert.equal(judge.state.calls.length, 4);
    const after = await pairsOf(context, [a, b, c]);
    assert.equal(after.length, 1);
  });

  it("is idempotent when a pair is found again by a later scan", async () => {
    const a = await addTitled("Shift swap", unit(0));
    const scanA = createBacklogScan({
      judge: titleJudge({ same: [SWAP] }).judge,
      repo: context.repo,
      workspaceId: context.workspaceId,
    });
    await scanA.scan();
    const b = await addTitled("Swap shifts", mix(0, 1, 0.1));
    const result = await scanA.scan();
    assert.deepEqual(result, { pairsFound: 1, remaining: 0, scanned: 1 });
    // Re-judging an already-stored pair does not duplicate it.
    await context.repo.upsertSuspectedDuplicate({
      a,
      b,
      reason: "again",
      source: "scan",
      workspaceId: context.workspaceId,
    });
    const pairs = await pairsOf(context, [a, b]);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0]?.model, null);
  });

  it("does not count a pair a Check already suspected as found", async () => {
    const a = await addTitled("Shift swap", unit(0));
    const b = await addTitled("Swap shifts", mix(0, 1, 0.1));
    await context.repo.upsertSuspectedDuplicate({
      a,
      b,
      reason: "from a Check",
      source: "check",
      workspaceId: context.workspaceId,
    });
    const scan = createBacklogScan({
      judge: titleJudge({ same: [SWAP] }).judge,
      repo: context.repo,
      workspaceId: context.workspaceId,
    });
    assert.deepEqual(await scan.scan(), { pairsFound: 0, remaining: 0, scanned: 2 });
    const pairs = await pairsOf(context, [a, b]);
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0]?.source, "check");
  });

  it("skips confirmed duplicates as subjects and as candidates", async () => {
    const canonical = await addTitled("Shift swap", unit(0));
    const duplicate = await addTitled("Swap shifts", mix(0, 1, 0.1));
    await context.repo.setDuplicateOf(duplicate, canonical);
    const judge = titleJudge({ same: [SWAP] });
    const scan = createBacklogScan({
      judge: judge.judge,
      repo: context.repo,
      workspaceId: context.workspaceId,
    });
    const result = await scan.scan();
    assert.deepEqual(result, { pairsFound: 0, remaining: 0, scanned: 1 });
    // The only open neighbor is itself, so no judge call is needed.
    assert.equal(judge.state.calls.length, 0);
    const none = await pairsOf(context, [canonical, duplicate]);
    assert.equal(none.length, 0);
  });

  it("leaves a Feature Request unscanned when the judge fails and continues", async () => {
    await addTitled("Shift swap", unit(0));
    await addTitled("Swap shifts", mix(0, 1, 0.1));
    const judge = titleJudge({ same: [SWAP] });
    judge.state.mode = "error";
    const scan = createBacklogScan({
      judge: judge.judge,
      repo: context.repo,
      workspaceId: context.workspaceId,
    });
    const failed = await scan.scan();
    assert.deepEqual(failed, { pairsFound: 0, remaining: 2, scanned: 0 });
    assert.equal(judge.state.calls.length, 2);

    judge.state.mode = "judge";
    const retried = await scan.scan();
    assert.deepEqual(retried, { pairsFound: 1, remaining: 0, scanned: 2 });
  });

  it("treats a judge timeout as a failure", async () => {
    await addTitled("Shift swap", unit(0));
    await addTitled("Swap shifts", mix(0, 1, 0.1));
    const hanging = titleJudge({});
    hanging.state.mode = "hang";
    const scan = createBacklogScan({
      judge: hanging.judge,
      judgeTimeoutMs: 20,
      repo: context.repo,
      workspaceId: context.workspaceId,
    });
    assert.deepEqual(await scan.scan(), { pairsFound: 0, remaining: 2, scanned: 0 });
  });

  it("respects the limit and counts what remains", async () => {
    for (const index of [0, 1, 2, 3, 4]) {
      // oxlint-disable-next-line no-await-in-loop -- sequential inserts keep createdAt order.
      await addTitled(`Request ${index}`, unit(index));
    }
    await addTitled("No embedding", null);
    const judge = titleJudge({});
    const scan = createBacklogScan({
      judge: judge.judge,
      repo: context.repo,
      workspaceId: context.workspaceId,
    });
    // Without an embedding a Feature Request can't be scanned, so it is not remaining either:
    // callers loop while remaining > 0 and must reach 0.
    assert.deepEqual(await scan.scan({ limit: 2 }), { pairsFound: 0, remaining: 3, scanned: 2 });
    assert.equal(judge.state.calls.length, 2);
    assert.deepEqual(await scan.scan({ limit: 200 }), { pairsFound: 0, remaining: 0, scanned: 3 });
  });

  it("rejects a limit outside 1 to 200", async () => {
    const scan = createBacklogScan({
      judge: titleJudge({}).judge,
      repo: context.repo,
      workspaceId: context.workspaceId,
    });
    await assert.rejects(scan.scan({ limit: 201 }), { code: "invalid_input" });
    await assert.rejects(scan.scan({ limit: 0 }), { code: "invalid_input" });
  });
});

describe("scan stays out of builds", () => {
  it("is not run by the Vercel build, predev or db:seed", async () => {
    const vercel = JSON.parse(await readFile(path.join(ROOT, "vercel.json"), "utf-8")) as {
      buildCommand: string;
    };
    const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf-8")) as {
      scripts: Record<string, string>;
    };
    assert.ok(!vercel.buildCommand.includes("signal:scan"));
    for (const name of ["predev", "build", "db:seed", "db:migrate"]) {
      assert.ok(!pkg.scripts[name]?.includes("signal:scan"), name);
    }
    assert.equal(pkg.scripts["signal:scan"], "tsx scripts/signal-scan.ts");
    const seed = await readFile(path.join(ROOT, "scripts/db-seed.ts"), "utf-8");
    assert.ok(!seed.includes("scan"));
  });
});
