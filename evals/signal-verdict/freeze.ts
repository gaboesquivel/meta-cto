import { seedFeatureRequests } from "@/data/crewday/seed";
import { loadRootEnv } from "@/lib/env";
import { missingPrivateFiles, privateDataDir } from "@/lib/pilot-load/private-dir";

import {
  freezeV2,
  loadHeldOutV2,
  readV2Lock,
  V2_LOCK_FILE,
  V2_SET_FILE,
  writeV2Lock,
} from "./held-out-v2";
import { MIN_SAME_NEED_POSITIVES } from "./readings";
import { loadEvalSet } from "./sets";

/**
 * Freezes Held-Out Set v2 once every pair is confirmed. Reads the pairs from
 * `$SIGNAL_PRIVATE_DATA_DIR/evals` (outside the repository) and writes the lock file to commit.
 */
const main = () => {
  loadRootEnv();
  const dir = privateDataDir();
  const refusal = dir.ok
    ? missingPrivateFiles(dir.evalDir, [V2_SET_FILE], "evals/signal-verdict")
    : dir.message;
  if (!dir.ok || refusal) {
    console.error(`Refusing: ${refusal}`);
    process.exit(1);
  }
  const result = freezeV2({
    devTitles: new Set(loadEvalSet("dev").map((p) => p.draft.title.toLowerCase())),
    lock: readV2Lock(),
    now: new Date(),
    pairs: loadHeldOutV2(dir.evalDir),
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
  console.log(
    `Commit evals/signal-verdict/${V2_LOCK_FILE} before the first run; the pairs stay in the private folder.`,
  );
};

main();
