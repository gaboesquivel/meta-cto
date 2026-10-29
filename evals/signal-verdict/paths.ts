import path from "node:path";

/**
 * Where the eval sets, lock and run log live. Resolved from the project root (`process.cwd()`) at
 * call time, never at import: Next's server bundle has no `import.meta.dirname`, and the Proof
 * Report reads these files from app code. CLI scripts and tests run from the repo root.
 */
export const evalDir = (): string => path.join(process.cwd(), "evals", "signal-verdict");
