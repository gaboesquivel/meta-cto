#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import path from "node:path";
import { exit } from "node:process";
import { pathToFileURL } from "node:url";

const allowedEnvNames = new Set([".env.example", ".env.schema"]);

const blockedSuffixes = [
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".jks",
  ".keystore",
  ".crt",
  ".cer",
  ".der",
  ".p7b",
  ".p7c",
  ".p7m",
  ".p7s",
  ".keytab",
];

const basenameOf = (filename) => filename.split("/").pop() ?? filename;

export const isAllowedEnvTemplate = (filename) => {
  const name = basenameOf(filename);
  if (allowedEnvNames.has(name)) return true;
  return /^\.env\.[^/]+\.example$/u.test(name);
};

const isEnvLike = (name) =>
  name === ".env" || name.startsWith(".env.") || name.endsWith(".env") || name.includes(".env.");

const isKeyMaterial = (name) =>
  name === "id_rsa" ||
  name.startsWith("id_rsa.") ||
  blockedSuffixes.some((suffix) => name.endsWith(suffix));

export function isBlocked(filename) {
  const name = basenameOf(filename);
  if (isAllowedEnvTemplate(filename)) return false;
  return isEnvLike(name) || isKeyMaterial(name);
}

function stagedFiles() {
  const output = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"],
    { encoding: "utf-8" },
  );
  return output.split("\0").filter((line) => line.length > 0);
}

function main() {
  const blockedFiles = stagedFiles().filter(isBlocked);
  if (blockedFiles.length === 0) exit(0);

  console.error("\nSecurity check failed: attempting to commit sensitive files\n");
  for (const file of blockedFiles) console.error(`  - ${file}`);
  console.error(
    "\nUse .env.example, .env.<qualifier>.example, or .env.schema templates instead of committing secrets.\n",
  );
  exit(1);
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;

if (import.meta.url === entrypoint) main();
