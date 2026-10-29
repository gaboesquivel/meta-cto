import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { AnswerKeyLabels } from "@/lib/signal/service/answer-key";

/**
 * Pilot files (spec 003, task 03): the pre-pilot backlog, the feedback agents will file, the
 * Answer Key and the manifest that states the expected backlog duplicate rate. All four are
 * fixed by a fingerprint lock before the run; any later change resets the reading.
 */

export const PILOT_DIR = path.resolve(import.meta.dirname, "../../data/pilot");

export const PILOT_FILES = {
  answerKey: "answer-key.json",
  backlog: "backlog.json",
  feedback: "feedback.json",
  lock: "pilot.lock.json",
  manifest: "manifest.json",
} as const;

const dateSchema = z.union([z.iso.datetime({ offset: true }), z.iso.date()]);
const keySchema = z.string().trim().min(1);
const nullableText = z.string().nullable();

export const pilotManifestSchema = z.object({
  /** Who wrote the backlog and feedback; never the person who confirms Answer Key labels. */
  backlogAuthor: nullableText,
  /** Share of the pre-pilot backlog expected to be duplicates, stated before the run (0–1). */
  expectedBacklogDuplicateRate: z.number().min(0).max(1).nullable(),
  /** The model that generated the feedback; its family must differ from the judge's. */
  feedbackGenerator: z.object({ family: nullableText, model: nullableText }),
  judgeFamily: nullableText,
  statedAt: dateSchema.nullable(),
});

export const pilotAccountSchema = z.object({
  key: keySchema,
  name: z.string().min(1),
  plan: nullableText.optional(),
  segment: nullableText.optional(),
  size: nullableText.optional(),
});

export const pilotFeatureRequestSchema = z.object({
  account: keySchema,
  actor: z.object({ name: z.string().min(1), type: z.enum(["agent", "staff"]) }),
  description: z.string().min(1),
  key: keySchema,
  requester: z.object({ name: z.string().min(1), role: z.string().min(1) }),
  title: z.string().min(1),
  underlyingNeed: nullableText.optional(),
});

export const pilotBacklogSchema = z.object({
  accounts: z.array(pilotAccountSchema),
  featureRequests: z.array(pilotFeatureRequestSchema),
});

/** One customer message an agent files through a Check; never loaded as a Feature Request. */
export const pilotFeedbackSchema = z.object({
  account: keySchema,
  customer: z.object({ name: z.string().min(1), role: z.string().min(1) }),
  description: z.string().min(1),
  key: keySchema,
  title: z.string().min(1),
});

const confirmation = {
  confirmedAt: dateSchema.nullable().optional(),
  confirmedBy: nullableText.optional(),
};

/**
 * A need cluster label confirmed by a person: two items share a need iff their `needId`s are
 * equal. Every backlog Feature Request and every feedback item carries exactly one.
 */
export const backlogNeedSchema = z.object({
  ...confirmation,
  featureRequest: keySchema,
  needId: keySchema,
});
export const feedbackNeedSchema = z.object({
  ...confirmation,
  feedback: keySchema,
  needId: keySchema,
});

export const answerKeySchema = z.object({
  featureRequests: z.array(backlogNeedSchema),
  feedback: z.array(feedbackNeedSchema),
});

export const pilotLockSchema = z.object({
  accounts: z.number().int().min(0),
  expectedBacklogDuplicateRate: z.number().min(0).max(1),
  featureRequests: z.number().int().min(0),
  feedback: z.number().int().min(1),
  fingerprint: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  frozenAt: z.iso.datetime({ offset: true }),
  sharesNeed: z.number().int().min(0),
});

export type PilotManifest = z.infer<typeof pilotManifestSchema>;
export type PilotAccount = z.infer<typeof pilotAccountSchema>;
export type PilotFeatureRequest = z.infer<typeof pilotFeatureRequestSchema>;
export type PilotBacklog = z.infer<typeof pilotBacklogSchema>;
export type PilotFeedback = z.infer<typeof pilotFeedbackSchema>;
export type BacklogNeed = z.infer<typeof backlogNeedSchema>;
export type FeedbackNeed = z.infer<typeof feedbackNeedSchema>;
export type AnswerKey = z.infer<typeof answerKeySchema>;
type AnswerKeyEntry = BacklogNeed | FeedbackNeed;
export type PilotLock = z.infer<typeof pilotLockSchema>;

