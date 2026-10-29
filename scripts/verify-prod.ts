import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

import type {
  CheckRun,
  CommitStatus,
  Deployment,
  DeploymentStatus,
  PageResult,
  VercelDeployment,
} from "./verify-prod-core";
import {
  commitDeploymentStatus,
  latestStatus,
  pickDeployment,
  redirectTarget,
  summarizeChecks,
  verdict,
  vercelStatus,
} from "./verify-prod-core";

/**
 * Ship's Verify for a shipped commit: `pnpm verify:prod [sha]` (default: origin/main).
 * Reads GitHub check runs and the Vercel deployment, then GETs the production pages.
 * Read-only: no sign-in, no writes. Exit 0 only when live.
 */

const PRODUCTION_URL = process.env.SIGNAL_PRODUCTION_URL ?? "https://meta-cto-app.vercel.app";
const PAGES = ["/", "/review", "/api/metrics", "/api/review/queue"];
const POLL_MS = 30_000;
const DEADLINE = Date.now() + 15 * 60_000;
/** How long to wait for Vercel to post any status after a merge. */
const MISSING_DEADLINE = Date.now() + 2 * 60_000;
const TIMEOUT_MS = 15_000;

/** Arguments go to gh as an array: no shell, no word splitting. */
const gh = <T>(...args: string[]): T =>
  JSON.parse(execFileSync("gh", args, { encoding: "utf-8" })) as T;

const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf-8" }).trim();

const repo = git("remote", "get-url", "origin")
  .replace(/^.*github\.com[:/]/u, "")
  .replace(/\.git$/u, "");

const readChecks = (sha: string) =>
  summarizeChecks(
    gh<{ check_runs: CheckRun[] }>("api", `repos/${repo}/commits/${sha}/check-runs`).check_runs,
  );

/** Production deployments straight from Vercel, for projects that do not report to GitHub. */
const readVercel = (sha: string) => {
  const project = (() => {
    try {
      return JSON.parse(readFileSync(".vercel/project.json", "utf-8")) as {
        orgId: string;
        projectId: string;
      };
    } catch {
      return null;
    }
  })();
  if (!project) return null;
  const query = `projectId=${project.projectId}&teamId=${project.orgId}&target=production&limit=20`;
  let output: string;
  try {
    output = execFileSync("vercel", ["api", `/v6/deployments?${query}`], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
  return vercelStatus((JSON.parse(output) as { deployments: VercelDeployment[] }).deployments, sha);
};

const onMain = (sha: string) => {
  try {
    git("merge-base", "--is-ancestor", sha, "origin/main");
    return true;
  } catch {
    return false;
  }
};

const MISSING: { id: null; status: DeploymentStatus } = {
  id: null,
  status: { created_at: "", state: "missing" },
};

/**
 * Vercel's commit status. It does not say preview or production, so it counts only for
 * commits on main, which Vercel deploys to production.
 */
const readCommitStatus = (sha: string) =>
  onMain(sha)
    ? (commitDeploymentStatus(
        gh<{ statuses: CommitStatus[] }>("api", `repos/${repo}/commits/${sha}/status`).statuses,
      ) ?? MISSING)
    : MISSING;

const readDeployment = (sha: string) => {
  const deployment = pickDeployment(
    gh<Deployment[]>("api", `repos/${repo}/deployments?sha=${sha}`),
  );
  if (!deployment) return readVercel(sha) ?? readCommitStatus(sha);
  const statuses = gh<DeploymentStatus[]>(
    "api",
    `repos/${repo}/deployments/${deployment.id}/statuses`,
  );
  return { id: deployment.id, status: latestStatus(statuses) };
};

const settled = (sha: string) => {
  const checks = readChecks(sha);
  const deployment = readDeployment(sha);
  const waiting =
    checks.state === "pending" ||
    ["pending", "queued", "in_progress"].includes(deployment.status.state) ||
    (deployment.status.state === "missing" && Date.now() < MISSING_DEADLINE);
  return { checks, deployment, waiting };
};

const waitForSettled = async (sha: string): Promise<ReturnType<typeof settled>> => {
  const state = settled(sha);
  if (!state.waiting || Date.now() + POLL_MS > DEADLINE) return state;
  console.log(`waiting: checks ${state.checks.state}, deployment ${state.deployment.status.state}`);
  await sleep(POLL_MS);
  return await waitForSettled(sha);
};

const trusted = new Set([new URL(PRODUCTION_URL).host]);

const fetchStatus = async (url: string, hops = 0): Promise<number> => {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const location = response.headers.get("location");
  if (response.status >= 300 && response.status < 400 && location && hops < 3) {
    return await fetchStatus(redirectTarget(url, location, trusted), hops + 1);
  }
  return response.status;
};

const probe = async (): Promise<PageResult[]> =>
  await Promise.all(
    PAGES.map(async (path) => ({
      path,
      status: await fetchStatus(new URL(path, PRODUCTION_URL).toString()).catch(() => 0),
    })),
  );

const run = async () => {
  const sha = git("rev-parse", process.argv[2] ?? "origin/main");
  console.log(`verify ${sha.slice(0, 7)} on ${repo}`);
  const { checks, deployment } = await waitForSettled(sha);
  console.log(`checks: ${checks.state}`);
  for (const line of checks.lines) console.log(`  ${line}`);
  const { status } = deployment;
  const link = status.log_url ?? status.environment_url ?? "";
  console.log(`deployment: ${deployment.id ?? "none"} ${status.state} ${link}`);
  const pages = status.state === "success" ? await probe() : [];
  for (const page of pages) console.log(`GET ${page.path} -> ${page.status || "no response"}`);
  const result = verdict({ checks: checks.state, deployment: status.state, pages });
  console.log(`result: ${result}`);
  process.exitCode = result === "live" ? 0 : 1;
};

await run();
