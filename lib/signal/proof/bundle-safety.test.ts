import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readProofLocks } from "./locks";

/**
 * The deployment carries no pilot or v2 content (spec 004, decision 0004). App-reachable Proof
 * Report code reads only the database and the two committed locks; the file readers for pilot
 * files, Held-Out Set v2 and the run log stay with the CLI (lib/pilot-load, evals/signal-verdict).
 * Next's server bundle has no `import.meta.dirname`, so nothing reachable uses it.
 */
const ROOT = process.cwd();
const REACHABLE = [
  "lib/signal/proof/bars.ts",
  "lib/signal/proof/locks.ts",
  "lib/signal/proof/report.ts",
  "lib/signal/proof/sources.ts",
  "evals/signal-verdict/prompt-version.ts",
];
const CLI_READERS = [
  "@/lib/pilot-load/files",
  "@/lib/pilot-load/private-dir",
  "@/evals/signal-verdict/held-out-v2",
  "@/evals/signal-verdict/run-log",
  "@/evals/signal-verdict/paths",
  "@/evals/signal-verdict/sets",
];
const LOCKS = ["./data/pilot/pilot.lock.json", "./evals/signal-verdict/held-out-v2.lock.json"];

const codeOf = (file: string) =>
  readFileSync(path.join(ROOT, file), "utf-8")
    .split("\n")
    .filter((line) => !/^\s*(?:\*|\/\/|\/\*)/u.test(line))
    .join("\n");

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Proof Report bundle safety", () => {
  it("reads the locks from process.cwd() when called, not when imported", () => {
    vi.spyOn(process, "cwd").mockReturnValue("/srv/no-such-app");
    expect(readProofLocks()).toEqual({
      pilot: { lock: null, ok: true },
      v2: { lock: null, ok: true },
    });
  });

  it.each(REACHABLE)("%s does not use import.meta.dirname in code", (file) => {
    expect(codeOf(file)).not.toMatch(/import\.meta\.dirname/u);
  });

  it.each(REACHABLE)("%s imports no pilot, v2 or run-log file reader", (file) => {
    const code = codeOf(file);
    for (const reader of CLI_READERS) expect(code).not.toContain(`"${reader}"`);
  });

  it("next.config.ts traces only the committed locks, never pilot or v2 content", () => {
    const config = readFileSync(path.join(ROOT, "next.config.ts"), "utf-8");
    const traced = [...config.matchAll(/"(?<file>\.\/(?:data|evals)\/[^"]+)"/gu)].map(
      (m) => m.groups?.file,
    );
    expect(traced.toSorted()).toEqual(LOCKS.toSorted());
    expect(config).not.toMatch(/runs\.jsonl|held-out-v2\*|data\/pilot\/\*/u);
  });
});
