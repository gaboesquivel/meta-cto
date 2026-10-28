#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { exit } from "node:process";

import { repoRoot } from "../lib/repo-paths.mjs";
import { isBlocked } from "./block-secret-files.mjs";

const trackedFiles = () =>
  execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf-8" })
    .split("\n")
    .filter((line) => line.length > 0);

const blocked = trackedFiles().filter(isBlocked);

if (blocked.length === 0) exit(0);

console.error("\nSecurity check failed: tracked sensitive paths must not be committed\n");
for (const file of blocked) console.error(`  - ${file}`);
console.error("\nUse .env.example, .env.<qualifier>.example, or .env.schema templates instead.\n");
exit(1);
