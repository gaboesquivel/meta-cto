import { loadRootEnv } from "@/lib/env";
import { getSignalService } from "@/lib/signal/runtime";

import { V2_SET_NAME } from "./held-out-v2";
import { createLocalEvalService } from "./local-service";
import { runEval } from "./runner";
import type { RunSetName } from "./runner";

const SETS: RunSetName[] = ["held-out", "dev", V2_SET_NAME];

const parseSet = (argv: string[]): RunSetName => {
  const index = argv.indexOf("--set");
  const value = index === -1 ? "held-out" : argv[index + 1];
  const set = SETS.find((name) => name === value);
  if (set) return set;
  throw new Error(`Unknown --set "${value}". Use --set ${SETS.join(", --set ")}.`);
};

const main = async () => {
  loadRootEnv();
  const set = parseSet(process.argv.slice(2));
  const outcome = await runEval({
    // Eval Checks record Origin `eval`, so they never count in demo or pilot metrics.
    getService: () =>
      process.argv.includes("--local")
        ? createLocalEvalService()
        : Promise.resolve(getSignalService("eval")),
    set,
  });
  if (outcome.report) console.log(outcome.report);
  if (outcome.reportFile) console.log(`Wrote evals/signal-verdict/${outcome.reportFile}`);
  console.log(`${outcome.message} Logged to evals/signal-verdict/runs.jsonl.`);
  if (outcome.status === "refused" || (outcome.status === "failed" && !outcome.report)) {
    console.error(outcome.message);
    process.exit(1);
  }
};

await main();
