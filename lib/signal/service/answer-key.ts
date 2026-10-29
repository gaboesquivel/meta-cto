import type { Origin } from "../contracts";
import { rateOf } from "../contracts";
import { PILOT_ORIGIN, PILOT_WORKSPACE, pilotKeyOfSeed } from "../pilot";
import type { FeatureRequestRow, SignalRepository } from "../repository";

/**
 * Answer Key scoring (spec 003, decision 0003): Agent Correctness and Product Manager agreement
 * for the Pilot Workspace, against the person-confirmed Answer Key. The pure functions take plain
 * data so the Proof Report (task 07) can reuse them; `createAnswerKeyScoring` reads the pilot.
 *
 * Link from an action to its feedback item: the agent harness passes the pilot feedback item key
 * as `feedbackItemId` on `check_feature_request` / `POST /api/checks`; it is stored on that
 * Check's `draft_checked` event. A Support, Comment or create that passes the Check's `checkId`
 * belongs to that feedback item. Without a `checkId` or `feedbackItemId` the action is unlinked.
 */

/** One Answer Key entry: the backlog request key the feedback item shares a need with, or null. */
export interface AnswerKeyLabel {
  /** A person set `confirmedBy` and `confirmedAt`; unconfirmed entries are excluded and counted. */
  confirmed: boolean;
  feedback: string;
  sharesNeedWith: string | null;
}

export type AgentActionKind = "comment" | "create" | "support";

/** An agent's Support, Comment or create in the pilot. */
export interface AgentAction {
  /** The pilot feedback item the action files, from its Check; null when unlinked. */
  feedbackItemId: string | null;
  kind: AgentActionKind;
  /**
   * Support and Comment: the backlog request key the target shares a need with (its own key, or
   * for a request filed in the pilot, the confirmed key of the feedback item that created it);
   * null when it resolves to none. Ignored for create.
   */
  targetKey: string | null;
}

export type AgentOutcome = "correct" | "harm" | "miss" | "unconfirmed" | "unlinked" | "unmatched";

/**
 * Agent Correctness with its counts. `rate` = correct ÷ scored, where scored = correct + harm +
 * miss; unlinked, unmatched (no Answer Key entry) and unconfirmed actions are counted, not scored.
 */
export interface AgentCorrectness {
  actions: number;
  correct: number;
  excludedUnconfirmed: number;
  /** A Support or Comment on a request the Answer Key says is a different need. */
  harm: number;
  /** A create when the Answer Key names an existing request. */
  miss: number;
  rate: number | null;
  scored: number;
  unlinked: number;
  unmatched: number;
}

/** What the Product Manager decided for a new pilot Feature Request. */
export type PmVerdict =
  | {
      /** The key the other side of the active Duplicate pair resolves to (see `targetKey`). */
      duplicateOfKey: string | null;
      kind: "duplicate";
    }
  | { kind: "not_duplicate" };

/** A decided new pilot Feature Request: Related, Distinct and No Duplicates are not_duplicate. */
export interface PmJudgement {
  /** Decided under Blind Review: the request's own active decision is blind. */
  blind: boolean;
  feedbackItemId: string | null;
  verdict: PmVerdict;
}

/** Agreement with the Answer Key over decided new requests; `rate` = agree ÷ (agree + disagree). */
export interface PmAgreement {
  agree: number;
  /** Decided new requests in this group, including unlinked, unmatched and unconfirmed. */
  decided: number;
  disagree: number;
  excludedUnconfirmed: number;
  rate: number | null;
  unlinked: number;
  unmatched: number;
}

export interface AnswerKeyScores {
  agentCorrectness: AgentCorrectness;
  pmAgreement: { blind: PmAgreement; nonBlind: PmAgreement };
}

type Lookup = (
  feedbackItemId: string | null,
) =>
  | { entry: AnswerKeyLabel; status: "scored" }
  | { status: "unconfirmed" | "unlinked" | "unmatched" };

const lookupIn = (answerKey: AnswerKeyLabel[]): Lookup => {
  const byFeedback = new Map(answerKey.map((entry) => [entry.feedback, entry]));
  return (feedbackItemId) => {
    if (feedbackItemId === null) return { status: "unlinked" };
    const entry = byFeedback.get(feedbackItemId);
    if (!entry) return { status: "unmatched" };
    return entry.confirmed ? { entry, status: "scored" } : { status: "unconfirmed" };
  };
};