export interface PilotFiles {
  answerKey: AnswerKey;
  backlog: PilotBacklog;
  feedback: PilotFeedback[];
  manifest: PilotManifest;
}

const readJson = (dir: string, file: string): unknown =>
  JSON.parse(readFileSync(path.join(dir, file), "utf-8"));

export const readPilotFiles = (dir = PILOT_DIR): PilotFiles => ({
  answerKey: answerKeySchema.parse(readJson(dir, PILOT_FILES.answerKey)),
  backlog: pilotBacklogSchema.parse(readJson(dir, PILOT_FILES.backlog)),
  feedback: z.array(pilotFeedbackSchema).parse(readJson(dir, PILOT_FILES.feedback)),
  manifest: pilotManifestSchema.parse(readJson(dir, PILOT_FILES.manifest)),
});

export const readPilotLock = (dir = PILOT_DIR): PilotLock | null => {
  const file = path.join(dir, PILOT_FILES.lock);
  if (!existsSync(file)) return null;
  return pilotLockSchema.parse(readJson(dir, PILOT_FILES.lock));
};

export const writePilotLock = (lock: PilotLock, dir = PILOT_DIR): void => {
  writeFileSync(path.join(dir, PILOT_FILES.lock), `${JSON.stringify(lock, null, 2)}\n`, "utf-8");
};

const compareStrings = (a: string, b: string): number => (a < b ? -1 : Number(a > b));
const byKey = <T>(items: T[], key: (item: T) => string): T[] =>
  items.toSorted((a, b) => compareStrings(key(a), key(b)));

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

/** SHA-256 over all four files (entries ordered by key): any content change moves it. */
export const fingerprint = (files: PilotFiles): string => {
  const ordered = {
    answerKey: {
      featureRequests: byKey(files.answerKey.featureRequests, (e) => e.featureRequest),
      feedback: byKey(files.answerKey.feedback, (e) => e.feedback),
    },
    backlog: {
      accounts: byKey(files.backlog.accounts, (a) => a.key),
      featureRequests: byKey(files.backlog.featureRequests, (r) => r.key),
    },
    feedback: byKey(files.feedback, (f) => f.key),
    manifest: files.manifest,
  };
  return `sha256:${createHash("sha256").update(canonicalJson(ordered)).digest("hex")}`;
};

const isConfirmed = (entry: AnswerKeyEntry) =>
  Boolean(entry.confirmedBy?.trim() && entry.confirmedAt);

/** Keys (backlog request or feedback) whose Answer Key entry lacks `confirmedBy` and `confirmedAt`. */
export const unconfirmedEntries = (files: PilotFiles): string[] => [
  ...files.answerKey.featureRequests.filter((e) => !isConfirmed(e)).map((e) => e.featureRequest),
  ...files.answerKey.feedback.filter((e) => !isConfirmed(e)).map((e) => e.feedback),
];

/**
 * Answer Key lookup for one feedback item: its need cluster (`needId`), whether a person confirmed
 * it, and the backlog requests in the same cluster; undefined when the item has no entry.
 */
export const answerKeyFor = (
  files: Pick<PilotFiles, "answerKey">,
  feedbackKey: string,
): { confirmed: boolean; needId: string; sharesNeedWith: string[] } | undefined => {
  const entry = files.answerKey.feedback.find((e) => e.feedback === feedbackKey);
  if (!entry) return undefined;
  return {
    confirmed: isConfirmed(entry),
    needId: entry.needId,
    sharesNeedWith: files.answerKey.featureRequests
      .filter((e) => e.needId === entry.needId)
      .map((e) => e.featureRequest)
      .toSorted(),
  };
};

/** Every Answer Key label as Answer Key scoring reads it; unconfirmed ones are excluded there. */
export const answerKeyLabels = (files: Pick<PilotFiles, "answerKey">): AnswerKeyLabels => ({
  featureRequests: files.answerKey.featureRequests.map((e) => ({
    confirmed: isConfirmed(e),
    key: e.featureRequest,
    needId: e.needId,
  })),
  feedback: files.answerKey.feedback.map((e) => ({
    confirmed: isConfirmed(e),
    key: e.feedback,
    needId: e.needId,
  })),
});

