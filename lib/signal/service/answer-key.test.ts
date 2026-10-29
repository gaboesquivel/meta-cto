import assert from "node:assert/strict";
import { describe, it } from "vitest";

import type { Actor, JudgeOutput } from "../contracts";
import { PILOT_WORKSPACE } from "../pilot";
import { createRepository } from "../repository";
import { createTestDb } from "../test-db";
import type {
  AgentAction,
  AnswerKeyLabels,
  NeedLabel,
  PmJudgement,
  RequestRef,
} from "./answer-key";
import { createAnswerKeyScoring, scoreAgentCorrectness, scorePmAgreement } from "./answer-key";
import { createReviewService, createSignalService } from "./index";
import { agent, cedar, fakeEmbedder, fakeJudge, payloadOf, staff, unit } from "./test-fixtures";

const need = (key: string, needId: string, confirmed = true): NeedLabel => ({
  confirmed,
  key,
  needId,
});

/** Need clusters: swap (fr-swap, fb-swap, fb-swap2), clock (fr-clock), export (fb-new, fb-new2). */
const KEY: AnswerKeyLabels = {
  featureRequests: [need("fr-swap", "swap"), need("fr-clock", "clock")],
  feedback: [
    need("fb-swap", "swap"),
    need("fb-swap2", "swap"),
    need("fb-new", "export"),
    need("fb-new2", "export"),
    need("fb-draft", "swap", false),
  ],
};

const backlog = (key: string): RequestRef => ({ backlog: key });
const filed = (feedbackItemId: string | null): RequestRef => ({ filedFor: feedbackItemId });
const BACKLOG = [backlog("fr-swap"), backlog("fr-clock")];

const engage = (
  kind: "comment" | "support",
  feedbackItemId: string | null,
  target: RequestRef,
): AgentAction => ({ feedbackItemId, kind, target });
const create = (feedbackItemId: string | null, existing: RequestRef[] = BACKLOG): AgentAction => ({
  existing,
  feedbackItemId,
  kind: "create",
});

describe("scoreAgentCorrectness", () => {
  it("scores each agent action by need cluster against the Answer Key", () => {
    const score = scoreAgentCorrectness(
      [
        // Correct: Support on a backlog request of the same need.
        engage("support", "fb-swap", backlog("fr-swap")),
        // Harm: Comment on a backlog request of a different need.
        engage("comment", "fb-swap", backlog("fr-clock")),
        // Correct: Support on a request filed earlier in the pilot for the same need.
        engage("support", "fb-new2", filed("fb-new")),
        // Harm: Support on a pilot request of a different need.
        engage("support", "fb-new", filed("fb-swap2")),
        // Unresolved: the target was filed without a feedback item, so its need is unknown.
        engage("support", "fb-swap", filed(null)),
        // Miss: a backlog request of the same need existed.
        create("fb-swap"),
        // Correct: no request of the need existed yet.
        create("fb-new"),
        // Miss: a request of the same need was filed earlier in the pilot.
        create("fb-new2", [...BACKLOG, filed("fb-new")]),
        // Unmatched: no Answer Key entry.
        create("fb-unknown"),
        // Unlinked: no feedback item on its Check.
        create(null),
        // Excluded: unconfirmed entry.
        engage("support", "fb-draft", backlog("fr-swap")),
      ],
      KEY,
    );

    assert.deepEqual(score, {
      actions: 11,
      correct: 3,
      excludedUnconfirmed: 1,
      harm: 2,
      miss: 2,
      rate: 3 / 7,
      scored: 7,
      unlinked: 1,
      unmatched: 1,
      unresolved: 1,
    });
  });

  it("treats an unconfirmed backlog label as an unresolved target", () => {
    const key: AnswerKeyLabels = { ...KEY, featureRequests: [need("fr-swap", "swap", false)] };
    const score = scoreAgentCorrectness([engage("support", "fb-swap", backlog("fr-swap"))], key);
    assert.equal(score.unresolved, 1);
    assert.equal(score.rate, null);
  });
});

const judged = (
  feedbackItemId: string | null,
  verdict: PmJudgement["verdict"],
  blind = false,
): PmJudgement => ({ blind, feedbackItemId, verdict });
const duplicateOf = (other: RequestRef): PmJudgement["verdict"] => ({ kind: "duplicate", other });
const notDuplicate = (earlier: RequestRef[] = BACKLOG): PmJudgement["verdict"] => ({
  earlier,
  kind: "not_duplicate",
});

