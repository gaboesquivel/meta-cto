import type { Origin } from "./contracts";

/**
 * The Pilot Workspace (spec 003, decision 0003): the proof run's Workspace, separate from the
 * Crewday Demo Workspace. Reachable only with the Pilot Key; everything it records is Origin
 * `pilot`. Pilot data loading (task 03) and the Proof Report (task 07) import this identity.
 */
export const PILOT_WORKSPACE = { name: "Signal Pilot", slug: "signal-pilot" } as const;

/** The Origin of every Check and event written through the Pilot Key. */
export const PILOT_ORIGIN: Origin = "pilot";

/** Request header that carries the Pilot Key over REST and the public MCP endpoint. */
export const PILOT_KEY_HEADER = "x-signal-pilot-key";

/** Environment variable holding the Pilot Key; unset or under 16 characters fails closed. */
export const PILOT_KEY_ENV = "SIGNAL_PILOT_KEY";

export const PILOT_KEY_MIN_LENGTH = 16;

/** Pilot rows get a prefixed seed key: seed keys are unique across Workspaces. */
export const PILOT_SEED_PREFIX = "pilot:";
export const pilotSeedKey = (key: string) => `${PILOT_SEED_PREFIX}${key}`;

/** The pilot file key behind a Pilot Workspace seed key, or null for any other row. */
export const pilotKeyOfSeed = (seedKey: string | null): string | null =>
  seedKey?.startsWith(PILOT_SEED_PREFIX) ? seedKey.slice(PILOT_SEED_PREFIX.length) : null;
