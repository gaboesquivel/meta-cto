#!/usr/bin/env node

import { execSync } from "node:child_process";
import path from "node:path";
import { exit } from "node:process";

import { repoRoot } from "../lib/repo-paths.mjs";

function runStep({ label, command, cwd = repoRoot }) {
  console.log(`${label}...`);
  execSync(command, { cwd, stdio: "inherit" });
}

function main() {
  console.log("\nRunning security checks...\n");

  const smoke = path.join(repoRoot, "tooling/security/tests/secret-scanner-smoke.test.mjs");
  const blockFiles = path.join(repoRoot, "tooling/security/block-secret-files.mjs");

  try {
    runStep({
      command: `node --test ${smoke}`,
      label: "1. Secret scanner self-test",
    });
    runStep({
      command: `node ${blockFiles}`,
      label: "2. Blocked secret file types (staged)",
    });
    runStep({
      command: "pnpm security:secrets:full",
      label: "3. Full repository secret scan",
    });
    runStep({ command: "pnpm security:osv", label: "4. OSV dependency scan" });
    runStep({ command: "pnpm security:audit", label: "5. pnpm audit (high+)" });
  } catch {
    console.error("\nSecurity checks failed.\n");
    exit(1);
  }

  console.log("\nAll security checks passed.\n");
}

main();
