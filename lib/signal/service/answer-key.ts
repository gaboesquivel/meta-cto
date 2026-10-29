import type { Origin } from "../contracts";
import { rateOf } from "../contracts";
import { PILOT_ORIGIN, PILOT_WORKSPACE, pilotKeyOfSeed } from "../pilot";
import type { FeatureRequestRow, SignalRepository } from "../repository";

/**
 * Answer Key scoring (spec 003, decision 0003): Agent Correctness and Product Manager agreement
 * for the Pilot Workspace, against the person-confirmed Answer Key. The pure functions take plain
 * data so the Proof Report (task 07) can reuse them; `createAnswerKeyScoring` reads the pilot.
 *
 * The Answer Key is a set of need clusters: every backlog Feature Request and every feedback item
 * carries a confirmed `needId`; two share a need iff their `needId`s are equal. A Feature Request
 * filed in the pilot has the `needId` of the feedback item that created it.
 *
 * Link from an action to its feedback item: the agent harness passes the pilot feedback item key
 * as `feedbackItemId` on `check_feature_request` / `POST /api/checks`; it is stored on that
 * Check's `draft_checked` event. A Support, Comment or create that passes the Check's `checkId`
 * belongs to that feedback item. Without a `checkId` or `feedbackItemId` the action is unlinked.
 */

/** One confirmed (or not) need label: a backlog request key or a feedback item key. */
export interface NeedLabel {
  /** A person set `confirmedBy` and `confirmedAt`; unconfirmed labels are excluded and counted. */
  confirmed: boolean;
  key: string;
  needId: string;
}

export interface AnswerKeyLabels {
  featureRequests: NeedLabel[];
  feedback: NeedLabel[];
}

/**
 * A Feature Request as the Answer Key knows it: a backlog request by its key, or a request filed
 * in the pilot by the feedback item whose Check created it (null when that Check named none).
 */
export type RequestRef = { backlog: string } | { filedFor: string | null };

/** An agent's Support, Comment or create in the pilot. */
export type AgentAction =
  | { feedbackItemId: string | null; kind: "comment" | "support"; target: RequestRef }
  | {
      /** Every Feature Request that existed when it was created: backlog and earlier filings. */
      existing: RequestRef[];
      feedbackItemId: string | null;
      kind: "create";
    };

export type AgentOutcome =
  | "correct"
  | "harm"
  | "miss"
  | "unconfirmed"
  | "unlinked"
  | "unmatched"
  | "unresolved";

/**
 * Agent Correctness with its counts. `rate` = correct ÷ scored, where scored = correct + harm +
 * miss. Unlinked (no feedback item), unmatched (no Answer Key entry), unconfirmed (entry not
 * confirmed) and unresolved (the target's need is not in the confirmed key) are counted, not scored.
 */
export interface AgentCorrectness {
  actions: number;
  correct: number;
  excludedUnconfirmed: number;
  /** A Support or Comment on a request of a different need. */
  harm: number;
  /** A create when a request of the same need already existed. */
  miss: number;
  rate: number | null;
  scored: number;
  unlinked: number;
  unmatched: number;
  unresolved: number;
}

/** What the Product Manager decided for a new pilot Feature Request. */
export type PmVerdict =
  | { kind: "duplicate"; other: RequestRef }
  | {
      /** Feature Requests created before it (backlog and earlier filings). */
      earlier: RequestRef[];
      kind: "not_duplicate";
    };

/** A decided new pilot Feature Request: Related, Distinct and No Duplicates are not_duplicate. */
export interface PmJudgement {
  /** Decided under Blind Review: the request's own active decision is blind. */
  blind: boolean;
  /** The feedback item whose Check created the request. */
  feedbackItemId: string | null;
  verdict: PmVerdict;
}

/** Agreement with the Answer Key over decided new requests; `rate` = agree ÷ (agree + disagree). */
export interface PmAgreement {
  agree: number;
  /** Decided new requests in this group, including those counted but not scored. */
  decided: number;
  disagree: number;
  excludedUnconfirmed: number;
  rate: number | null;
  unlinked: number;
  unmatched: number;
  unresolved: number;
}

