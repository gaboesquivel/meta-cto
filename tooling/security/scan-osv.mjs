#!/usr/bin/env node

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { exit } from "node:process";

import { repoRoot } from "../lib/repo-paths.mjs";

const mainLockfile = path.join(repoRoot, "pnpm-lock.yaml");
const deepsecLockfile = path.join(repoRoot, ".deepsec", "pnpm-lock.yaml");

function osvScannerInstalled() {
  try {
    execSync("osv-scanner --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const scanLockfile = ({ lockfile }) => {
  if (!existsSync(lockfile)) {
    throw new Error(`lockfile not found: ${lockfile}`);
  }
  console.log(`\nScanning ${lockfile}\n`);
  execSync(`osv-scanner scan --lockfile=${lockfile} --format=markdown`, {
    stdio: "inherit",
  });
};

function main() {
  if (!osvScannerInstalled()) {
    console.error("\nosv-scanner is not installed. Run: pnpm setup:osv\n");
    exit(1);
  }

  if (!existsSync(mainLockfile)) {
    console.error(`\nOSV Scanner could not run: missing main lockfile at ${mainLockfile}\n`);
    exit(1);
  }

  try {
    scanLockfile({ lockfile: mainLockfile });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("lockfile not found")) {
      console.error(`\nOSV Scanner execution failed: ${message}\n`);
      exit(1);
    }
    console.error(
      "\nOSV Scanner could not complete or found vulnerabilities in the main workspace. Update affected dependencies or restore registry access.\n",
    );
    exit(1);
  }

  if (!existsSync(deepsecLockfile)) {
    console.warn(
      `\nAdvisory: optional deepsec lockfile missing at ${deepsecLockfile}; skipping.\n`,
    );
    exit(0);
  }

  try {
    scanLockfile({ lockfile: deepsecLockfile });
  } catch {
    console.warn(
      "\nAdvisory: OSV reported issues in .deepsec/pnpm-lock.yaml (optional deepsec tooling). The main workspace lockfile is clean. Update deepsec when upstream publishes fixes.\n",
    );
  }

  exit(0);
}

main();
