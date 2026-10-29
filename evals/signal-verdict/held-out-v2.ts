import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { evalPairSchema } from "./sets";

/**
 * Held-Out Set v2 (spec 003, decision 0003): pairs written by people without sight of the
 * judge prompt, each confirmed by a person, frozen by fingerprint before the first run.
 */

export const V2_SET_NAME = "held-out-v2";
export const V2_SET_FILE = "held-out-v2.json";
export const V2_LOCK_FILE = "held-out-v2.lock.json";

const confirmedAtSchema = z.union([z.iso.datetime({ offset: true }), z.iso.date()]);

/** A v1 pair plus who confirmed its label and when; missing or null means unconfirmed. */
export const heldOutV2PairSchema = evalPairSchema.extend({
  confirmedAt: confirmedAtSchema.nullable().optional(),
  confirmedBy: z.string().nullable().optional(),
});

export type HeldOutV2Pair = z.infer<typeof heldOutV2PairSchema>;

export const heldOutV2LockSchema = z.object({
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  frozenAt: z.iso.datetime({ offset: true }),
  pairs: z.number().int().min(1),
  sameNeedPositives: z.number().int().min(0),
  set: z.literal(V2_SET_NAME),
});

export type HeldOutV2Lock = z.infer<typeof heldOutV2LockSchema>;

export type V2Refusal =
  | "already_frozen"
  | "changed_after_freeze"
  | "empty"
  | "invalid"
  | "not_frozen"
  | "unconfirmed";

export type V2Result<T> = ({ ok: true } & T) | { code: V2Refusal; message: string; ok: false };

export const parseHeldOutV2 = (json: unknown): HeldOutV2Pair[] =>
  z.array(heldOutV2PairSchema).parse(json);

const compareStrings = (a: string, b: string): number => (a < b ? -1 : Number(a > b));

/** JSON with object keys sorted, so formatting and key order never change a fingerprint. */
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .toSorted(([a], [b]) => compareStrings(a, b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

/** SHA-256 of the pairs (ordered by id, keys sorted): any label, draft or confirmation change moves it. */
export const fingerprintPairs = (pairs: HeldOutV2Pair[]): string => {
  const ordered = pairs.toSorted((a, b) => compareStrings(a.id, b.id));
  return `sha256:${createHash("sha256").update(canonicalJson(ordered)).digest("hex")}`;
};

/** Ids of pairs without a person (`confirmedBy`) and a time (`confirmedAt`). */
export const unconfirmedPairs = (pairs: HeldOutV2Pair[]): string[] =>
  pairs.filter((p) => !(p.confirmedBy?.trim() && p.confirmedAt)).map((p) => p.id);

const changedMessage = (lock: HeldOutV2Lock) =>
  `Held-Out Set v2 changed after freeze: reading reset. It no longer matches the fingerprint frozen at ${lock.frozenAt}; earlier v2 readings do not apply to this set.`;

const unconfirmedMessage = (ids: string[]) =>
  `Held-Out Set v2 has unconfirmed pairs: ${ids.join(", ")}. A person must set confirmedBy and confirmedAt on every pair.`;

/** The runner's gate: refuses an empty, changed, unconfirmed or unfrozen set. */
export const checkV2Ready = (
  pairs: HeldOutV2Pair[],
  lock: HeldOutV2Lock | null,
): V2Result<{ fingerprint: string }> => {
  if (pairs.length === 0) {
    return { code: "empty", message: "Held-Out Set v2 has no pairs yet.", ok: false };
  }
  const fingerprint = fingerprintPairs(pairs);
  if (lock && lock.fingerprint !== fingerprint) {
    return { code: "changed_after_freeze", message: changedMessage(lock), ok: false };
  }
  const unconfirmed = unconfirmedPairs(pairs);
  if (unconfirmed.length > 0) {
    return { code: "unconfirmed", message: unconfirmedMessage(unconfirmed), ok: false };
  }
  if (!lock) {
    return {
      code: "not_frozen",
      message:
        "Held-Out Set v2 is not frozen. Run the freeze command and commit the lock file first.",
      ok: false,
    };
  }
  return { fingerprint, ok: true };
};

const invalidReason = (
  pairs: HeldOutV2Pair[],
  seedKeys: ReadonlySet<string>,
  devTitles: ReadonlySet<string>,
): string | null => {
  const ids = pairs.map((p) => p.id);
  const duplicate = ids.find((id, i) => ids.indexOf(id) !== i);
  if (duplicate) return `duplicate id "${duplicate}"`;
  const unknown = pairs.find((p) => !seedKeys.has(p.target));
  if (unknown)
    return `pair ${unknown.id} targets "${unknown.target}", not a seeded Feature Request`;
  const leaked = pairs.find((p) => devTitles.has(p.draft.title.toLowerCase()));
  if (leaked) return `pair ${leaked.id} reuses a Dev Set draft`;
  return null;
};

/** Validates the set and returns the lock to commit; a set freezes once. */
export const freezeV2 = (input: {
  /** Lowercased Dev Set draft titles; v2 drafts never come from tuning data. */
  devTitles: ReadonlySet<string>;
  lock: HeldOutV2Lock | null;
  now: Date;
  pairs: HeldOutV2Pair[];
  seedKeys: ReadonlySet<string>;
}): V2Result<{ lock: HeldOutV2Lock }> => {
  const { lock, pairs } = input;
  if (pairs.length === 0) {
    return { code: "empty", message: "Held-Out Set v2 has no pairs to freeze.", ok: false };
  }
  const fingerprint = fingerprintPairs(pairs);
  if (lock) {
    return lock.fingerprint === fingerprint
      ? {
          code: "already_frozen",
          message: `Held-Out Set v2 is already frozen (${lock.frozenAt}).`,
          ok: false,
        }
      : {
          code: "changed_after_freeze",
          message: `${changedMessage(lock)} To freeze a new set, delete ${V2_LOCK_FILE} deliberately.`,
          ok: false,
        };
  }
  const invalid = invalidReason(pairs, input.seedKeys, input.devTitles);
  if (invalid)
    return { code: "invalid", message: `Held-Out Set v2 is invalid: ${invalid}.`, ok: false };
  const unconfirmed = unconfirmedPairs(pairs);
  if (unconfirmed.length > 0) {
    return { code: "unconfirmed", message: unconfirmedMessage(unconfirmed), ok: false };
  }
  return {
    lock: {
      fingerprint,
      frozenAt: input.now.toISOString(),
      pairs: pairs.length,
      sameNeedPositives: pairs.filter((p) => p.expected === "same_need").length,
      set: V2_SET_NAME,
    },
    ok: true,
  };
};

export const loadHeldOutV2 = (dir = import.meta.dirname): HeldOutV2Pair[] =>
  parseHeldOutV2(JSON.parse(readFileSync(path.join(dir, V2_SET_FILE), "utf-8")));

export const readV2Lock = (dir = import.meta.dirname): HeldOutV2Lock | null => {
  const file = path.join(dir, V2_LOCK_FILE);
  if (!existsSync(file)) return null;
  return heldOutV2LockSchema.parse(JSON.parse(readFileSync(file, "utf-8")));
};

export const writeV2Lock = (lock: HeldOutV2Lock, dir = import.meta.dirname): void => {
  writeFileSync(path.join(dir, V2_LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`, "utf-8");
};
