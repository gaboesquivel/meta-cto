/** Level 1: controlled deterministic selection. Level 2: declarative multi-section compose. Level 3: open-ended primitive assembly (model). */
export type CompositionTier = 1 | 2 | 3;

export const JEV_CONFIDENCE_THRESHOLD = 0.7;

export interface RoutingDecision {
  confidence: number;
  reason: string;
  tier: CompositionTier;
}

export const tierFromSignals = ({
  ambiguous,
  hasControlledIntent,
  needsOpenComposition,
  synthesisRequired,
}: {
  ambiguous: boolean;
  hasControlledIntent: boolean;
  needsOpenComposition: boolean;
  synthesisRequired: boolean;
}): RoutingDecision => {
  if (ambiguous) {
    return {
      confidence: 0.4,
      reason: "ambiguous-intent",
      tier: 2,
    };
  }
  if (hasControlledIntent && !synthesisRequired) {
    return {
      confidence: 0.92,
      reason: "controlled-intent",
      tier: 1,
    };
  }
  if (needsOpenComposition) {
    return {
      confidence: 0.55,
      reason: "open-composition",
      tier: 3,
    };
  }
  return {
    confidence: 0.75,
    reason: "declarative-compose",
    tier: 2,
  };
};