/** Support or Comment on the keyed request: correct; anywhere else: harm. Create: miss or correct. */
export const agentOutcome = (action: AgentAction, lookup: Lookup): AgentOutcome => {
  const found = lookup(action.feedbackItemId);
  if (found.status !== "scored") return found.status;
  const keyed = found.entry.sharesNeedWith;
  if (action.kind === "create") return keyed === null ? "correct" : "miss";
  return keyed !== null && action.targetKey === keyed ? "correct" : "harm";
};

export const scoreAgentCorrectness = (
  actions: AgentAction[],
  answerKey: AnswerKeyLabel[],
): AgentCorrectness => {
  const lookup = lookupIn(answerKey);
  const counts: Record<AgentOutcome, number> = {
    correct: 0,
    harm: 0,
    miss: 0,
    unconfirmed: 0,
    unlinked: 0,
    unmatched: 0,
  };
  for (const action of actions) counts[agentOutcome(action, lookup)] += 1;
  const scored = counts.correct + counts.harm + counts.miss;
  return {
    actions: actions.length,
    correct: counts.correct,
    excludedUnconfirmed: counts.unconfirmed,
    harm: counts.harm,
    miss: counts.miss,
    rate: rateOf(counts.correct, scored),
    scored,
    unlinked: counts.unlinked,
    unmatched: counts.unmatched,
  };
};

const emptyAgreement = (): PmAgreement => ({
  agree: 0,
  decided: 0,
  disagree: 0,
  excludedUnconfirmed: 0,
  rate: null,
  unlinked: 0,
  unmatched: 0,
});

/** Duplicate of the keyed request agrees; anything else disagrees when the key names one. */
const agrees = (verdict: PmVerdict, keyed: string | null) =>
  verdict.kind === "duplicate"
    ? keyed !== null && verdict.duplicateOfKey === keyed
    : keyed === null;

export const scorePmAgreement = (
  judgements: PmJudgement[],
  answerKey: AnswerKeyLabel[],
): AnswerKeyScores["pmAgreement"] => {
  const lookup = lookupIn(answerKey);
  const groups = { blind: emptyAgreement(), nonBlind: emptyAgreement() };
  for (const judgement of judgements) {
    const group = judgement.blind ? groups.blind : groups.nonBlind;
    group.decided += 1;
    const found = lookup(judgement.feedbackItemId);
    if (found.status === "scored") {
      if (agrees(judgement.verdict, found.entry.sharesNeedWith)) group.agree += 1;
      else group.disagree += 1;
    } else if (found.status === "unconfirmed") group.excludedUnconfirmed += 1;
    else group[found.status] += 1;
  }
  for (const group of [groups.blind, groups.nonBlind]) {
    group.rate = rateOf(group.agree, group.agree + group.disagree);
  }
  return groups;
};

/** Both measures from plain data. */
export const scoreAnswerKey = (input: {
  actions: AgentAction[];
  answerKey: AnswerKeyLabel[];
  judgements: PmJudgement[];
}): AnswerKeyScores => ({
  agentCorrectness: scoreAgentCorrectness(input.actions, input.answerKey),
  pmAgreement: scorePmAgreement(input.judgements, input.answerKey),
});

// Reading the Pilot Workspace.

interface PilotScope {
  origin: Origin;
  repo: SignalRepository;
  workspaceId: string;
}

interface ActionEvent {
  checkId: string | null;
  isAgent: boolean;
  subjectId: string;
}

const eventsOf = async (scope: PilotScope, type: string): Promise<ActionEvent[]> => {
  const rows = await scope.repo.eventsOfType(scope.workspaceId, type, scope.origin);
  return rows.flatMap((row) => {
    const payload = row.payload as { actor?: { type?: unknown }; checkId?: unknown };
    if (!row.subjectId) return [];
    return [
      {
        checkId: typeof payload.checkId === "string" ? payload.checkId : null,
        isAgent: payload.actor?.type === "agent",
        subjectId: row.subjectId,
      },
    ];
  });
};

