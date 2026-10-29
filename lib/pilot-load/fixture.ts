import type { PilotFiles } from "./files";

/** Element `index` of `items`, failing the test when it is missing. */
export const at = <T>(items: T[], index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`no item at ${index}`);
  return item;
};

/** A small, valid, confirmed pilot set for tests. */
export const pilotFixture = (): PilotFiles => ({
  answerKey: [
    {
      confirmedAt: "2026-10-27",
      confirmedBy: "Rosa (labeler)",
      feedback: "fb-1",
      sharesNeedWith: "fr-swap",
    },
    {
      confirmedAt: "2026-10-27T10:00:00Z",
      confirmedBy: "Rosa (labeler)",
      feedback: "fb-2",
      sharesNeedWith: null,
    },
  ],
  backlog: {
    accounts: [
      { key: "acme", name: "Acme Diner", plan: "Pro", segment: "restaurant", size: "3 locations" },
    ],
    featureRequests: [
      {
        account: "acme",
        actor: { name: "Sam (CSM)", type: "staff" },
        description: "Staff want to swap shifts without calling the manager.",
        key: "fr-swap",
        requester: { name: "Lee", role: "GM" },
        title: "Shift swaps in the app",
        underlyingNeed: "Staff cover their own shifts",
      },
    ],
  },
  feedback: [
    {
      account: "acme",
      customer: { name: "Ana", role: "Shift lead" },
      description: "Let my team trade shifts themselves.",
      key: "fb-1",
      title: "Trade shifts",
    },
    {
      account: "acme",
      customer: { name: "Bo", role: "Owner" },
      description: "Export payroll hours to our accountant.",
      key: "fb-2",
      title: "Payroll export",
    },
  ],
  manifest: {
    backlogAuthor: "Gabo (author)",
    expectedBacklogDuplicateRate: 0.15,
    feedbackGenerator: { family: "gemini", model: "gemini-2.5-pro" },
    judgeFamily: "claude",
    statedAt: "2026-10-26",
  },
});
