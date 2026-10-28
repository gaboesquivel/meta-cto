import { validateCompositionEnvelope } from "../contract/compiler";
import { openUiStringList, openUiStringLiteral } from "../contract/openui-text";
import type { CompositionEnvelope } from "../core/envelope";
import { MAX_QUERY_CODE_POINTS } from "../core/limits";
import type { CompositionTier } from "../core/tiers";
import { acmeCatalogRecords } from "../fixtures/acme-catalog";
import {
  answerDocument,
  collectionDocument,
  comparisonDocument,
  dataExplorerDocument,
  onboardingFormDocument,
  sectionStackDocument,
  statusDocument,
  supportDashboardDocument,
  timelineDocument,
} from "./builders";
import type { ComposeClassifier } from "./classify";
import { classifyAmbiguousQuery } from "./classify";
import type { ComposeTurn } from "./generate-openui";
import { refineOpenUiComposition, synthesizeOpenUiComposition } from "./generate-openui";
import { defaultEntityIds, routeQuery } from "./routing";
import type { ComposeStreamEvent } from "./stream";

export type ComposeMode = "create" | "refine";

export type ComposeOutcome = "failed" | "success";

export type ComposeFailureCode =
  | "classification_failed"
  | "generation_invalid"
  | "missing_credentials"
  | "unsupported_request"
  | "validation_failed";

export interface ComposeInput {
  clientRequestId: string;
  mode?: ComposeMode;
  priorEnvelope?: CompositionEnvelope;
  query: string;
  turns?: ComposeTurn[];
  version: number;
}

export interface ComposeResult {
  events: ComposeStreamEvent[];
  metadata: {
    classifier?: ComposeClassifier;
    component?: string;
    composite?: string | null;
    failureCode?: ComposeFailureCode;
    outcome: ComposeOutcome;
    refined?: boolean;
    tier: CompositionTier;
    validationOk: boolean;
  };
  modelCalls: number;
  parseErrors: number;
}

const queryCodePoints = (query: string) => [...query].length;

const metricIds = acmeCatalogRecords
  .filter((record) => record.kind === "metric")
  .map((record) => record.id);

const documentIds = acmeCatalogRecords
  .filter((record) => record.kind === "document")
  .map((record) => record.id);

const controlledDocument = ({
  intent,
  query,
  requestId,
}: {
  intent: NonNullable<ReturnType<typeof routeQuery>["intent"]>;
  query: string;
  requestId: string;
}): CompositionEnvelope => {
  const records = acmeCatalogRecords;
  const entities = defaultEntityIds();

  if (intent === "injection-guard") {
    return answerDocument({
      body: "I can only use approved UI components and grounded catalog records.",
      records,
      requestId,
      sourceIds: [],
    });
  }

  if (intent === "compare-plans") {
    return comparisonDocument({
      entityIds: ["entity:orbit-plan", "entity:nova-plan"],
      records,
      requestId,
    });
  }

  if (intent === "show-metrics") {
    return dataExplorerDocument({
      metricIds,
      records,
      requestId,
    });
  }

  if (intent === "support-dashboard") {
    return supportDashboardDocument({ requestId });
  }

  if (intent === "onboarding-form") {
    return onboardingFormDocument({ requestId });
  }

  if (intent === "product-timeline") {
    return timelineDocument({
      orderedIds: documentIds,
      records,
      requestId,
    });
  }

  if (intent === "search-products") {
    const hits = query.toLowerCase().includes("mobile")
      ? ["entity:pulse-mobile"]
      : entities.slice(0, 2);
    return {
      ...collectionDocument({ entityIds: hits, records, requestId }),
      openuiText: `root = SearchResults("results-with-filters", ${openUiStringList(hits)}, ${openUiStringLiteral(query)})`,
    };
  }

  return collectionDocument({
    entityIds: entities,
    records,
    requestId,
  });
};

