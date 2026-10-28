import path from "node:path";

/** Repository root (parent of `tooling/`) */
export const repoRoot = path.resolve(import.meta.dirname, "..", "..");

/** `.agents/` when present (optional Factory tree) */
export const agentsRoot = path.join(repoRoot, ".agents");

/** Product-owned `tooling/` */
export const toolingRoot = path.resolve(import.meta.dirname, "..");
