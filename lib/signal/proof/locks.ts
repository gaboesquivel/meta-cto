import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/**
 * The committed freeze locks (spec 004, decision 0004): fingerprint, time and counts only, never
 * content. The Proof Report compares the database's stored fingerprints with these. They are the
 * only files the Proof Report reads at runtime; each path is a literal so file tracing picks up
 * these two files and nothing else (`outputFileTracingIncludes` in next.config.ts lists them).
 */

export const V2_LOCK_SET_NAME = "held-out-v2";

export const pilotLockSchema = z.object({
  accounts: z.number().int().min(0),
  expectedBacklogDuplicateRate: z.number().min(0).max(1),
  featureRequests: z.number().int().min(0),
  feedback: z.number().int().min(1),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  frozenAt: z.iso.datetime({ offset: true }),
  sharesNeed: z.number().int().min(0),
});

export const heldOutV2LockSchema = z.object({
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  frozenAt: z.iso.datetime({ offset: true }),
  pairs: z.number().int().min(1),
  sameNeedPositives: z.number().int().min(0),
  set: z.literal(V2_LOCK_SET_NAME),
});

export type PilotLock = z.infer<typeof pilotLockSchema>;
export type HeldOutV2Lock = z.infer<typeof heldOutV2LockSchema>;

/** A lock as the report reads it: absent (not frozen), parsed, or unreadable (the error). */
export type LockRead<T> = { lock: T | null; ok: true } | { error: unknown; ok: false };

export interface ProofLocks {
  pilot: LockRead<PilotLock>;
  v2: LockRead<HeldOutV2Lock>;
}

const readLock = <T>(file: string, schema: z.ZodType<T>): LockRead<T> => {
  try {
    return { lock: schema.parse(JSON.parse(readFileSync(file, "utf-8"))), ok: true };
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === "ENOENT") return { lock: null, ok: true };
    return { error, ok: false };
  }
};

/** Reads both committed locks from the project root (`process.cwd()`), at call time. */
export const readProofLocks = (root: string = process.cwd()): ProofLocks => ({
  pilot: readLock(path.join(root, "data/pilot/pilot.lock.json"), pilotLockSchema),
  v2: readLock(path.join(root, "evals/signal-verdict/held-out-v2.lock.json"), heldOutV2LockSchema),
});
