import { vi } from "vitest";

import type {
  CheckResult,
  CommentView,
  FeatureRequestDetail,
  Metrics,
  SignalService,
  SupportView,
} from "@/lib/signal/contracts";

export const FR_ID = "11111111-1111-4111-8111-111111111111";
export const CHECK_ID = "22222222-2222-4222-8222-222222222222";

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
  id: FR_ID,
  onBehalfOf: { account: "Cedar Market", requester: null },
  relatedLinks: [],
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

export const metrics: Metrics = {
  checks: 4,
  checksWithSameNeed: 2,
  createsAfterSameNeed: 1,
  fragmentationRate: null,
  reviewCoverage: 0,
  suggestionAcceptance: 0.5,
};

export const makeService = () =>
  ({
    check: vi.fn(() => Promise.resolve(checkResult)),
    comment: vi.fn(() => Promise.resolve(comment)),
    create: vi.fn(() => Promise.resolve(featureRequest)),
    get: vi.fn(() => Promise.resolve(featureRequest)),
    metrics: vi.fn(() => Promise.resolve(metrics)),
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
