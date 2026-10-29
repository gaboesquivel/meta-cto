import assert from "node:assert/strict";
import { describe, it } from "vitest";

import type { Actor, JudgeOutput } from "../contracts";
import { PILOT_WORKSPACE } from "../pilot";
import { createRepository } from "../repository";
import { createTestDb } from "../test-db";
import type { AgentAction, AnswerKeyLabel, PmJudgement } from "./answer-key";
import { createAnswerKeyScoring, scoreAgentCorrectness, scorePmAgreement } from "./answer-key";
import { createReviewService, createSignalService } from "./index";
import { agent, cedar, fakeEmbedder, fakeJudge, payloadOf, staff, unit } from "./test-fixtures";

const label = (
  feedback: string,
  sharesNeedWith: string | null,
  confirmed = true,
): AnswerKeyLabel => ({ confirmed, feedback, sharesNeedWith });

const KEY: AnswerKeyLabel[] = [
  label("fb-swap", "fr-swap"),
  label("fb-payroll", null),
  label("fb-draft", "fr-swap", false),
];

const engage = (
  kind: "comment" | "support",
  feedbackItemId: string | null,
  targetKey: string | null,
): AgentAction => ({ feedbackItemId, kind, targetKey });
const create = (feedbackItemId: string | null): AgentAction => ({
  feedbackItemId,
  kind: "create",
  targetKey: null,
});

describe("scoreAgentCorrectness", () => {
  it("scores each agent action against the Answer Key entry of its feedback item", () => {
    const score = scoreAgentCorrectness(
      [
        // correct
        engage("support", "fb-swap", "fr-swap"),
        // correct
        engage("comment", "fb-swap", "fr-swap"),
        // harm: a different need
        engage("support", "fb-swap", "fr-other"),
        // harm: not the keyed request
        engage("comment", "fb-swap", null),
        // harm: the key says no request shares it
        engage("support", "fb-payroll", "fr-swap"),
        // miss: the key names an existing request
        create("fb-swap"),
        // correct: nothing shares the need
        create("fb-payroll"),
        // unmatched: no Answer Key entry
        create("fb-unknown"),
        // unlinked: no feedback item on its Check
        create(null),
        // excluded: unconfirmed entry
        engage("support", "fb-draft", "fr-swap"),
      ],
      KEY,
    );

    assert.deepEqual(score, {
      actions: 10,
      correct: 3,
      excludedUnconfirmed: 1,
      harm: 3,
      miss: 1,
      rate: 3 / 7,
      scored: 7,
      unlinked: 1,
      unmatched: 1,
    });
  });

  it("reports a null rate with zero counts when nothing is scored", () => {
    const score = scoreAgentCorrectness([create(null)], KEY);
    assert.equal(score.rate, null);
    assert.equal(score.scored, 0);
    assert.equal(score.unlinked, 1);
  });
});

const judged = (
  feedbackItemId: string | null,
  duplicateOfKey: string | null | undefined,
  blind = false,
): PmJudgement => ({
  blind,
  feedbackItemId,
  verdict:
    duplicateOfKey === undefined
      ? { kind: "not_duplicate" }
      : { duplicateOfKey, kind: "duplicate" },
});

describe("scorePmAgreement", () => {
  it("compares each decided new request with the Answer Key, blind and non-blind apart", () => {
    const score = scorePmAgreement(
      [
        // agree: Duplicate of the keyed request
        judged("fb-swap", "fr-swap"),
        // disagree: Duplicate of another request
        judged("fb-swap", "fr-other"),
        // disagree: Related, Distinct or no duplicates
        judged("fb-swap", undefined),
        // agree: nothing shares the need
        judged("fb-payroll", undefined),
        // disagree: Duplicate when the key says none
        judged("fb-payroll", "fr-swap", true),
        // agree
        judged("fb-swap", "fr-swap", true),
        // excluded: unconfirmed
        judged("fb-draft", "fr-swap", true),
        // unmatched
        judged("fb-unknown", undefined),
        // unlinked
        judged(null, undefined, true),
      ],
      KEY,
    );

    assert.deepEqual(score.nonBlind, {
      agree: 2,
      decided: 5,
      disagree: 2,
      excludedUnconfirmed: 0,
      rate: 0.5,
      unlinked: 0,
      unmatched: 1,
    });
    assert.deepEqual(score.blind, {
      agree: 1,
      decided: 4,
      disagree: 1,
      excludedUnconfirmed: 1,
      rate: 0.5,
      unlinked: 1,
      unmatched: 0,
    });
  });

  it("does not count a Duplicate whose other side resolves to no keyed request as agreement", () => {
    const score = scorePmAgreement([judged("fb-payroll", null)], KEY);
    assert.equal(score.nonBlind.disagree, 1);
  });
});

