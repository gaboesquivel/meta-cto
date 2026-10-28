import type { GroundedRecord } from "../core/envelope";

export const supportDashboardRecords: GroundedRecord[] = [
  {
    id: "metric:open-tickets",
    kind: "metric",
    label: "Open tickets",
    trend: "down",
    unit: "",
    value: "142",
  },
  {
    id: "metric:first-response",
    kind: "metric",
    label: "Median first response",
    trend: "flat",
    unit: "min",
    value: "18",
  },
  {
    id: "metric:csat",
    kind: "metric",
    label: "CSAT (7d)",
    trend: "up",
    unit: "%",
    value: "91",
  },
  {
    id: "entity:ticket-1042",
    kind: "entity",
    summary: "Billing mismatch after plan upgrade",
    tags: ["billing", "urgent"],
    title: "Ticket #1042",
    url: "#",
  },
  {
    id: "entity:ticket-1038",
    kind: "entity",
    summary: "Cannot reset MFA device",
    tags: ["auth"],
    title: "Ticket #1038",
    url: "#",
  },
  {
    id: "entity:ticket-1021",
    kind: "entity",
    summary: "Export CSV times out for large accounts",
    tags: ["performance"],
    title: "Ticket #1021",
    url: "#",
  },
  {
    excerpt: "Escalate to Tier 2 when SLA breach is within 30 minutes.",
    id: "document:playbook-escalation",
    kind: "document",
    revisedAt: "2026-10-01",
    title: "Escalation playbook",
    url: "#",
  },
];

export const supportMetricIds = () =>
  supportDashboardRecords.filter((r) => r.kind === "metric").map((r) => r.id);

export const supportTicketIds = () =>
  supportDashboardRecords.filter((r) => r.kind === "entity").map((r) => r.id);
