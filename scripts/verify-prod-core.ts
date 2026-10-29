/** Pure decisions for `pnpm verify:prod`; the script owns GitHub and network calls. */

export interface CheckRun {
  conclusion: string | null;
  name: string;
  status: string;
}

export type ChecksState = "none" | "pending" | "failed" | "passed";

const PASSING = new Set(["success", "neutral", "skipped"]);

export const summarizeChecks = (runs: CheckRun[]) => {
  const lines = runs.map((run) => `${run.name}: ${run.conclusion ?? run.status}`);
  let state: ChecksState = "passed";
  if (runs.length === 0) state = "none";
  else if (runs.some((run) => run.status !== "completed")) state = "pending";
  else if (runs.some((run) => !PASSING.has(run.conclusion ?? ""))) state = "failed";
  return { lines, state };
};

export interface Deployment {
  created_at: string;
  environment: string;
  id: number;
}

const newestFirst = <T extends { created_at: string }>(rows: T[]) =>
  rows.toSorted((a, b) => b.created_at.localeCompare(a.created_at));

export const pickDeployment = (deployments: Deployment[]) => {
  const sorted = newestFirst(deployments);
  return sorted.find((row) => row.environment.toLowerCase() === "production") ?? sorted[0];
};

export interface DeploymentStatus {
  created_at: string;
  environment_url?: string;
  log_url?: string;
  state: string;
}

export const latestStatus = (statuses: DeploymentStatus[]): DeploymentStatus =>
  newestFirst(statuses)[0] ?? { created_at: "", state: "pending" };

export interface VercelDeployment {
  created: number;
  meta?: { githubCommitSha?: string };
  readyState: string;
  uid: string;
  url: string;
}

const VERCEL_STATES: Record<string, string> = {
  BUILDING: "in_progress",
  CANCELED: "error",
  ERROR: "error",
  INITIALIZING: "in_progress",
  QUEUED: "queued",
  READY: "success",
};

/** The newest Vercel production deployment of `sha`, as a GitHub-style deployment status. */
export const vercelStatus = (deployments: VercelDeployment[], sha: string) => {
  const [match] = deployments
    .filter((row) => row.meta?.githubCommitSha === sha)
    .toSorted((a, b) => b.created - a.created);
  if (!match) return null;
  const status: DeploymentStatus = {
    created_at: new Date(match.created).toISOString(),
    environment_url: `https://${match.url}`,
    state: VERCEL_STATES[match.readyState] ?? "pending",
  };
  return { id: match.uid, status };
};

export interface CommitStatus {
  context: string;
  state: string;
  target_url: string | null;
  updated_at: string;
}

/**
 * The Vercel commit status of a commit, as a GitHub-style deployment status. Vercel's
 * GitHub app reports here even when it creates no GitHub Deployments.
 */
export const commitDeploymentStatus = (statuses: CommitStatus[]) => {
  const [match] = statuses
    .filter((row) => row.context === "Vercel")
    .toSorted((a, b) => b.updated_at.localeCompare(a.updated_at));
  if (!match) return null;
  const status: DeploymentStatus = {
    created_at: match.updated_at,
    log_url: match.target_url ?? undefined,
    state: match.state,
  };
  return { id: null, status };
};

/** The next URL of a redirect, refusing anything but https on a trusted host. */
export const redirectTarget = (from: string, location: string, trusted: Set<string>) => {
  const target = new URL(location, from);
  if (target.protocol !== "https:" || !trusted.has(target.host)) {
    throw new Error(`redirect to untrusted ${target.protocol}//${target.host}`);
  }
  return target.toString();
};

export interface PageResult {
  path: string;
  status: number;
}

export type Verdict = "live" | "failed" | "unverified";

export const verdict = (input: {
  checks: ChecksState;
  deployment: string;
  pages: PageResult[];
}): Verdict => {
  const pageFailed = input.pages.some((page) => page.status < 200 || page.status >= 300);
  if (input.checks === "failed" || ["error", "failure"].includes(input.deployment) || pageFailed) {
    return "failed";
  }
  const done = input.checks === "passed" && input.deployment === "success";
  return done && input.pages.length > 0 ? "live" : "unverified";
};