/** The Pilot Workspace on PGlite with a two-request backlog loaded as the pilot loader does. */
const pilotHarness = async (options: { blindShare?: number } = {}) => {
  const db = await createTestDb();
  const repo = createRepository(db);
  const { id: workspaceId } = await repo.ensureWorkspace(PILOT_WORKSPACE);
  const backlog = async (key: string, title: string, index: number) =>
    await repo.upsertSeedFeatureRequest({
      createdByActorName: "Sam (CSM)",
      createdByActorType: "staff",
      description: `${title} description`,
      embedding: unit(index),
      seedKey: `pilot:${key}`,
      title,
      underlyingNeed: null,
      workspaceId,
    });
  const swap = await backlog("fr-swap", "Shift swaps in the app", 0);
  const other = await backlog("fr-other", "Payroll export", 1);
  const judge = fakeJudge({
    build: (): JudgeOutput => ({ judgments: [], underlyingNeed: "need" }),
    kind: "output",
  });
  const deps = { embedder: fakeEmbedder({}).embedder, judge: judge.judge, repo, workspaceId };
  const service = createSignalService({ ...deps, markDemo: false, origin: "pilot" });
  const review = createReviewService({
    blindShare: options.blindShare,
    origin: "pilot",
    repo,
    workspaceId,
  });
  return { db, other, repo, review, service, swap, workspaceId };
};

type Pilot = Awaited<ReturnType<typeof pilotHarness>>;

const draftFor = (title: string) => ({ description: `${title} from a customer`, title });

const check = async (pilot: Pilot, feedbackItemId: string | undefined, actor: Actor = agent) =>
  await pilot.service.check({
    actor,
    draft: draftFor(feedbackItemId ?? "untagged"),
    ...(feedbackItemId ? { feedbackItemId } : {}),
    onBehalfOf: cedar,
  });

const supportFor = async (
  pilot: Pilot,
  feedbackItemId: string | undefined,
  targetId: string,
  account = "Cedar Market",
) => {
  const result = await check(pilot, feedbackItemId);
  await pilot.service.support(targetId, {
    actor: agent,
    checkId: result.checkId,
    onBehalfOf: { account: { name: account } },
  });
};

const createFor = async (pilot: Pilot, feedbackItemId: string | undefined) => {
  const result = await check(pilot, feedbackItemId);
  return await pilot.service.create({
    actor: agent,
    checkId: result.checkId,
    draft: draftFor(feedbackItemId ?? "untagged"),
    onBehalfOf: cedar,
  });
};

const PILOT_KEY: AnswerKeyLabel[] = [
  label("fb-1", "fr-swap"),
  label("fb-2", "fr-swap"),
  label("fb-3", null),
  label("fb-4", "fr-swap"),
  label("fb-5", null),
  label("fb-6", "fr-swap", false),
];

describe("feedback item link on a Check", () => {
  it("records the optional feedbackItemId on the draft_checked event", async () => {
    const pilot = await pilotHarness();
    await check(pilot, "fb-1");
    await check(pilot, undefined);

    const events = await pilot.repo.eventsOfType(pilot.workspaceId, "draft_checked", "pilot");
    const items = events.map((event) => payloadOf(event).feedbackItemId);
    assert.deepEqual(items.toSorted(), ["fb-1", undefined]);
  });
});

