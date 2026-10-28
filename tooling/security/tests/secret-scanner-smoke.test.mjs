import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { repoRoot } from "../../lib/repo-paths.mjs";
import {
  assertDetectionCanary,
  gitleaksAvailable,
  scanStagedDiff,
  syntheticSecret,
} from "../scan-secrets-staged.mjs";

const scanner = path.join(repoRoot, "tooling/security/scan-secrets-staged.mjs");

const git = (cwd, args) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  assert.equal(result.status, 0, result.stderr);
};

const initRepo = () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "flow-secret-repo-"));
  git(cwd, ["init", "-b", "main"]);
  git(cwd, ["config", "user.email", "scanner@example.invalid"]);
  git(cwd, ["config", "user.name", "Scanner"]);
  return cwd;
};

test("gitleaks detects a synthetic secret and accepts a benign fixture", () => {
  assert.equal(gitleaksAvailable(), true);
  assert.equal(syntheticSecret().includes("sk_live_"), false);
  assert.equal(assertDetectionCanary(), true);
});

test("the staged scan path detects a staged synthetic secret", () => {
  const cwd = initRepo();
  const before = spawnSync("git", ["diff", "--cached", "--name-only"], {
    cwd: repoRoot,
    encoding: "utf-8",
  }).stdout;
  try {
    writeFileSync(path.join(cwd, "billing.ts"), `token = "${syntheticSecret()}"\n`);
    git(cwd, ["add", "billing.ts"]);
    const result = spawnSync(process.execPath, [scanner], {
      cwd,
      encoding: "utf-8",
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout.includes(syntheticSecret()), false);
    assert.equal(result.stderr.includes(syntheticSecret()), false);
  } finally {
    rmSync(cwd, { force: true, recursive: true });
  }
  const after = spawnSync("git", ["diff", "--cached", "--name-only"], {
    cwd: repoRoot,
    encoding: "utf-8",
  }).stdout;
  assert.equal(after, before);
});

test("staged scan reads the index, not an unstaged working tree", () => {
  const cwd = initRepo();
  try {
    writeFileSync(path.join(cwd, "notes.ts"), 'const value = "hello-starter"\n');
    git(cwd, ["add", "notes.ts"]);
    writeFileSync(path.join(cwd, "notes.ts"), `token = "${syntheticSecret()}"\n`);
    assert.equal(scanStagedDiff({ cwd }), 0);

    writeFileSync(path.join(cwd, "secret.ts"), `token = "${syntheticSecret()}"\n`);
    git(cwd, ["add", "secret.ts"]);
    writeFileSync(path.join(cwd, "secret.ts"), 'const value = "hello-starter"\n');
    assert.equal(scanStagedDiff({ cwd }), 1);
  } finally {
    rmSync(cwd, { force: true, recursive: true });
  }
});
