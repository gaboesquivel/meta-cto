import { vi } from "vitest";

import type {
  CheckResult,
  CommentView,
  FeatureRequestDetail,
  ReviewDecision,
  ReviewMetrics,
  ReviewQueue,
  ReviewService,
  ScanResult,
  SignalService,
  SupportView,
} from "@/lib/signal/contracts";

export const FR_ID = "11111111-1111-4111-8111-111111111111";
export const CHECK_ID = "22222222-2222-4222-8222-222222222222";
export const OTHER_FR_ID = "55555555-5555-4555-8555-555555555555";
export const DECISION_ID = "66666666-6666-4666-8666-666666666666";
export const SUGGESTION_ID = "77777777-7777-4777-8777-777777777777";

export const actor = { name: "Ana", type: "staff" } as const;
export const draft = {
  description: "When I trade a shift it sometimes never appears on my schedule.",
  title: "Traded shifts sometimes don't show",
};
export const onBehalfOf = { account: { name: "Cedar Market", segment: "retail", size: "24" } };

export const checkResult: CheckResult = {
  candidates: [
    {
      featureRequestId: FR_ID,
      reason: "Both ask for reliable shift-trade updates.",
      sharedDimension: null,
      title: "Shift swaps don't sync reliably",
      verdict: "same_need",
    },
  ],
  checkId: CHECK_ID,
  consideredCount: 10,
  degraded: false,
  expiresAt: "2026-10-28T12:30:00.000Z",
  nextAction: "support_or_comment",
  underlyingNeed: "Reliable shift-trade updates",
};

export const featureRequest: FeatureRequestDetail = {
  accountCount: 1,
  comments: [],
  createdAt: "2026-10-28T12:00:00.000Z",
  createdBy: actor,
  description: draft.description,
  duplicateOf: null,
  duplicates: [],
  id: FR_ID,
  onBehalfOf: { account: "Cedar Market", requester: null },
  relatedLinks: [],
  reviewHistory: [],
  skipReason: null,
  supportCount: 1,
  supports: [],
  title: draft.title,
  underlyingNeed: "Reliable shift-trade updates",
};

export const support: SupportView = {
  account: { name: "Cedar Market", plan: null, segment: "retail", size: "24" },
  actor,
  createdAt: "2026-10-28T12:00:00.000Z",
  id: "33333333-3333-4333-8333-333333333333",
  quote: null,
  requester: null,
};

export const comment: CommentView = {
  account: null,
  actor,
  body: "Seen at three stores.",
  createdAt: "2026-10-28T12:00:00.000Z",
  id: "44444444-4444-4444-8444-444444444444",
};

export const metrics: ReviewMetrics = {
  backlogBaseline: { duplicates: 3, rate: 0.3, reviewed: 10 },
  checks: 4,
  checksWithSameNeed: 2,
  createsAfterSameNeed: 1,
  intakeDuplicateRate: { duplicates: 1, rate: 0.25, reviewed: 4 },
  origin: "demo",
  reviewCoverage: { rate: 0.8, reviewed: 4, total: 5 },
  suggestionAcceptance: 0.5,
  suspectedDuplication: { open: 2, rate: 0.1, total: 20 },
  undoRate: { decisions: 4, rate: 0.25, undone: 1 },
};

export const reviewDecision: ReviewDecision = {
  actor,
  blind: false,
  canonicalId: OTHER_FR_ID,
  createdAt: "2026-10-28T13:00:00.000Z",
  decision: "duplicate",
  featureRequestId: FR_ID,
  id: DECISION_ID,
  otherId: OTHER_FR_ID,
  sharedDimension: null,
  suggestionId: SUGGESTION_ID,
  undoneAt: null,
  undoneBy: null,
};

const summary = (id: string, title: string) => ({
  accountCount: 1,
  createdAt: "2026-10-28T12:00:00.000Z",
  description: draft.description,
  id,
  supportCount: 1,
  title,
  underlyingNeed: "Reliable shift-trade updates",
});

export const reviewQueue: ReviewQueue = {
  counts: { backlog: 1, new: 0 },
  items: [
    {
      blind: false,
      featureRequest: summary(FR_ID, draft.title),
      isNew: false,
      suspicions: [
        {
          decision: null,
          judgedAt: "2026-10-28T12:10:00.000Z",
          model: "test-judge",
          other: summary(OTHER_FR_ID, "Shift swaps don't sync reliably"),
          reason: "Both ask for reliable shift-trade updates.",
          source: "scan",
          suggestionId: SUGGESTION_ID,
        },
      ],
    },
  ],
};

/** A queue whose only item is under Blind Review: no suspicion, Reason or restated need. */
export const blindReviewQueue: ReviewQueue = {
  blindChoices: [
    { id: FR_ID, title: draft.title },
    { id: OTHER_FR_ID, title: "Shift swaps don't sync reliably" },
  ],
  counts: { backlog: 0, new: 1 },
  items: [
    {
      blind: true,
      featureRequest: { ...summary(FR_ID, draft.title), underlyingNeed: null },
      isNew: true,
      suspicions: [],
    },
  ],
};

export const scanResult: ScanResult = { pairsFound: 1, remaining: 3, scanned: 20 };

export const makeReviewService = () =>
  ({
    decide: vi.fn(() => Promise.resolve(reviewDecision)),
    metrics: vi.fn(() => Promise.resolve(metrics)),
    queue: vi.fn(() => Promise.resolve(reviewQueue)),
    scan: vi.fn(() => Promise.resolve(scanResult)),
    undo: vi.fn((_id: string, undoneBy: ReviewDecision["actor"]) =>
      Promise.resolve({ ...reviewDecision, undoneAt: "2026-10-28T14:00:00.000Z", undoneBy }),
    ),
  }) satisfies ReviewService;

export const makeService = () =>
  ({
    check: vi.fn(() => Promise.resolve(checkResult)),
    comment: vi.fn(() => Promise.resolve(comment)),
    create: vi.fn(() => Promise.resolve(featureRequest)),
    get: vi.fn(() => Promise.resolve(featureRequest)),
    search: vi.fn(() =>
      Promise.resolve({
        items: [featureRequest],
        nextCursor: 20,
      }),
    ),
    support: vi.fn(() => Promise.resolve({ created: true, featureRequest, support })),
  }) satisfies SignalService;

let ipCounter = 0;

/** Each request gets a fresh client IP unless one is given, so rate limits don't leak across tests. */
export const jsonRequest = (
  path: string,
  { body, ip, method = "POST" }: { body?: unknown; ip?: string; method?: string } = {},
) => {
  ipCounter += 1;
  let payload: string | undefined;
  if (typeof body === "string") payload = body;
  else if (body !== undefined) payload = JSON.stringify(body);
  return new Request(`http://localhost${path}`, {
    body: payload,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": ip ?? `10.0.0.${ipCounter}`,
    },
    method,
  });
};

export const idParams = (id: string) => ({ params: Promise.resolve({ id }) });