export const publishComposition = ({
  emit,
  envelope,
  metadata,
  requestId,
  sequence,
}: {
  emit: (event: ComposeStreamEvent) => void;
  envelope: CompositionEnvelope;
  metadata?: ComposeResult["metadata"];
  requestId: string;
  sequence: number;
}) => {
  const validated = validateCompositionEnvelope({ envelope });
  if (!validated.ok) {
    emit({
      message: "Composition failed validation.",
      requestId,
      sequence,
      type: "error",
    });
    return { ok: false as const, reason: validated.reason };
  }

  emit({ envelope, requestId, sequence, type: "partial" });
  emit({
    envelope,
    metadata,
    requestId,
    sequence: sequence + 1,
    type: "complete",
  });
  return { compiled: validated.compiled, ok: true as const };
};

const tierThreeFailureEnvelope = ({
  failureCode,
  requestId,
}: {
  failureCode: ComposeFailureCode;
  requestId: string;
}) => {
  const message =
    failureCode === "missing_credentials"
      ? "Generation requires AI_GATEWAY_API_KEY for open layouts, or try a supported prompt such as customer support dashboard, metrics, plan comparison, or onboarding form."
      : "The model returned a composition that failed validation. Try a simpler request or a supported starter prompt.";
  return statusDocument({
    message,
    records: acmeCatalogRecords,
    requestId,
    variant: "error",
  });
};

const declarativeCompound = ({
  query,
  requestId,
}: {
  query: string;
  requestId: string;
}): CompositionEnvelope => {
  const records = acmeCatalogRecords;
  const answerChild = `Answer(${openUiStringLiteral(
    "Acme Analytics ships ingestion, dashboards, and mobile insights.",
  )}, ${openUiStringList(["document:api-overview"])})`;
  const wantsMetrics = /metric|revenue|chart/u.test(query.toLowerCase());
  const normalized = query.toLowerCase();
  const wantsCompare =
    /compare|versus|vs\b/u.test(normalized) && /plan|orbit|nova/u.test(normalized);
  const children = [answerChild];
  if (wantsMetrics) {
    children.push(`DataExplorer("metrics-dashboard", ${openUiStringList(metricIds)})`);
  }
  if (wantsCompare) {
    children.push(
      `ComparisonView("side-by-side", "", ${openUiStringList([
        "entity:orbit-plan",
        "entity:nova-plan",
      ])})`,
    );
  }
  if (children.length === 1) {
    return answerDocument({
      body: "Acme Analytics ships ingestion, dashboards, and mobile insights.",
      records,
      requestId,
      sourceIds: ["document:api-overview"],
    });
  }
  return sectionStackDocument({
    childExpressions: children,
    records,
    requestId,
  });
};

const composeCreatePath = async ({
  query,
  requestId,
  signal,
}: {
  query: string;
  requestId: string;
  signal?: AbortSignal;
}) => {
  const routed = routeQuery(query);
  let { intent, tier } = routed;
  let classifier: ComposeClassifier | undefined = intent ? "regex" : undefined;
  let modelCalls = 0;
  let outcome: ComposeOutcome = "success";
  let failureCode: ComposeFailureCode | undefined;
  let envelope: CompositionEnvelope | undefined;

  if (!intent) {
    const classified = await classifyAmbiguousQuery({ query, routed });
    const { classifier: resolvedClassifier } = classified;
    classifier = resolvedClassifier;
    if ("failure" in classified) {
      failureCode = "classification_failed";
      outcome = "failed";
      envelope = statusDocument({
        message: "Could not classify this request against the starter catalog.",
        records: acmeCatalogRecords,
        requestId,
        variant: "error",
      });
      return { classifier, envelope, failureCode, modelCalls, outcome, tier };
    }
    const { intent: classifiedIntent, tier: classifiedTier } = classified;
    tier = classifiedTier;
    if (classifiedIntent) intent = classifiedIntent;
  }

  if (intent === "insufficient-data") {
    tier = 1;
    envelope = statusDocument({
      message: "That capability is not in the registered component catalog.",
      records: acmeCatalogRecords,
      requestId,
      variant: "warning",
    });
    return {
      classifier,
      envelope,
      failureCode: "unsupported_request" as ComposeFailureCode,
      modelCalls,
      outcome: "failed" as ComposeOutcome,
      tier,
    };
  }

  if (intent) {
    tier = 1;
    envelope = controlledDocument({ intent, query, requestId });
    return { classifier, envelope, failureCode, modelCalls, outcome, tier };
  }

  if (tier === 2) {
    envelope = declarativeCompound({ query, requestId });
    return { classifier, envelope, failureCode, modelCalls, outcome, tier };
  }

  tier = 3;
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (apiKey) {
    const generated = await synthesizeOpenUiComposition({
      query,
      requestId,
      signal,
    });
    if (generated) {
      modelCalls = 1;
      envelope = generated;
    } else {
      failureCode = "generation_invalid";
      outcome = "failed";
      envelope = tierThreeFailureEnvelope({ failureCode, requestId });
    }
  } else {
    failureCode = "missing_credentials";
    outcome = "failed";
    envelope = tierThreeFailureEnvelope({ failureCode, requestId });
  }

  return { classifier, envelope, failureCode, modelCalls, outcome, tier };
};

