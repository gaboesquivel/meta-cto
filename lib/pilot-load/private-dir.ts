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
 * Freeze locks stay in the repository (data/pilot, evals/signal-verdict).
 */

export const PRIVATE_DATA_ENV = "SIGNAL_PRIVATE_DATA_DIR";

export const PRIVATE_LAYOUT = { evals: "evals", pilot: "pilot" } as const;

export type PrivateDirRefusal = "inside_repo" | "missing" | "no_repo" | "not_directory" | "unset";

export type PrivateDataDir =
  | { evalDir: string; ok: true; pilotDir: string; root: string }
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
    return realpathSync(p);
  } catch {
    return null;
  }
};

const isInside = (parent: string, child: string): boolean => {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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
  if (isInside(top, root)) {
    return refuse(
      "inside_repo",
      `${PRIVATE_DATA_ENV} (${root}) is inside the git working tree (${top}): anything there can be committed and published. Move the folder outside the repository.`,
    );
  }
  return {
    evalDir: path.join(root, PRIVATE_LAYOUT.evals),
    ok: true,
    pilotDir: path.join(root, PRIVATE_LAYOUT.pilot),
    root,
  };
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
