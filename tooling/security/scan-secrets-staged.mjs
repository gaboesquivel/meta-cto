#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { exit } from "node:process";
import { pathToFileURL } from "node:url";

import { repoRoot } from "../lib/repo-paths.mjs";

const configPath = path.join(repoRoot, ".gitleaks.toml");

/** Public Stripe documentation placeholder, split so the suite does not store it contiguously. */
export const syntheticSecret = () => `${"sk_test_"}${"4eC39HqLyjWDarjtT1zdp7dc"}`;

const gitleaks = (args, { cwd, input } = {}) =>
  spawnSync(
    "gitleaks",
    [
      ...args,
      "--no-banner",
      "--redact",
      "--config",
      configPath,
      "--log-level",
      "error",
      "--exit-code",
      "1",
    ],
    {
      cwd,
      encoding: "utf-8",
      input,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );

export const gitleaksAvailable = () =>
  spawnSync("gitleaks", ["version"], { encoding: "utf-8", stdio: "pipe" }).status === 0;

const scanDirectory = (source) => gitleaks(["detect", "--no-git", "--source", source]).status;

export const assertDetectionCanary = () => {
  if (!gitleaksAvailable()) {
    console.error("\ngitleaks is not installed. Run: pnpm setup:gitleaks\n");
    return false;
  }

  const positiveDir = mkdtempSync(path.join(tmpdir(), "flow-secret-positive-"));
  const benignDir = mkdtempSync(path.join(tmpdir(), "flow-secret-benign-"));
  try {
    writeFileSync(path.join(positiveDir, "fixture.txt"), `token = "${syntheticSecret()}"\n`);
    writeFileSync(path.join(benignDir, "fixture.txt"), 'const value = "hello-starter"\n');
    const positive = scanDirectory(positiveDir);
    const benign = scanDirectory(benignDir);
    if (positive !== 1 || benign !== 0) {
      console.error("\ngitleaks failed its detection canary.\n");
      return false;
    }
    return true;
  } finally {
    rmSync(positiveDir, { force: true, recursive: true });
    rmSync(benignDir, { force: true, recursive: true });
  }
};

export const scanStagedDiff = ({ cwd = process.cwd() } = {}) => {
  const diff = spawnSync("git", ["diff", "--cached", "--binary", "--"], {
    cwd,
    encoding: "utf-8",
  });
  if (diff.status !== 0) {
    console.error("\nUnable to read the staged diff.\n");
    return 1;
  }
  if (!diff.stdout.trim()) return 0;

  const result = gitleaks(["stdin"], { cwd, input: diff.stdout });
  if (result.status === 0) return 0;
  if (result.status === 1) {
    console.error("\nSecret scan failed. Remove secrets from staged files before committing.\n");
    return 1;
  }
  console.error("\nSecret scan could not complete.\n");
  return result.status ?? 1;
};

const main = () => {
  if (!assertDetectionCanary()) exit(1);
  exit(scanStagedDiff());
};

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;

if (import.meta.url === entrypoint) main();
