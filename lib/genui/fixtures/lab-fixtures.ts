import type { CompositionEnvelope } from "../core/envelope";
import { GENUI_LIBRARY_VERSION } from "../core/envelope";
import {
  collectionDocument,
  comparisonDocument,
  dataExplorerDocument,
  onboardingFormDocument,
  sectionStackDocument,
  statusDocument,
  timelineDocument,
} from "../orchestration/builders";
import { acmeCatalogRecords } from "./acme-catalog";

const requestId = "fixture-lab";
const records = acmeCatalogRecords;

export type FlowGenuiFixtureId =
  | "compare-plans"
  | "metrics-dashboard"
  | "product-timeline"
  | "catalog-grid"
  | "compound-stack"
  | "injection-safe"
  | "onboarding-form"
  | "unsupported-status";

export interface FlowGenuiFixtureDefinition {
  envelope: CompositionEnvelope;
  id: FlowGenuiFixtureId;
}

const injectionEnvelope = (): CompositionEnvelope => ({
  fallbackText: "I can only use approved UI components and grounded catalog records.",
  libraryVersion: GENUI_LIBRARY_VERSION,
  openuiText:
    'root = Answer("I can only use approved UI components and grounded catalog records.", [])',
  records,
  requestId,
});

export const flowGenuiFixtures: Record<FlowGenuiFixtureId, FlowGenuiFixtureDefinition> = {
  "catalog-grid": {
    envelope: collectionDocument({
      entityIds: ["entity:orbit-plan", "entity:nova-plan", "entity:relay-connector"],
      records,
      requestId,
    }),
    id: "catalog-grid",
  },
  "compare-plans": {
    envelope: comparisonDocument({
      entityIds: ["entity:orbit-plan", "entity:nova-plan"],
      records,
      requestId,
    }),
    id: "compare-plans",
  },
  "compound-stack": {
    envelope: sectionStackDocument({
      childExpressions: [
        'Answer("Acme Analytics ships ingestion, dashboards, and mobile insights.", ["document:api-overview"])',
        'DataExplorer("metrics-dashboard", ["metric:mrr", "metric:churn"])',
      ],
      records,
      requestId,
    }),
    id: "compound-stack",
  },
  "injection-safe": {
    envelope: injectionEnvelope(),
    id: "injection-safe",
  },
  "metrics-dashboard": {
    envelope: dataExplorerDocument({
      metricIds: ["metric:mrr", "metric:churn", "metric:active-teams"],
      records,
      requestId,
    }),
    id: "metrics-dashboard",
  },
  "onboarding-form": {
    envelope: onboardingFormDocument({ requestId }),
    id: "onboarding-form",
  },
  "product-timeline": {
    envelope: timelineDocument({
      orderedIds: ["document:release-2026-q3", "document:api-overview"],
      records,
      requestId,
    }),
    id: "product-timeline",
  },
  "unsupported-status": {
    envelope: statusDocument({
      message: "That capability is not in the registered component catalog.",
      records,
      requestId,
      variant: "warning",
    }),
    id: "unsupported-status",
  },
};

export const flowGenuiFixtureIds = Object.keys(flowGenuiFixtures) as FlowGenuiFixtureId[];

export const isFlowGenuiFixtureId = (value: string): value is FlowGenuiFixtureId =>
  value in flowGenuiFixtures;

export const fixtureLabEnabled = () => process.env.GENUI_FIXTURE_LAB === "1" && !process.env.VERCEL;
