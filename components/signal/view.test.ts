import { describe, expect, it } from "vitest";

import type { CheckResult, SupportView } from "@/lib/signal/contracts";

import {
  buildCommentBody,
  buildOnBehalfOf,
  describeAccount,
  groupSupportsByAccount,
  isSkipReasonRequired,
  readApiError,
  splitCandidates,
} from "./view";

const support = (id: string, account: string, quote: string | null = null): SupportView => ({
  account: { name: account, plan: null, segment: "retail", size: "24 stores" },
  actor: { name: "Ana", type: "staff" },
  createdAt: "2026-10-28T00:00:00.000Z",
  id,
  quote,
  requester: null,
});

const result = (verdicts: CheckResult["candidates"][number]["verdict"][]): CheckResult => ({
  candidates: verdicts.map((verdict, index) => ({
    featureRequestId: `fr-${index}`,
    reason: verdict === "unknown" ? null : "because",
    sharedDimension: verdict === "related_need" ? "shift changes" : null,
    title: `Request ${index}`,
    verdict,
  })),
  checkId: "c1",
  consideredCount: verdicts.length,
  degraded: verdicts.includes("unknown"),
  expiresAt: "2026-10-28T00:30:00.000Z",
  nextAction: "create",
  underlyingNeed: "Need",
});

describe("groupSupportsByAccount", () => {
  it("groups Supports by Account name in first-seen order", () => {
    const groups = groupSupportsByAccount([
      support("1", "Cedar Market", "a"),
      support("2", "Harbor Bistro Group"),
      support("3", "Cedar Market", "b"),
    ]);
    expect(groups.map((group) => group.account.name)).toEqual([
      "Cedar Market",
      "Harbor Bistro Group",
    ]);
    expect(groups[0]?.supports.map((item) => item.id)).toEqual(["1", "3"]);
  });

  it("returns an empty list without Supports", () => {
    expect(groupSupportsByAccount([])).toEqual([]);
  });
});

describe("isSkipReasonRequired", () => {
  it("requires a Skip Reason when any candidate is Same Need", () => {
    expect(isSkipReasonRequired(result(["related_need", "same_need"]))).toBe(true);
  });

  it("does not require one for Related Need or unknown only", () => {
    expect(isSkipReasonRequired(result(["related_need", "unknown"]))).toBe(false);
    expect(isSkipReasonRequired(null)).toBe(false);
  });
});

describe("splitCandidates", () => {
  it("splits candidates by Verdict and drops Different", () => {
    const split = splitCandidates(result(["same_need", "related_need", "different", "unknown"]));
    expect(split.same.map((item) => item.featureRequestId)).toEqual(["fr-0"]);
    expect(split.related.map((item) => item.featureRequestId)).toEqual(["fr-1"]);
    expect(split.unknown.map((item) => item.featureRequestId)).toEqual(["fr-3"]);
  });
});

describe("describeAccount", () => {
  it("joins the known Account Context", () => {
    expect(
      describeAccount({ name: "Cedar Market", plan: "Pro", segment: "retail", size: "24 stores" }),
    ).toBe("24 stores · retail · Pro");
    expect(describeAccount({ name: "X", plan: null, segment: null, size: null })).toBe("");
  });
});

describe("buildOnBehalfOf", () => {
  it("omits blank fields and returns undefined without an Account", () => {
    expect(
      buildOnBehalfOf({ accountName: " ", requesterName: "Sofia", segment: "", size: "" }),
    ).toBeUndefined();
    expect(
      buildOnBehalfOf({
        accountName: "Cedar Market",
        requesterName: "",
        segment: "retail",
        size: " 24 stores ",
      }),
    ).toEqual({ account: { name: "Cedar Market", segment: "retail", size: "24 stores" } });
    expect(
      buildOnBehalfOf({ accountName: "Cedar", requesterName: "Sofia", segment: "", size: "" }),
    ).toEqual({ account: { name: "Cedar" }, requester: { name: "Sofia" } });
  });
});

describe("buildCommentBody", () => {
  it("cites the Check when commenting from a Verdict", () => {
    const checkId = "33333333-3333-4333-8333-333333333333";
    expect(buildCommentBody({ body: "Same here", checkId, staffName: " Ana " })).toEqual({
      actor: { name: "Ana", type: "staff" },
      body: "Same here",
      checkId,
      onBehalfOf: undefined,
    });
  });

  it("omits checkId outside a Check", () => {
    expect(buildCommentBody({ body: "Noted", staffName: "Ana" })).not.toHaveProperty("checkId");
  });
});

describe("readApiError", () => {
  it("reads the error, message and resolution fields", () => {
    expect(
      readApiError(
        { code: "skip_reason_required", error: "Need a reason", resolution: "Add one" },
        422,
      ),
    ).toEqual({ code: "skip_reason_required", message: "Need a reason", resolution: "Add one" });
    expect(readApiError({ code: "x", message: "Msg" }, 400).message).toBe("Msg");
  });

  it("falls back for unknown bodies", () => {
    expect(readApiError(null, 500)).toEqual({
      code: "http_500",
      message: "Request failed with status 500.",
      resolution: null,
    });
  });
});