export const composeQuery = async ({
  input,
  onEvent,
  signal,
}: {
  input: ComposeInput;
  onEvent?: (event: ComposeStreamEvent) => void;
  signal?: AbortSignal;
}): Promise<ComposeResult> => {
  const query = input.query.trim();
  if (!query || queryCodePoints(query) > MAX_QUERY_CODE_POINTS) {
    throw new Error("invalid-query");
  }

  const requestId = input.clientRequestId;
  let sequence = 0;
  const events: ComposeStreamEvent[] = [];
  const emit = (event: ComposeStreamEvent) => {
    events.push(event);
    onEvent?.(event);
  };

  emit({ requestId, sequence, type: "start" });
  sequence += 1;

  if (signal?.aborted) {
    return {
      events,
      metadata: { outcome: "failed", tier: 1, validationOk: false },
      modelCalls: 0,
      parseErrors: 0,
    };
  }

  const refining = input.mode === "refine" && input.priorEnvelope !== undefined;

  let envelope: CompositionEnvelope | undefined;
  let tier: CompositionTier = 1;
  let modelCalls = 0;
  let outcome: ComposeOutcome = "success";
  let failureCode: ComposeFailureCode | undefined;
  let classifier: ComposeClassifier | undefined;
  let refined = false;

  if (refining && input.priorEnvelope) {
    tier = 3;
    refined = true;
    const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
    if (apiKey) {
      const generated = await refineOpenUiComposition({
        priorEnvelope: input.priorEnvelope,
        query,
        requestId,
        signal,
        turns: input.turns,
      });
      if (generated) {
        modelCalls = 1;
        envelope = generated;
      } else {
        failureCode = "generation_invalid";
        outcome = "failed";
        envelope = tierThreeFailureEnvelope({ failureCode, requestId });
      }
    } else {
      failureCode = "missing_credentials";
      outcome = "failed";
      envelope = tierThreeFailureEnvelope({ failureCode, requestId });
    }
  } else {
    ({ classifier, envelope, failureCode, modelCalls, outcome, tier } = await composeCreatePath({
      query,
      requestId,
      signal,
    }));
  }

  const resultMetadata: ComposeResult["metadata"] = {
    classifier,
    failureCode,
    outcome,
    refined: refined || undefined,
    tier,
    validationOk: true,
  };

  if (!envelope) throw new Error("compose-internal");

  const published = publishComposition({
    emit,
    envelope,
    metadata: resultMetadata,
    requestId,
    sequence,
  });
  if (!published.ok) {
    return {
      events,
      metadata: {
        failureCode: "validation_failed",
        outcome: "failed",
        tier,
        validationOk: false,
      },
      modelCalls: 0,
      parseErrors: 1,
    };
  }

  return {
    events,
    metadata: {
      classifier,
      component: published.compiled.component,
      composite: published.compiled.composite,
      failureCode,
      outcome,
      refined: refined || undefined,
      tier,
      validationOk: true,
    },
    modelCalls,
    parseErrors: 0,
  };
};
