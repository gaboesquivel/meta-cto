import type { GroundedRecord } from "../core/envelope";

export const onboardingFormRecords: GroundedRecord[] = [
  {
    id: "entity:field-full-name",
    kind: "entity",
    summary: "Legal or preferred display name",
    tags: ["form-field", "onboarding"],
    title: "Full name",
    url: "/onboarding/fields/full-name",
  },
  {
    id: "entity:field-work-email",
    kind: "entity",
    summary: "Work email for workspace invites",
    tags: ["form-field", "onboarding"],
    title: "Work email",
    url: "/onboarding/fields/work-email",
  },
  {
    id: "entity:field-role",
    kind: "entity",
    summary: "Primary team or function",
    tags: ["form-field", "onboarding"],
    title: "Role",
    url: "/onboarding/fields/role",
  },
];