export interface AnswerKeyScores {
  agentCorrectness: AgentCorrectness;
  pmAgreement: { blind: PmAgreement; nonBlind: PmAgreement };
}

type ItemStatus =
  | { needId: string; status: "scored" }
  | { status: "unconfirmed" | "unlinked" | "unmatched" };

interface KeyIndex {
  item: (feedbackItemId: string | null) => ItemStatus;
  /** The confirmed need of a request; undefined when the key cannot say. */
  needOf: (ref: RequestRef) => string | undefined;
}

const confirmedNeeds = (labels: NeedLabel[]) =>
  new Map(labels.filter((label) => label.confirmed).map((label) => [label.key, label.needId]));

const indexOf = (answerKey: AnswerKeyLabels): KeyIndex => {
  const feedback = new Map(answerKey.feedback.map((label) => [label.key, label]));
  const feedbackNeeds = confirmedNeeds(answerKey.feedback);
  const backlogNeeds = confirmedNeeds(answerKey.featureRequests);
  return {
    item: (feedbackItemId) => {
      if (feedbackItemId === null) return { status: "unlinked" };
      const label = feedback.get(feedbackItemId);
      if (!label) return { status: "unmatched" };
      return label.confirmed
        ? { needId: label.needId, status: "scored" }
        : { status: "unconfirmed" };
    },
    needOf: (ref) => {
      if ("backlog" in ref) return backlogNeeds.get(ref.backlog);
      return ref.filedFor === null ? undefined : feedbackNeeds.get(ref.filedFor);
    },
  };
};

/**
 * Support or Comment: correct when the target has the item's need, harm when it has another.
 * Create: miss when a request of the item's need already existed, otherwise correct (existing
 * requests whose need the key cannot say are not counted against it).
 */
export const agentOutcome = (action: AgentAction, index: KeyIndex): AgentOutcome => {
  const item = index.item(action.feedbackItemId);
  if (item.status !== "scored") return item.status;
  if (action.kind === "create") {
    return action.existing.some((ref) => index.needOf(ref) === item.needId) ? "miss" : "correct";
  }
  const target = index.needOf(action.target);
  if (target === undefined) return "unresolved";
  return target === item.needId ? "correct" : "harm";
};

export const scoreAgentCorrectness = (
  actions: AgentAction[],
  answerKey: AnswerKeyLabels,
): AgentCorrectness => {
  const index = indexOf(answerKey);
  const counts: Record<AgentOutcome, number> = {
    correct: 0,
    harm: 0,
    miss: 0,
    unconfirmed: 0,
    unlinked: 0,
    unmatched: 0,
    unresolved: 0,
  };
  for (const action of actions) counts[agentOutcome(action, index)] += 1;
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
    unresolved: counts.unresolved,
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
  unresolved: 0,
});

/**
 * Duplicate: agrees when the other side has the same need, disagrees when it has another.
 * Related, Distinct or No Duplicates: agrees when no earlier request has the same need.
 */
const agreement = (verdict: PmVerdict, needId: string, index: KeyIndex) => {
  if (verdict.kind === "not_duplicate") {
    return verdict.earlier.some((ref) => index.needOf(ref) === needId) ? "disagree" : "agree";
  }
  const other = index.needOf(verdict.other);
  if (other === undefined) return "unresolved";
  return other === needId ? "agree" : "disagree";
};

export const scorePmAgreement = (
  judgements: PmJudgement[],
  answerKey: AnswerKeyLabels,
): AnswerKeyScores["pmAgreement"] => {
  const index = indexOf(answerKey);
  const groups = { blind: emptyAgreement(), nonBlind: emptyAgreement() };
  for (const judgement of judgements) {
    const group = judgement.blind ? groups.blind : groups.nonBlind;
    group.decided += 1;
    const item = index.item(judgement.feedbackItemId);
    if (item.status === "scored") group[agreement(judgement.verdict, item.needId, index)] += 1;
    else if (item.status === "unconfirmed") group.excludedUnconfirmed += 1;
    else group[item.status] += 1;
  }
  for (const group of [groups.blind, groups.nonBlind]) {
    group.rate = rateOf(group.agree, group.agree + group.disagree);
  }
  return groups;
};