describe("createAnswerKeyScoring (Pilot Workspace)", () => {
  it("scores pilot agent actions linked through their Check, ignoring staff and other Origins", async () => {
    const pilot = await pilotHarness();
    // correct
    await supportFor(pilot, "fb-1", pilot.swap.id);
    // harm
    await supportFor(pilot, "fb-2", pilot.other.id);
    // miss
    await createFor(pilot, "fb-4");
    // correct
    await createFor(pilot, "fb-3");
    // excluded: unconfirmed
    await createFor(pilot, "fb-6");
    // unlinked
    await createFor(pilot, undefined);
    // unmatched
    await createFor(pilot, "fb-99");
    // A staff Comment is not an agent action.
    const staffCheck = await check(pilot, "fb-2", staff);
    await pilot.service.comment(pilot.other.id, {
      actor: staff,
      body: "noted",
      checkId: staffCheck.checkId,
    });
    // A demo-Origin service writing into the same Workspace never counts as pilot.
    const demo = createSignalService({
      embedder: fakeEmbedder({}).embedder,
      judge: fakeJudge({
        build: () => ({ judgments: [], underlyingNeed: "need" }),
        kind: "output",
      }).judge,
      origin: "demo",
      repo: pilot.repo,
      workspaceId: pilot.workspaceId,
    });
    const demoCheck = await demo.check({
      actor: agent,
      draft: draftFor("demo filing"),
      feedbackItemId: "fb-2",
    });
    await demo.support(pilot.other.id, {
      actor: agent,
      checkId: demoCheck.checkId,
      onBehalfOf: { account: { name: "Demo Account" } },
    });

    const scores = await createAnswerKeyScoring({ answerKey: PILOT_KEY, repo: pilot.repo }).score();

    assert.deepEqual(scores.agentCorrectness, {
      actions: 7,
      correct: 2,
      excludedUnconfirmed: 1,
      harm: 1,
      miss: 1,
      rate: 0.5,
      scored: 4,
      unlinked: 1,
      unmatched: 1,
    });
  });

  it("resolves a Support on a request filed in the pilot through that request's own feedback item", async () => {
    const pilot = await pilotHarness();
    // miss: fr-swap existed
    const filed = await createFor(pilot, "fb-4");
    // correct: fb-4's request shares fr-swap's need
    await supportFor(pilot, "fb-1", filed.id);
    // harm: fb-5 shares no request
    await supportFor(pilot, "fb-5", filed.id, "Other Account");

    const { agentCorrectness } = await createAnswerKeyScoring({
      answerKey: PILOT_KEY,
      repo: pilot.repo,
    }).score();

    assert.equal(agentCorrectness.correct, 1);
    assert.equal(agentCorrectness.harm, 1);
    assert.equal(agentCorrectness.miss, 1);
  });

  it("scores Review Decisions on new pilot requests, blind and non-blind apart", async () => {
    const blindPilot = await pilotHarness({ blindShare: 1 });
    const blindDup = await createFor(blindPilot, "fb-1");
    const blindNone = await createFor(blindPilot, "fb-2");
    const undecided = await createFor(blindPilot, "fb-4");
    await blindPilot.review.decide(
      {
        canonicalId: blindPilot.swap.id,
        decision: "duplicate",
        featureRequestId: blindDup.id,
        otherId: blindPilot.swap.id,
      },
      staff,
      // blind agree
    );
    // blind disagree
    await blindPilot.review.decide({ decision: "none", featureRequestId: blindNone.id }, staff);

    const blindScores = await createAnswerKeyScoring({
      answerKey: PILOT_KEY,
      repo: blindPilot.repo,
    }).score();
    assert.deepEqual(blindScores.pmAgreement.blind, {
      agree: 1,
      decided: 2,
      disagree: 1,
      excludedUnconfirmed: 0,
      rate: 0.5,
      unlinked: 0,
      unmatched: 0,
    });
    assert.equal(blindScores.pmAgreement.nonBlind.decided, 0);
    assert.ok(undecided.id);

    const pilot = await pilotHarness();
    const related = await createFor(pilot, "fb-1");
    const distinct = await createFor(pilot, "fb-3");
    const wrongDup = await createFor(pilot, "fb-5");
    const undone = await createFor(pilot, "fb-2");
    await pilot.review.decide(
      {
        decision: "related",
        featureRequestId: related.id,
        otherId: pilot.swap.id,
        sharedDimension: "shifts",
      },
      staff,
      // disagree: key names fr-swap
    );
    await pilot.review.decide(
      { decision: "distinct", featureRequestId: distinct.id, otherId: pilot.swap.id },
      staff,
      // agree: key says none
    );
    // Canonical kept on the new side: still a Duplicate pair with fr-other, against a key of none.
    await pilot.review.decide(
      {
        canonicalId: wrongDup.id,
        decision: "duplicate",
        featureRequestId: wrongDup.id,
        otherId: pilot.other.id,
      },
      staff,
      // disagree
    );
    const withdrawn = await pilot.review.decide(
      { decision: "none", featureRequestId: undone.id },
      staff,
    );
    // undone: not decided
    await pilot.review.undo(withdrawn.id, staff);

    const scores = await createAnswerKeyScoring({ answerKey: PILOT_KEY, repo: pilot.repo }).score();
    assert.deepEqual(scores.pmAgreement.nonBlind, {
      agree: 1,
      decided: 3,
      disagree: 2,
      excludedUnconfirmed: 0,
      rate: 1 / 3,
      unlinked: 0,
      unmatched: 0,
    });
    assert.equal(scores.pmAgreement.blind.decided, 0);
  });
});
