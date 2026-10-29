#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import { repoRoot } from "../lib/repo-paths.mjs";

const staged = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
  cwd: repoRoot,
  encoding: "buffer",
});

const paths = staged.stdout.toString("utf-8").split("\0").filter(Boolean);

const codePattern = /\.(?:[cm]?[jt]sx?)$/u;

const isVendoredAgentSkill = (file) =>
  file.startsWith(".agents/.agents/skills/") || file.startsWith(".agents/skills/");

const code = paths.filter((file) => codePattern.test(file) && !isVendoredAgentSkill(file));
const other = paths.filter(
  (file) => !codePattern.test(file) && /\.(?:css|json|ya?ml)$/u.test(file),
);

if (code.length > 0) {
  const lint = spawnSync("pnpm", ["exec", "oxlint", ...code], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (lint.status !== 0) process.exit(lint.status ?? 1);
}

if (other.length > 0) {
  const fmt = spawnSync(
    "pnpm",
    ["exec", "oxfmt", "--check", "--no-error-on-unmatched-pattern", ...other],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );
  if (fmt.status !== 0) process.exit(fmt.status ?? 1);
}