describe("scorePmAgreement", () => {
  it("compares each decided new request with its need cluster, blind and non-blind apart", () => {
    const score = scorePmAgreement(
      [
        // Agree: Duplicate of a backlog request of the same need.
        judged("fb-swap", duplicateOf(backlog("fr-swap"))),
        // Agree: Duplicate of an earlier pilot request of the same need.
        judged("fb-new2", duplicateOf(filed("fb-new"))),
        // Disagree: Duplicate of a request of a different need.
        judged("fb-swap", duplicateOf(backlog("fr-clock"))),
        // Disagree: not a duplicate, though an earlier request shares the need.
        judged("fb-swap", notDuplicate()),
        // Agree: not a duplicate, and no earlier request shares the need.
        judged("fb-new", notDuplicate()),
        // Unresolved: the other side's need is unknown.
        judged("fb-new", duplicateOf(filed(null))),
        // Blind disagree: an earlier pilot request shares the need.
        judged("fb-new2", notDuplicate([...BACKLOG, filed("fb-new")]), true),
        // Blind disagree: Duplicate of a different need.
        judged("fb-new", duplicateOf(backlog("fr-swap")), true),
        // Blind agree.
        judged("fb-swap2", duplicateOf(backlog("fr-swap")), true),
        judged("fb-draft", notDuplicate(), true),
        judged("fb-unknown", notDuplicate(), true),
        judged(null, notDuplicate(), true),
      ],
      KEY,
    );

    assert.deepEqual(score.nonBlind, {
      agree: 3,
      decided: 6,
      disagree: 2,
      excludedUnconfirmed: 0,
      rate: 0.6,
      unlinked: 0,
      unmatched: 0,
      unresolved: 1,
    });
    assert.deepEqual(score.blind, {
      agree: 1,
      decided: 6,
      disagree: 2,
      excludedUnconfirmed: 1,
      rate: 1 / 3,
      unlinked: 1,
      unmatched: 1,
      unresolved: 0,
    });
  });
});

