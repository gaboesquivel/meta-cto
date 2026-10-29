import { seedFeatureRequests } from "@/data/crewday/seed";

import { freezeV2, loadHeldOutV2, readV2Lock, V2_LOCK_FILE, writeV2Lock } from "./held-out-v2";
import { MIN_SAME_NEED_POSITIVES } from "./readings";
import { loadEvalSet } from "./sets";

/** Freezes Held-Out Set v2 once every pair is confirmed: writes the lock file to commit. */
const main = () => {
  const result = freezeV2({
    devTitles: new Set(loadEvalSet("dev").map((p) => p.draft.title.toLowerCase())),
    lock: readV2Lock(),
    now: new Date(),
    pairs: loadHeldOutV2(),
    seedKeys: new Set(seedFeatureRequests.map((fr) => fr.key)),
  });
  if (!result.ok) {
    console.error(result.message);
    process.exit(1);
  }
  writeV2Lock(result.lock);
  console.log(
    `Froze Held-Out Set v2: ${result.lock.pairs} pairs, ${result.lock.sameNeedPositives} same-need positives, ${result.lock.fingerprint}.`,
  );
  if (result.lock.sameNeedPositives < MIN_SAME_NEED_POSITIVES) {
    console.warn(
      `Warning: fewer than ${MIN_SAME_NEED_POSITIVES} same-need positives; every reading will be inconclusive.`,
    );
  }
  console.log(`Commit evals/signal-verdict/${V2_LOCK_FILE} before the first run.`);
};

main();
