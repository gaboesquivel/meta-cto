import type { Actor, Origin, ScanOptions, ScanResult } from "../contracts";
import { SignalError } from "../contracts";
import type { FeatureRequestRow, SignalRepository } from "../repository";
import { isChosenForBlindReview } from "./review-blind";

export interface ReviewServiceDeps {
  /**
   * Share (0 to 1) of new Feature Requests chosen for Blind Review; 0, the default, means none
   * (the Crewday demo). The runtime sets it for the Pilot Workspace.
   */
  blindShare?: number;
  now?: () => Date;
  /** The caller's Origin: recorded on review events and the default Origin for metrics. */
  origin?: Origin;
  repo: SignalRepository;
  /** The backlog scan (spec 002 task 03); without it `scan()` is `service_unavailable`. */
  scan?: (options?: ScanOptions) => Promise<ScanResult>;
  workspaceId: string;
}

export interface ReviewContext {
  blindShare: number;
  now: () => Date;
  origin: Origin;
  repo: SignalRepository;
  workspaceId: string;
}

export const UNDO_FIRST = "Undo the active decision on this pair first, then decide again.";

export const invalidDecision = (message: string, resolution = UNDO_FIRST, details?: unknown) =>
  new SignalError({ code: "invalid_decision", details, message, resolution, status: 422 });

export const decisionNotFound = (id: string) =>
  new SignalError({
    code: "not_found",
    message: `Review Decision ${id} does not exist.`,
    resolution: "Read the Feature Request's reviewHistory to find a valid decision id.",
    status: 404,
  });

export const actorColumns = (actor: Actor) => ({ actorName: actor.name, actorType: actor.type });

/** A new (created through a Check) Feature Request chosen for Blind Review in this Workspace. */
export const isBlind = (
  context: Pick<ReviewContext, "blindShare" | "workspaceId">,
  row: Pick<FeatureRequestRow, "createdViaCheck" | "id">,
) => row.createdViaCheck && isChosenForBlindReview(context.workspaceId, row.id, context.blindShare);
