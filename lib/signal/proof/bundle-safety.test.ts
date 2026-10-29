import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { evalDir } from "@/evals/signal-verdict/paths";
import { pilotDir } from "@/lib/pilot-load/files";

/**
 * Next's server bundle has no `import.meta.dirname`, and the Proof Report is reachable from the
 * MCP routes, so its data dirs resolve from `process.cwd()` at call time (`pnpm build` failed on
 * a module-level `import.meta.dirname`).
 */
const ROOT = process.cwd();
const REACHABLE = [
  "lib/pilot-load/files.ts",
  "lib/signal/proof/bars.ts",
  "lib/signal/proof/report.ts",
  "lib/signal/proof/sources.ts",
  "evals/signal-verdict/held-out-v2.ts",
  "evals/signal-verdict/metrics.ts",
  "evals/signal-verdict/readings.ts",
  "evals/signal-verdict/run-log.ts",
  "evals/signal-verdict/sets.ts",
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Proof Report data dirs", () => {
  it("resolve from process.cwd() when called, not when imported", () => {
    vi.spyOn(process, "cwd").mockReturnValue("/srv/app");
    expect(pilotDir()).toBe(path.join("/srv/app", "data", "pilot"));
    expect(evalDir()).toBe(path.join("/srv/app", "evals", "signal-verdict"));
  });

  it.each(REACHABLE)("%s does not use import.meta.dirname in code", (file) => {
    const code = readFileSync(path.join(ROOT, file), "utf-8")
      .split("\n")
      .filter((line) => !/^\s*(?:\*|\/\/|\/\*)/u.test(line));
    expect(code.join("\n")).not.toMatch(/import\.meta\.dirname/u);
  });
});