/** Feedback items whose need cluster includes a backlog request (expected intake duplicates). */
const sharesBacklogNeed = (files: PilotFiles): number => {
  const backlogNeeds = new Set(files.answerKey.featureRequests.map((e) => e.needId));
  return files.answerKey.feedback.filter((e) => backlogNeeds.has(e.needId)).length;
};

const duplicates = (keys: string[]) => [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))];
const sameName = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a?.trim() && b?.trim() && a.trim().toLowerCase() === b.trim().toLowerCase());

/** Structural problems: duplicate keys, broken references, feedback without exactly one entry. */
export const pilotProblems = (files: PilotFiles): string[] => {
  const problems: string[] = [];
  const { accounts, featureRequests } = files.backlog;
  const accountKeys = new Set(accounts.map((a) => a.key));
  const requestKeys = new Set(featureRequests.map((r) => r.key));
  const feedbackKeys = new Set(files.feedback.map((f) => f.key));
  for (const [kind, keys] of [
    ["account", accounts.map((a) => a.key)],
    ["account name", accounts.map((a) => a.name)],
    ["feature request", featureRequests.map((r) => r.key)],
    ["feedback", files.feedback.map((f) => f.key)],
    ["Answer Key entry for feedback", files.answerKey.feedback.map((e) => e.feedback)],
    [
      "Answer Key entry for feature request",
      files.answerKey.featureRequests.map((e) => e.featureRequest),
    ],
  ] as const) {
    for (const key of duplicates([...keys])) problems.push(`duplicate ${kind} "${key}"`);
  }
  for (const request of featureRequests.filter((r) => !accountKeys.has(r.account))) {
    problems.push(`feature request "${request.key}" names unknown account "${request.account}"`);
  }
  for (const item of files.feedback.filter((f) => !accountKeys.has(f.account))) {
    problems.push(`feedback "${item.key}" names unknown account "${item.account}"`);
  }
  const answered = new Set(files.answerKey.feedback.map((e) => e.feedback));
  for (const item of files.feedback.filter((f) => !answered.has(f.key))) {
    problems.push(`feedback "${item.key}" has no Answer Key entry`);
  }
  const labeled = new Set(files.answerKey.featureRequests.map((e) => e.featureRequest));
  for (const request of featureRequests.filter((r) => !labeled.has(r.key))) {
    problems.push(`feature request "${request.key}" has no Answer Key entry`);
  }
  for (const e of files.answerKey.feedback) {
    if (!feedbackKeys.has(e.feedback)) {
      problems.push(`Answer Key entry names unknown feedback "${e.feedback}"`);
    }
  }
  for (const e of files.answerKey.featureRequests) {
    if (!requestKeys.has(e.featureRequest)) {
      problems.push(`Answer Key entry names unknown feature request "${e.featureRequest}"`);
    }
  }
  for (const e of [...files.answerKey.featureRequests, ...files.answerKey.feedback]) {
    if (sameName(e.confirmedBy, files.manifest.backlogAuthor)) {
      const key = "feedback" in e ? e.feedback : e.featureRequest;
      problems.push(`Answer Key entry "${key}" is confirmed by the backlog author`);
    }
  }
  const { feedbackGenerator, judgeFamily } = files.manifest;
  if (sameName(feedbackGenerator.family, judgeFamily)) {
    problems.push("feedback was generated by the judge's model family");
  }
  return problems;
};

/** What the manifest must state before freezing (null in the empty templates). */
const missingStatements = (manifest: PilotManifest): string[] =>
  [
    manifest.expectedBacklogDuplicateRate === null && "expectedBacklogDuplicateRate",
    manifest.statedAt === null && "statedAt",
    !manifest.backlogAuthor?.trim() && "backlogAuthor",
    !manifest.feedbackGenerator.family?.trim() && "feedbackGenerator.family",
    !manifest.feedbackGenerator.model?.trim() && "feedbackGenerator.model",
    !manifest.judgeFamily?.trim() && "judgeFamily",
  ].filter((field): field is string => typeof field === "string");

const CHANGED = "changed after freeze: reading reset";

const changedMessage = (lock: PilotLock) =>
  `Pilot files ${CHANGED}. They no longer match the fingerprint frozen at ${lock.frozenAt}; earlier pilot readings do not apply.`;