/** The Pilot Workspace on PGlite with a two-request backlog loaded as the pilot loader does. */
const pilotHarness = async (options: { blindShare?: number } = {}) => {
  const db = await createTestDb();
  const repo = createRepository(db);
  const { id: workspaceId } = await repo.ensureWorkspace(PILOT_WORKSPACE);
  const loadBacklog = async (key: string, title: string, index: number) =>
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
  const swap = await loadBacklog("fr-swap", "Shift swaps in the app", 0);
  const other = await loadBacklog("fr-other", "Payroll export", 1);
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

const PILOT_KEY: AnswerKeyLabels = {
  featureRequests: [need("fr-swap", "swap"), need("fr-other", "payroll")],
  feedback: [
    need("fb-1", "swap"),
    need("fb-2", "swap"),
    need("fb-3", "export"),
    need("fb-4", "swap"),
    need("fb-5", "export"),
    need("fb-6", "swap", false),
    need("fb-7", "timeclock"),
  ],
};

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

const score = async (pilot: Pilot) =>
  await createAnswerKeyScoring({ answerKey: PILOT_KEY, repo: pilot.repo }).score();

describe("createAnswerKeyScoring (Pilot Workspace)", () => {
  it("scores pilot agent actions linked through their Check, ignoring staff and other Origins", async () => {
    const pilot = await pilotHarness();
    // Correct.
    await supportFor(pilot, "fb-1", pilot.swap.id);
    // Harm.
    await supportFor(pilot, "fb-2", pilot.other.id);
    // Miss: fr-swap shares fb-4's need.
    await createFor(pilot, "fb-4");
    // Correct: nothing shares fb-3's need yet.
    await createFor(pilot, "fb-3");
    // Excluded: unconfirmed.
    await createFor(pilot, "fb-6");
    // Unlinked.
    await createFor(pilot, undefined);
    // Unmatched.
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

    const { agentCorrectness } = await score(pilot);

    assert.deepEqual(agentCorrectness, {
      actions: 7,
      correct: 2,
      excludedUnconfirmed: 1,
      harm: 1,
      miss: 1,
      rate: 0.5,
      scored: 4,
      unlinked: 1,
      unmatched: 1,
      unresolved: 0,
    });
  });

  it("counts a Support onto a request filed earlier in the pilot for the same need as correct", async () => {
    const pilot = await pilotHarness();
    // Correct: the first filing of the export need.
    const first = await createFor(pilot, "fb-3");
    // Correct: the intake duplicate the pilot measures, supported instead of created.
    await supportFor(pilot, "fb-5", first.id);
    // Harm: fb-1 is the swap need.
    await supportFor(pilot, "fb-1", first.id, "Other Account");
    // Miss: the export request already exists.
    await createFor(pilot, "fb-5");

    const { agentCorrectness } = await score(pilot);

    assert.deepEqual(
      [agentCorrectness.correct, agentCorrectness.harm, agentCorrectness.miss],
      [2, 1, 1],
    );
  });

  it("scores Review Decisions on new pilot requests, blind and non-blind apart", async () => {
    const blindPilot = await pilotHarness({ blindShare: 1 });
    const blindDup = await createFor(blindPilot, "fb-1");
    const blindNone = await createFor(blindPilot, "fb-2");
    const undecided = await createFor(blindPilot, "fb-4");
    // Blind agree: same need as fr-swap.
    await blindPilot.review.decide(
      {
        canonicalId: blindPilot.swap.id,
        decision: "duplicate",
        featureRequestId: blindDup.id,
        otherId: blindPilot.swap.id,
      },
      staff,
    );
    // Blind disagree: fr-swap existed with the same need.
    await blindPilot.review.decide({ decision: "none", featureRequestId: blindNone.id }, staff);

    const blindScores = await score(blindPilot);
    assert.deepEqual(blindScores.pmAgreement.blind, {
      agree: 1,
      decided: 2,
      disagree: 1,
      excludedUnconfirmed: 0,
      rate: 0.5,
      unlinked: 0,
      unmatched: 0,
      unresolved: 0,
    });
    assert.equal(blindScores.pmAgreement.nonBlind.decided, 0);
    assert.ok(undecided.id);

    const pilot = await pilotHarness();
    const related = await createFor(pilot, "fb-1");
    const distinct = await createFor(pilot, "fb-3");
    const intake = await createFor(pilot, "fb-5");
    const wrongDup = await createFor(pilot, "fb-7");
    const undone = await createFor(pilot, "fb-2");
    // Disagree: fr-swap shares fb-1's need.
    await pilot.review.decide(
      {
        decision: "related",
        featureRequestId: related.id,
        otherId: pilot.swap.id,
        sharedDimension: "shifts",
      },
      staff,
    );
    // Agree: nothing earlier shares fb-3's need.
    await pilot.review.decide(
      { decision: "distinct", featureRequestId: distinct.id, otherId: pilot.swap.id },
      staff,
    );
    // Agree: Duplicate of the earlier pilot request of the same need.
    await pilot.review.decide(
      {
        canonicalId: distinct.id,
        decision: "duplicate",
        featureRequestId: intake.id,
        otherId: distinct.id,
      },
      staff,
    );
    // Disagree: canonical kept on the new side, paired with a different need.
    await pilot.review.decide(
      {
        canonicalId: wrongDup.id,
        decision: "duplicate",
        featureRequestId: wrongDup.id,
        otherId: pilot.other.id,
      },
      staff,
    );
    // Undone: not decided.
    const withdrawn = await pilot.review.decide(
      { decision: "none", featureRequestId: undone.id },
      staff,
    );
    await pilot.review.undo(withdrawn.id, staff);

    const scores = await score(pilot);
    // `distinct` is now also on the intake Duplicate pair: both sides share the export need, so
    // it still agrees; each request counts once.
    assert.deepEqual(scores.pmAgreement.nonBlind, {
      agree: 2,
      decided: 4,
      disagree: 2,
      excludedUnconfirmed: 0,
      rate: 0.5,
      unlinked: 0,
      unmatched: 0,
      unresolved: 0,
    });
    assert.equal(scores.pmAgreement.blind.decided, 0);
  });

  it("does not count a Related or Distinct decision for the request it only names as the other side", async () => {
    const pilot = await pilotHarness();
    const named = await createFor(pilot, "fb-3");
    const decided = await createFor(pilot, "fb-1");
    // Disagree for `decided` (fr-swap shares fb-1's need); `named` has no decision of its own.
    await pilot.review.decide(
      {
        decision: "related",
        featureRequestId: decided.id,
        otherId: named.id,
        sharedDimension: "shifts",
      },
      staff,
    );

    const scores = await score(pilot);

    assert.deepEqual(
      [scores.pmAgreement.nonBlind.decided, scores.pmAgreement.nonBlind.disagree],
      [1, 1],
    );
  });
});
