import assert from "node:assert/strict";
import { describe, it } from "vitest";

import type { Harness } from "./test-fixtures";
import { addRequest, createHarness, mix, payloadOf, staff, unit } from "./test-fixtures";

/** Requests drifting away from unit(0), so retrieval order is Request 0, 1, 2... */
const addRequests = async (harness: Harness, total: number) => {
  for (const index of Array.from({ length: total }, (_, value) => value)) {
    // Sequential inserts keep the fixture deterministic.
    // oxlint-disable-next-line no-await-in-loop
    await addRequest(harness, `Request ${index}`, mix(0, index + 1, index * 0.05));
  }
};

const draft = { description: "Trades vanish from my schedule", title: "Traded shifts missing" };

describe("signal service check", () => {
  it("embeds the draft, judges the nearest pool and applies caps in retrieval order", async () => {
    const harness = await createHarness({ vectors: { Traded: unit(0) } });
    await addRequests(harness, 12);
    harness.judge.state.behavior = {
      build: (ids) => ({
        judgments: ids.map((id, index) => {
          if (index < 4)
            return {
              featureRequestId: id,
              reason: `same ${index}`,
              sharedDimension: null,
              verdict: "same_need" as const,
            };
          if (index < 7)
            return {
              featureRequestId: id,
              reason: `related ${index}`,
              sharedDimension: "shift trades",
              verdict: "related_need" as const,
            };
          return {
            featureRequestId: id,
            reason: "unrelated",
            sharedDimension: null,
            verdict: "different" as const,
          };
        }),
        underlyingNeed: "Reliable shift-trade updates",
      }),
      kind: "output",
    };

    const result = await harness.service.check({ actor: staff, draft });

    assert.equal(
      harness.embedder.calls[0],
      "Traded shifts missing\n\nTrades vanish from my schedule",
    );
    assert.equal(harness.judge.state.calls[0]?.candidates.length, 10);
    assert.equal(result.consideredCount, 10);
    assert.equal(result.underlyingNeed, "Reliable shift-trade updates");
    assert.equal(result.degraded, false);
    assert.equal(result.nextAction, "support_or_comment");
    assert.deepEqual(
      result.candidates.map((candidate) => [candidate.title, candidate.verdict]),
      [
        ["Request 0", "same_need"],
        ["Request 1", "same_need"],
        ["Request 2", "same_need"],
        ["Request 4", "related_need"],
        ["Request 5", "related_need"],
      ],
    );
    assert.equal(result.candidates[3]?.sharedDimension, "shift trades");
    assert.equal(result.expiresAt, "2026-10-28T12:30:00.000Z");

    const stored = await harness.repo.getCheck(result.checkId);
    assert.ok(stored);
    assert.deepEqual(stored.result, result);
    assert.equal(stored.expiresAt.toISOString(), result.expiresAt);
    assert.match(stored.draftHash, /^[0-9a-f]{64}$/u);

    const [event] = await harness.repo.eventsOfType(harness.workspaceId, "draft_checked");
    assert.equal(event?.subjectId, result.checkId);
    assert.deepEqual(event?.payload, {
      actor: staff,
      checkId: result.checkId,
      degraded: false,
      relatedNeed: 2,
      sameNeed: 3,
    });
  });

  it("returns create_with_related_link when only related needs remain", async () => {
    const harness = await createHarness({ vectors: { Traded: unit(0) } });
    await addRequest(harness, "Approve shift changes", unit(0));
    await addRequest(harness, "Payroll", unit(4));
    harness.judge.state.behavior = {
      build: ([first, second]) => ({
        judgments: [
          {
            featureRequestId: first as string,
            reason: "both about trades",
            sharedDimension: "shift trades",
            verdict: "related_need",
          },
          {
            featureRequestId: second as string,
            reason: "payroll",
            sharedDimension: null,
            verdict: "different",
          },
        ],
        underlyingNeed: "need",
      }),
      kind: "output",
    };

    const result = await harness.service.check({ actor: staff, draft });

    assert.equal(result.nextAction, "create_with_related_link");
    assert.equal(result.candidates.length, 1);
    assert.equal(result.consideredCount, 2);
  });

  it("returns create when every candidate is different, and ignores unknown ids", async () => {
    const harness = await createHarness({});
    const request = await addRequest(harness, "Payroll", unit(4));
    harness.judge.state.behavior = {
      build: () => ({
        judgments: [
          {
            featureRequestId: request.id,
            reason: "payroll",
            sharedDimension: null,
            verdict: "different",
          },
          {
            featureRequestId: "00000000-0000-0000-0000-000000000000",
            reason: "made up",
            sharedDimension: null,
            verdict: "same_need",
          },
        ],
        underlyingNeed: "need",
      }),
      kind: "output",
    };

    const result = await harness.service.check({ actor: staff, draft });

    assert.equal(result.nextAction, "create");
    assert.deepEqual(result.candidates, []);
  });

  it("drops verdicts missing a reason or a related shared dimension", async () => {
    const harness = await createHarness({ vectors: { Traded: unit(0) } });
    await addRequest(harness, "A", unit(0));
    await addRequest(harness, "B", mix(0, 1, 0.2));
    harness.judge.state.behavior = {
      build: ([first, second]) => ({
        judgments: [
          {
            featureRequestId: first as string,
            reason: " ",
            sharedDimension: null,
            verdict: "same_need",
          },
          {
            featureRequestId: second as string,
            reason: "shares trades",
            sharedDimension: null,
            verdict: "related_need",
          },
        ],
        underlyingNeed: "need",
      }),
      kind: "output",
    };

    const result = await harness.service.check({ actor: staff, draft });

    assert.deepEqual(result.candidates, []);
    assert.equal(result.nextAction, "create");
  });

  it("degrades to the nearest five unknown candidates when the judge fails", async () => {
    const harness = await createHarness({ judge: { kind: "error" }, vectors: { Traded: unit(0) } });
    await addRequests(harness, 7);

    const result = await harness.service.check({ actor: staff, draft });

    assert.equal(result.degraded, true);
    assert.equal(result.underlyingNeed, null);
    assert.equal(result.nextAction, "create");
    assert.equal(result.consideredCount, 7);
    assert.deepEqual(
      result.candidates.map((candidate) => candidate.title),
      ["Request 0", "Request 1", "Request 2", "Request 3", "Request 4"],
    );
    for (const candidate of result.candidates) {
      assert.equal(candidate.verdict, "unknown");
      assert.equal(candidate.reason, null);
      assert.equal(candidate.sharedDimension, null);
    }
    const [event] = await harness.repo.eventsOfType(harness.workspaceId, "draft_checked");
    assert.equal(payloadOf(event).degraded, true);
  });

  it("degrades when the judge times out", async () => {
    const harness = await createHarness({ judge: { kind: "hang" }, judgeTimeoutMs: 20 });
    await addRequest(harness, "A", unit(0));

    const result = await harness.service.check({ actor: staff, draft });

    assert.equal(result.degraded, true);
    assert.equal(result.candidates[0]?.verdict, "unknown");
  });

  it("skips the judge when the workspace has no candidates", async () => {
    const harness = await createHarness({});

    const result = await harness.service.check({ actor: staff, draft });

    assert.equal(harness.judge.state.calls.length, 0);
    assert.equal(result.consideredCount, 0);
    assert.equal(result.nextAction, "create");
    assert.equal(result.degraded, false);
  });

  it("rejects invalid input", async () => {
    const harness = await createHarness({});

    await assert.rejects(
      harness.service.check({ actor: staff, draft: { description: "", title: "x" } }),
      { code: "invalid_input", status: 400 },
    );
  });

  it("reports service_unavailable when embedding fails", async () => {
    const harness = await createHarness({});
    harness.embedder.embedder.embed = async () => {
      await Promise.resolve();
      throw new Error("gateway down");
    };

    await assert.rejects(harness.service.check({ actor: staff, draft }), {
      code: "service_unavailable",
      status: 503,
    });
  });
});