export interface PilotStatus {
  changed: boolean;
  counts: {
    accounts: number;
    answerKey: number;
    featureRequests: number;
    feedback: number;
    noMatch: number;
    sharesNeed: number;
    unconfirmed: number;
  };
  fingerprint: string;
  frozen: boolean;
  /** Human-readable status lines for the Operator. */
  messages: string[];
  problems: string[];
  /** True only when frozen, unchanged, valid and fully confirmed. */
  ready: boolean;
  unconfirmed: string[];
}

/** The gate tasks 05 and 07 read: is the pilot set frozen, unchanged and fully confirmed? */
export const checkPilotReady = (files: PilotFiles, lock: PilotLock | null): PilotStatus => {
  const print = fingerprint(files);
  const frozen = lock !== null;
  const changed = frozen && lock.fingerprint !== print;
  const problems = pilotProblems(files);
  const unconfirmed = unconfirmedEntries(files);
  const sharesNeed = sharesBacklogNeed(files);
  const messages: string[] = [];
  if (changed) messages.push(changedMessage(lock));
  if (files.feedback.length === 0) messages.push("Pilot files have no feedback items yet.");
  for (const problem of problems) messages.push(`Problem: ${problem}.`);
  if (unconfirmed.length > 0) {
    messages.push(
      `Answer Key has ${unconfirmed.length} unconfirmed entries: ${unconfirmed.join(", ")}.`,
    );
  }
  if (!frozen) {
    const missing = missingStatements(files.manifest);
    if (missing.length > 0)
      messages.push(`Manifest must state before freeze: ${missing.join(", ")}.`);
    messages.push("Pilot files are not frozen. Run the freeze command and commit the lock file.");
  }
  return {
    changed,
    counts: {
      accounts: files.backlog.accounts.length,
      answerKey: files.answerKey.featureRequests.length + files.answerKey.feedback.length,
      featureRequests: files.backlog.featureRequests.length,
      feedback: files.feedback.length,
      noMatch: files.answerKey.feedback.length - sharesNeed,
      sharesNeed,
      unconfirmed: unconfirmed.length,
    },
    fingerprint: print,
    frozen,
    messages,
    problems,
    ready: frozen && !changed && problems.length === 0 && unconfirmed.length === 0,
    unconfirmed,
  };
};

export type FreezeRefusal =
  | "already_frozen"
  | "changed_after_freeze"
  | "empty"
  | "invalid"
  | "unconfirmed";

export type FreezeResult =
  | { lock: PilotLock; ok: true }
  | { code: FreezeRefusal; message: string; ok: false };

/** Validates the pilot set and returns the lock to commit; a set freezes once. */
export const freezePilot = (input: {
  files: PilotFiles;
  lock: PilotLock | null;
  now: Date;
}): FreezeResult => {
  const { files, lock } = input;
  const print = fingerprint(files);
  if (lock) {
    return lock.fingerprint === print
      ? {
          code: "already_frozen",
          message: `Pilot files already frozen (${lock.frozenAt}).`,
          ok: false,
        }
      : {
          code: "changed_after_freeze",
          message: `${changedMessage(lock)} To freeze a new set, delete ${PILOT_FILES.lock} deliberately.`,
          ok: false,
        };
  }
  if (files.feedback.length === 0) {
    return { code: "empty", message: "Pilot files have no feedback items to freeze.", ok: false };
  }
  const missing = missingStatements(files.manifest).map((field) => `manifest ${field} is not set`);
  const invalid = [...pilotProblems(files), ...missing];
  if (invalid.length > 0) {
    return {
      code: "invalid",
      message: `Pilot files are invalid: ${invalid.join("; ")}.`,
      ok: false,
    };
  }
  const unconfirmed = unconfirmedEntries(files);
  if (unconfirmed.length > 0) {
    return {
      code: "unconfirmed",
      message: `Answer Key has unconfirmed entries: ${unconfirmed.join(", ")}. A person must set confirmedBy and confirmedAt on every entry.`,
      ok: false,
    };
  }
  return {
    lock: {
      accounts: files.backlog.accounts.length,
      expectedBacklogDuplicateRate: files.manifest.expectedBacklogDuplicateRate ?? 0,
      featureRequests: files.backlog.featureRequests.length,
      feedback: files.feedback.length,
      fingerprint: print,
      frozenAt: input.now.toISOString(),
      sharesNeed: sharesBacklogNeed(files),
    },
    ok: true,
  };
};