/** Check id → feedback item id, from this Origin's `draft_checked` events. */
const feedbackByCheck = async (scope: PilotScope) => {
  const rows = await scope.repo.eventsOfType(scope.workspaceId, "draft_checked", scope.origin);
  const map = new Map<string, string>();
  for (const row of rows) {
    const payload = row.payload as { checkId?: unknown; feedbackItemId?: unknown };
    if (typeof payload.checkId === "string" && typeof payload.feedbackItemId === "string") {
      map.set(payload.checkId, payload.feedbackItemId);
    }
  }
  return map;
};

const loadPilotActivity = async (scope: PilotScope, answerKey: AnswerKeyLabel[]) => {
  const feedbackOf = await feedbackByCheck(scope);
  const linked = (checkId: string | null) => (checkId ? (feedbackOf.get(checkId) ?? null) : null);
  const created = await eventsOf(scope, "feature_request_created");
  const supported = await eventsOf(scope, "feature_request_supported");
  const commented = await eventsOf(scope, "comment_added");
  const engaged = [
    ...supported.map((event) => ({ ...event, kind: "support" as const })),
    ...commented.map((event) => ({ ...event, kind: "comment" as const })),
  ];
  const newIds = [...new Set(created.map((event) => event.subjectId))];
  const decisions = await scope.repo.listReviewDecisions({
    activeOnly: true,
    featureRequestIds: newIds,
  });
  const rows = await scope.repo.getFeatureRequests([
    ...new Set([
      ...newIds,
      ...engaged.map((event) => event.subjectId),
      ...decisions.flatMap((row) => [row.featureRequestId, row.otherId ?? row.featureRequestId]),
    ]),
  ]);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const confirmedKey = new Map(
    answerKey.filter((entry) => entry.confirmed).map((e) => [e.feedback, e.sharesNeedWith]),
  );
  /** A backlog request is its own key; a request filed in the pilot takes its item's key. */
  const keyOf = (row: FeatureRequestRow | undefined): string | null => {
    if (!row) return null;
    const own = pilotKeyOfSeed(row.seedKey);
    if (own) return own;
    const item = linked(row.checkId);
    return item ? (confirmedKey.get(item) ?? null) : null;
  };

  const actions: AgentAction[] = [
    ...created
      .filter((event) => event.isAgent)
      .map((event) => ({
        feedbackItemId: linked(event.checkId),
        kind: "create" as const,
        targetKey: null,
      })),
    ...engaged
      .filter((event) => event.isAgent)
      .map((event) => ({
        feedbackItemId: linked(event.checkId),
        kind: event.kind,
        targetKey: keyOf(rowById.get(event.subjectId)),
      })),
  ];

  const judgements = newIds.flatMap((id): PmJudgement[] => {
    const touching = decisions.filter((row) => row.featureRequestId === id || row.otherId === id);
    if (touching.length === 0) return [];
    const duplicate = touching.find((row) => row.decision === "duplicate");
    const otherId =
      duplicate?.featureRequestId === id ? duplicate.otherId : duplicate?.featureRequestId;
    return [
      {
        blind: touching.some((row) => row.featureRequestId === id && row.blind),
        feedbackItemId: linked(rowById.get(id)?.checkId ?? null),
        verdict: duplicate
          ? { duplicateOfKey: keyOf(otherId ? rowById.get(otherId) : undefined), kind: "duplicate" }
          : { kind: "not_duplicate" },
      },
    ];
  });
  return { actions, judgements };
};

/**
 * Answer Key scoring scoped to the Pilot Workspace and Origin `pilot`: demo, seed and eval
 * activity never count. `answerKey` comes from the frozen pilot files (`answerKeyLabels`).
 */
export const createAnswerKeyScoring = (deps: {
  answerKey: AnswerKeyLabel[];
  repo: SignalRepository;
}) => ({
  score: async (): Promise<AnswerKeyScores> => {
    const { id: workspaceId } = await deps.repo.ensureWorkspace(PILOT_WORKSPACE);
    const scope: PilotScope = { origin: PILOT_ORIGIN, repo: deps.repo, workspaceId };
    const activity = await loadPilotActivity(scope, deps.answerKey);
    return scoreAnswerKey({ ...activity, answerKey: deps.answerKey });
  },
});
