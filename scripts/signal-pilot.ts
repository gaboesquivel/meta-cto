import { loadRootEnv } from "../lib/env";
import {
  checkPilotReady,
  freezePilot,
  PILOT_FILES,
  readPilotFiles,
  readPilotLock,
  writePilotLock,
} from "../lib/pilot-load/files";
import type { PilotStatus } from "../lib/pilot-load/files";
import { loadPilot } from "../lib/pilot-load/load";
import { createGatewayEmbedder } from "../lib/signal/agent";
import { getDb } from "../lib/signal/db";
import { createRepository } from "../lib/signal/repository";

/**
 * Operator-only pilot data commands (spec 003, task 03); never part of a build.
 *   load    load the Pilot Workspace backlog from data/pilot (idempotent)
 *   check   report frozen / changed / unconfirmed without touching the database
 *   freeze  write data/pilot/pilot.lock.json once every Answer Key entry is confirmed
 */

const report = (status: PilotStatus) => {
  const { counts } = status;
  console.log(
    `Pilot files: ${counts.accounts} accounts, ${counts.featureRequests} backlog requests, ${counts.feedback} feedback items, ${counts.sharesNeed} shared-need / ${counts.noMatch} no-match, ${counts.unconfirmed} unconfirmed; ${status.frozen ? "frozen" : "not frozen"}${status.changed ? ", CHANGED" : ""}.`,
  );
  for (const message of status.messages) console.log(`  ${message}`);
  console.log(status.ready ? "Ready for the pilot run." : "Not ready for the pilot run.");
};

const check = () => {
  const status = checkPilotReady(readPilotFiles(), readPilotLock());
  report(status);
  if (!status.ready) process.exitCode = 1;
};

const freeze = () => {
  const result = freezePilot({ files: readPilotFiles(), lock: readPilotLock(), now: new Date() });
  if (!result.ok) {
    console.error(result.message);
    process.exitCode = 1;
    return;
  }
  writePilotLock(result.lock);
  console.log(`Froze pilot files: ${result.lock.fingerprint} at ${result.lock.frozenAt}.`);
  console.log(`Commit data/pilot/${PILOT_FILES.lock} before the run.`);
};

const load = async () => {
  if (process.env.VERCEL) {
    console.error("signal:pilot:load is Operator-only; refusing to run inside a Vercel build");
    process.exitCode = 1;
    return;
  }
  const db = getDb();
  if (!db) {
    console.error("signal:pilot:load: DATABASE_URL is not set");
    process.exitCode = 1;
    return;
  }
  const embedder = createGatewayEmbedder();
  if (!embedder) console.log("AI_GATEWAY_API_KEY is not set; loading without embeddings");
  const result = await loadPilot({
    embedder,
    files: readPilotFiles(),
    lock: readPilotLock(),
    repo: createRepository(db),
  });
  report(result.status);
  if (!result.ok) {
    console.error(result.message);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Loaded Pilot Workspace: ${result.accounts} accounts, ${result.featureRequests} backlog requests, ${result.embedded} embeddings computed.`,
  );
  if (result.drifted.length > 0) {
    console.warn(
      `Loaded rows differ from the files and were not overwritten: ${result.drifted.join(", ")}.`,
    );
  }
};

loadRootEnv();
const command = process.argv.at(2);
if (command === "load") await load();
else if (command === "check") check();
else if (command === "freeze") freeze();
else {
  console.error("usage: tsx scripts/signal-pilot.ts <load|check|freeze>");
  process.exitCode = 1;
}
