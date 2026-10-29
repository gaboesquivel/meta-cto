import { execFileSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

/**
 * The private data folder (spec 004, decision 0004): filled pilot files and Held-Out Set v2 pairs
 * live outside the public repository, in the folder named by `SIGNAL_PRIVATE_DATA_DIR`. CLI
 * commands only (check, freeze, load, eval run); never imported by app code.
 *
 * Layout:
 *   <dir>/pilot/manifest.json, backlog.json, feedback.json, answer-key.json
 *   <dir>/evals/held-out-v2.json
 * Freeze locks stay in the repository (data/pilot, evals/signal-verdict). v2 eval reports are
 * written to <dir>/evals.
 *
 * "Outside the repository" is checked on real paths (`realpathSync.native`) of the folder, of its
 * pilot/ and evals/ subfolders, and of each file right before it is read, so a symlink back into
 * the working tree is refused at any level. On a case-insensitive filesystem (probed on the
 * working tree; darwin and win32 assumed when the probe cannot tell) paths are compared
 * case-folded, so a wrong-case spelling of the repository is still inside it.
 */

export const PRIVATE_DATA_ENV = "SIGNAL_PRIVATE_DATA_DIR";

export const PRIVATE_LAYOUT = { evals: "evals", pilot: "pilot" } as const;

export type PrivateDirRefusal = "inside_repo" | "missing" | "no_repo" | "not_directory" | "unset";

export type PrivateDataDir =
  | {
      evalDir: string;
      ok: true;
      pilotDir: string;
      root: string;
      /** Real path of the git working tree, for re-checking subfolders and files before reads. */
      topLevel: string;
    }
  | { code: PrivateDirRefusal; message: string; ok: false };

export interface ResolveOptions {
  /** Base for a relative value; defaults to `process.cwd()`. */
  cwd?: string;
  /** `git rev-parse --show-toplevel` of the repository; null when it cannot be determined. */
  topLevel: string | null;
}

const refuse = (code: PrivateDirRefusal, message: string): PrivateDataDir => ({
  code,
  message,
  ok: false,
});

const realpath = (p: string): string | null => {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
};

const swapCase = (value: string): string =>
  [...value].map((ch) => (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase())).join("");

/**
 * Whether the filesystem holding `dir` (a real path) ignores case: the case-swapped spelling
 * names the same file. Falls back to the platform default when the path has no letters.
 */
export const isCaseInsensitiveFs = (dir: string): boolean => {
  const swapped = swapCase(dir);
  if (swapped === dir) return process.platform === "darwin" || process.platform === "win32";
  try {
    const a = statSync(dir);
    const b = statSync(swapped);
    return a.ino === b.ino && a.dev === b.dev;
  } catch {
    return false;
  }
};

/**
 * Whether `candidate` is `top` or inside it (both real paths). Inside iff the relative path is
 * empty, or is not absolute and is neither ".." nor starts with ".." + separator, so a child
 * named "..secret" is inside. Case-folded when `caseInsensitive`.
 */
export const isInsideTree = (top: string, candidate: string, caseInsensitive: boolean): boolean => {
  const fold = (p: string) => (caseInsensitive ? p.toLowerCase() : p);
  const relative = path.relative(fold(top), fold(candidate));
  if (relative === "") return true;
  if (path.isAbsolute(relative)) return false;
  return relative !== ".." && !relative.startsWith(`..${path.sep}`);
};

const insideMessage = (what: string, real: string, top: string): string =>
  `${what} (${real}) is inside the git working tree (${top}): anything there can be committed and published. Move it outside the repository.`;

/**
 * The real path of `candidate`, or a refusal when it resolves inside the working tree. A path that
 * does not exist resolves to null with no refusal (callers report missing files).
 */
const checkOutside = (
  candidate: string,
  top: string,
  what: string,
): { real: string | null; refusal: string | null } => {
  const real = realpath(candidate);
  if (!real) return { real: null, refusal: null };
  if (isInsideTree(top, real, isCaseInsensitiveFs(top))) {
    return { real, refusal: insideMessage(what, real, top) };
  }
  return { real, refusal: null };
};

/**
 * Resolves the private folder from the variable's value: it must exist, be a folder, and resolve
 * (after symlinks) outside the git working tree. Refusals say why and what to do.
 */
export const resolvePrivateDataDir = (
  value: string | undefined,
  options: ResolveOptions,
): PrivateDataDir => {
  if (!value?.trim()) {
    return refuse(
      "unset",
      `${PRIVATE_DATA_ENV} is not set. Point it at a private folder outside this repository holding ${PRIVATE_LAYOUT.pilot}/*.json and ${PRIVATE_LAYOUT.evals}/held-out-v2.json (see data/pilot/README.md).`,
    );
  }
  const given = path.resolve(options.cwd ?? process.cwd(), value.trim());
  const root = realpath(given);
  if (!root) {
    return refuse(
      "missing",
      `${PRIVATE_DATA_ENV} folder ${given} does not exist. Create it outside this repository and copy the empty templates into it.`,
    );
  }
  if (!statSync(root).isDirectory()) {
    return refuse("not_directory", `${PRIVATE_DATA_ENV} (${given}) is not a folder.`);
  }
  const top = options.topLevel ? realpath(options.topLevel) : null;
  if (!top) {
    return refuse(
      "no_repo",
      `Cannot determine the git working tree, so ${PRIVATE_DATA_ENV} cannot be checked to be outside it. Run the command from inside the repository.`,
    );
  }
  if (isInsideTree(top, root, isCaseInsensitiveFs(top))) {
    return refuse("inside_repo", insideMessage(PRIVATE_DATA_ENV, root, top));
  }
  const subdirs = { evals: "", pilot: "" };
  for (const key of ["pilot", "evals"] as const) {
    const sub = path.join(root, PRIVATE_LAYOUT[key]);
    const { real, refusal } = checkOutside(sub, top, `${PRIVATE_DATA_ENV}/${PRIVATE_LAYOUT[key]}`);
    if (refusal) return refuse("inside_repo", refusal);
    subdirs[key] = real ?? sub;
  }
  return { evalDir: subdirs.evals, ok: true, pilotDir: subdirs.pilot, root, topLevel: top };
};

/** `git rev-parse --show-toplevel` from `cwd`; null outside a checkout or without git. */
export const gitTopLevel = (cwd: string): string | null => {
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
};

/** The private folder for this process: the variable, checked against this checkout's top level. */
export const privateDataDir = (
  env: Record<string, string | undefined> = process.env,
  cwd = process.cwd(),
): PrivateDataDir =>
  resolvePrivateDataDir(env[PRIVATE_DATA_ENV], { cwd, topLevel: gitTopLevel(cwd) });

/**
 * Re-checks a private subfolder and each named file right before they are read: a refusal when
 * either resolves inside the working tree (a symlink added since resolving), or when files are
 * missing; null when every file is present and outside.
 */
export const checkPrivateFiles = (
  dir: Extract<PrivateDataDir, { ok: true }>,
  sub: keyof typeof PRIVATE_LAYOUT,
  files: readonly string[],
  templateDir: string,
): string | null => {
  // Callers read from `readDir`; it and the layout path are both re-checked in case either changed.
  const readDir = sub === "pilot" ? dir.pilotDir : dir.evalDir;
  const label = `${PRIVATE_DATA_ENV}/${PRIVATE_LAYOUT[sub]}`;
  for (const folder of [path.join(dir.root, PRIVATE_LAYOUT[sub]), readDir]) {
    const { refusal } = checkOutside(folder, dir.topLevel, label);
    if (refusal) return refusal;
  }
  for (const file of files) {
    const { refusal } = checkOutside(path.join(readDir, file), dir.topLevel, file);
    if (refusal) return refusal;
  }
  return missingPrivateFiles(readDir, files, templateDir);
};

/**
 * A refusal naming the files absent from a private subfolder, and the committed template folder
 * to copy them from; null when all are present.
 */
export const missingPrivateFiles = (
  dir: string,
  files: readonly string[],
  templateDir: string,
): string | null => {
  const missing = files.filter((file) => !existsSync(path.join(dir, file)));
  if (missing.length === 0) return null;
  return `Missing in ${dir}: ${missing.join(", ")}. Copy the empty templates from ${templateDir}/ into it and fill them there, never in the repository.`;
};
