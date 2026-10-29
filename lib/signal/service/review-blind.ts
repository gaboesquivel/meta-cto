import { createHash } from "node:crypto";

/**
 * Blind Review (spec 003, decision 0003): a share of new Feature Requests is reviewed without the
 * AI's suggestion, to measure Product Manager agreement with the Answer Key free of anchoring.
 */

/** Share of new pilot Feature Requests chosen for Blind Review unless configured otherwise. */
export const DEFAULT_PILOT_BLIND_SHARE = 0.3;

const HASH_SPACE = 2 ** 32;

/**
 * Random but reproducible: SHA-256 of `workspaceId:featureRequestId` read as a fraction in [0, 1),
 * chosen when below `share`. The same request in the same Workspace is always chosen the same way.
 */
export const isChosenForBlindReview = (
  workspaceId: string,
  featureRequestId: string,
  share: number,
): boolean => {
  if (!(share > 0)) return false;
  if (share >= 1) return true;
  const digest = createHash("sha256").update(`${workspaceId}:${featureRequestId}`).digest();
  return digest.readUInt32BE(0) / HASH_SPACE < share;
};

/** A share from the environment when it is a number in [0, 1]; otherwise `fallback`. */
export const blindShareFrom = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value.trim() === "") return fallback;
  const share = Number(value);
  return Number.isFinite(share) && share >= 0 && share <= 1 ? share : fallback;
};