/** Both measures from plain data. */
export const scoreAnswerKey = (input: {
  actions: AgentAction[];
  answerKey: AnswerKeyLabels;
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

const PAGE = 500;

/** Every Feature Request in the Workspace, oldest first. */
const allRequests = async (scope: PilotScope) => {
  const rows: FeatureRequestRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    // oxlint-disable-next-line no-await-in-loop
    const page = await scope.repo.listFeatureRequests({
      limit: PAGE,
      offset,
      workspaceId: scope.workspaceId,
    });
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows.toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
};

const UNKNOWN: RequestRef = { filedFor: null };

const loadPilotActivity = async (scope: PilotScope) => {
  const feedbackOf = await feedbackByCheck(scope);
  const linked = (checkId: string | null) => (checkId ? (feedbackOf.get(checkId) ?? null) : null);
  const rows = await allRequests(scope);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const refOf = (row: FeatureRequestRow): RequestRef => {
    const backlog = pilotKeyOfSeed(row.seedKey);
    return backlog ? { backlog } : { filedFor: linked(row.checkId) };
  };
  /** The backlog and every request filed before `row`. */
  const before = (row: FeatureRequestRow | undefined): RequestRef[] =>
    rows
      .filter(
        (other) =>
          other.id !== row?.id &&
          (!other.createdViaCheck ||
            (row !== undefined && other.createdAt.getTime() < row.createdAt.getTime())),
      )
      .map(refOf);

  const created = await eventsOf(scope, "feature_request_created");
  const supported = await eventsOf(scope, "feature_request_supported");
  const commented = await eventsOf(scope, "comment_added");
  const engaged = [
    ...supported.map((event) => ({ ...event, kind: "support" as const })),
    ...commented.map((event) => ({ ...event, kind: "comment" as const })),
  ];
  const actions: AgentAction[] = [
    ...created
      .filter((event) => event.isAgent)
      .map((event) => ({
        existing: before(rowById.get(event.subjectId)),
        feedbackItemId: linked(event.checkId),
        kind: "create" as const,
      })),
    ...engaged
      .filter((event) => event.isAgent)
      .map((event) => {
        const target = rowById.get(event.subjectId);
        return {
          feedbackItemId: linked(event.checkId),
          kind: event.kind,
          target: target ? refOf(target) : UNKNOWN,
        };
      }),
  ];

  const newIds = [...new Set(created.map((event) => event.subjectId))];
  const decisions = await scope.repo.listReviewDecisions({
    activeOnly: true,
    featureRequestIds: newIds,
  });
  const judgements = newIds.flatMap((id): PmJudgement[] => {
    const touching = decisions.filter((row) => row.featureRequestId === id || row.otherId === id);
    if (touching.length === 0) return [];
    const duplicate = touching.find((row) => row.decision === "duplicate");
    const otherId =
      duplicate?.featureRequestId === id ? duplicate.otherId : duplicate?.featureRequestId;
    const other = otherId ? rowById.get(otherId) : undefined;
    const row = rowById.get(id);
    return [
      {
        blind: touching.some((decision) => decision.featureRequestId === id && decision.blind),
        feedbackItemId: linked(row?.checkId ?? null),
        verdict: duplicate
          ? { kind: "duplicate", other: other ? refOf(other) : UNKNOWN }
          : { earlier: before(row), kind: "not_duplicate" },
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
  answerKey: AnswerKeyLabels;
  repo: SignalRepository;
}) => ({
  score: async (): Promise<AnswerKeyScores> => {
    const { id: workspaceId } = await deps.repo.ensureWorkspace(PILOT_WORKSPACE);
    const scope: PilotScope = { origin: PILOT_ORIGIN, repo: deps.repo, workspaceId };
    const activity = await loadPilotActivity(scope);
    return scoreAnswerKey({ ...activity, answerKey: deps.answerKey });
  },
});
