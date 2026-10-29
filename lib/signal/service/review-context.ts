import type { Actor, ScanOptions, ScanResult } from "../contracts";
import { SignalError } from "../contracts";
import type { SignalRepository } from "../repository";

export interface ReviewServiceDeps {
  now?: () => Date;
  repo: SignalRepository;
  /** The backlog scan (spec 002 task 03); without it `scan()` is `service_unavailable`. */
  scan?: (options?: ScanOptions) => Promise<ScanResult>;
  workspaceId: string;
}

export interface ReviewContext {
  now: () => Date;
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
