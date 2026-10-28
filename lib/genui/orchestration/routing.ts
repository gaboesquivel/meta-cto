import type { CompositionTier } from "../core/tiers";
import { tierFromSignals } from "../core/tiers";
import { acmeEntityIds } from "../fixtures/acme-catalog";

export type ControlledIntent =
  | "compare-plans"
  | "show-metrics"
  | "support-dashboard"
  | "product-timeline"
  | "search-products"
  | "list-products"
  | "onboarding-form"
  | "insufficient-data"
  | "injection-guard";

export interface RoutedIntent {
  intent: ControlledIntent | null;
  injection: boolean;
  normalizedQuery: string;
  tier: CompositionTier;
}

const injectionPattern =
  /ignore (?<scope>all|prior) instructions|system prompt|execute arbitrary|<script|javascript:/iu;

export const routeQuery = (query: string): RoutedIntent => {
  const normalizedQuery = query.trim().toLowerCase();
  const injection = injectionPattern.test(query);

  if (injection) {
    return {
      injection: true,
      intent: "injection-guard",
      normalizedQuery,
      tier: 1,
    };
  }

  if (normalizedQuery.includes(" and ") || normalizedQuery.includes(" plus ")) {
    const decision = tierFromSignals({
      ambiguous: false,
      hasControlledIntent: false,
      needsOpenComposition: false,
      synthesisRequired: true,
    });
    return {
      injection: false,
      intent: null,
      normalizedQuery,
      tier: decision.tier,
    };
  }

  if (/compare|versus|vs\b/u.test(normalizedQuery) && /plan|orbit|nova/u.test(normalizedQuery)) {
    return {
      injection: false,
      intent: "compare-plans",
      normalizedQuery,
      tier: 1,
    };
  }

  if (/support\s+dashboard|help\s*desk|customer\s*service|\bticket\b|csat/u.test(normalizedQuery)) {
    return {
      injection: false,
      intent: "support-dashboard",
      normalizedQuery,
      tier: 1,
    };
  }

  if (/metric|mrr|churn|revenue|dashboard|chart/u.test(normalizedQuery)) {
    return {
      injection: false,
      intent: "show-metrics",
      normalizedQuery,
      tier: 1,
    };
  }

  if (/timeline|release|history|chronolog/u.test(normalizedQuery)) {
    return {
      injection: false,
      intent: "product-timeline",
      normalizedQuery,
      tier: 1,
    };
  }

  if (/search|find\b/u.test(normalizedQuery)) {
    return {
      injection: false,
      intent: "search-products",
      normalizedQuery,
      tier: 1,
    };
  }

  if (/onboarding\s+form|sign[- ]?up\s+form|new\s+user\s+form/u.test(normalizedQuery)) {
    return {
      injection: false,
      intent: "onboarding-form",
      normalizedQuery,
      tier: 1,
    };
  }

  if (/list|show all|catalog/u.test(normalizedQuery)) {
    return {
      injection: false,
      intent: "list-products",
      normalizedQuery,
      tier: 1,
    };
  }

  if (/unsupported|render a 3d|arbitrary code|run shell/u.test(normalizedQuery)) {
    return {
      injection: false,
      intent: "insufficient-data",
      normalizedQuery,
      tier: 1,
    };
  }

  return {
    injection: false,
    intent: null,
    normalizedQuery,
    tier: ambiguousQueryTier(normalizedQuery).tier,
  };
};

export const ambiguousQueryTier = (normalizedQuery: string) =>
  tierFromSignals({
    ambiguous: normalizedQuery.length < 8,
    hasControlledIntent: false,
    needsOpenComposition: /custom layout|surprise me|design a|generate|pricing/u.test(
      normalizedQuery,
    ),
    synthesisRequired: false,
  });

export const defaultEntityIds = () => acmeEntityIds;
