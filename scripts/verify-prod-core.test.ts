import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  commitDeploymentStatus,
  latestStatus,
  pickDeployment,
  redirectTarget,
  summarizeChecks,
  verdict,
  vercelStatus,
} from "./verify-prod-core";

describe("summarizeChecks", () => {
  it("reports none, pending, failed and passed check runs", () => {
    assert.equal(summarizeChecks([]).state, "none");
    assert.equal(
      summarizeChecks([
        { conclusion: "success", name: "lint", status: "completed" },
        { conclusion: null, name: "test", status: "in_progress" },
      ]).state,
      "pending",
    );
    const failed = summarizeChecks([
      { conclusion: "success", name: "lint", status: "completed" },
      { conclusion: "failure", name: "test", status: "completed" },
    ]);
    assert.equal(failed.state, "failed");
    assert.deepEqual(failed.lines, ["lint: success", "test: failure"]);
    assert.equal(
      summarizeChecks([{ conclusion: "skipped", name: "e2e", status: "completed" }]).state,
      "passed",
    );
  });
});

describe("pickDeployment", () => {
  it("prefers the newest production deployment, else the newest", () => {
    const preview = { created_at: "2026-10-29T02:00:00Z", environment: "Preview", id: 1 };
    const oldProd = { created_at: "2026-10-29T00:00:00Z", environment: "Production", id: 2 };
    const newProd = { created_at: "2026-10-29T01:00:00Z", environment: "Production", id: 3 };
    assert.equal(pickDeployment([preview, oldProd, newProd])?.id, 3);
    assert.equal(pickDeployment([preview])?.id, 1);
    assert.equal(pickDeployment([]), undefined);
  });
});

describe("latestStatus", () => {
  it("reads the newest status and treats none as pending", () => {
    assert.equal(latestStatus([]).state, "pending");
    assert.equal(
      latestStatus([
        { created_at: "2026-10-29T01:00:00Z", state: "in_progress" },
        { created_at: "2026-10-29T01:05:00Z", log_url: "https://log", state: "success" },
      ]).state,
      "success",
    );
  });
});

describe("redirectTarget", () => {
  const trusted = new Set(["meta-cto-app.vercel.app"]);

  it("follows only https redirects to a trusted host", () => {
    const from = "https://meta-cto-app.vercel.app/review";
    assert.equal(
      redirectTarget(from, "/operator", trusted),
      "https://meta-cto-app.vercel.app/operator",
    );
    assert.throws(() => redirectTarget(from, "https://evil.example/", trusted), /evil.example/u);
    assert.throws(() => redirectTarget(from, "http://meta-cto-app.vercel.app/", trusted), /http:/u);
  });
});

describe("verdict", () => {
  it("is live only with passing checks, a successful deployment and 2xx pages", () => {
    const pages = [{ path: "/", status: 200 }];
    assert.equal(verdict({ checks: "passed", deployment: "success", pages }), "live");
    assert.equal(verdict({ checks: "failed", deployment: "success", pages }), "failed");
    assert.equal(
      verdict({ checks: "passed", deployment: "success", pages: [{ path: "/", status: 500 }] }),
      "failed",
    );
    assert.equal(verdict({ checks: "passed", deployment: "error", pages: [] }), "failed");
    assert.equal(verdict({ checks: "pending", deployment: "success", pages }), "unverified");
    assert.equal(verdict({ checks: "passed", deployment: "pending", pages: [] }), "unverified");
  });
});

describe("vercelStatus", () => {
  const sha = "f0c75c2075f92fbf49c540d6d79964ee48d3fb83";
  const row = (uid: string, created: number, readyState: string, commit = sha) => ({
    created,
    meta: { githubCommitSha: commit },
    readyState,
    uid,
    url: `${uid}.vercel.app`,
  });

  it("maps the newest deployment of the commit to a deployment status", () => {
    const result = vercelStatus(
      [row("old", 1, "ERROR"), row("new", 2, "READY"), row("other", 3, "READY", "abc")],
      sha,
    );
    assert.equal(result?.id, "new");
    assert.equal(result?.status.state, "success");
    assert.equal(result?.status.environment_url, "https://new.vercel.app");
    assert.equal(vercelStatus([row("b", 1, "BUILDING")], sha)?.status.state, "in_progress");
    assert.equal(vercelStatus([row("c", 1, "CANCELED")], sha)?.status.state, "error");
    assert.equal(vercelStatus([row("x", 1, "READY", "abc")], sha), null);
  });
});

const status = (context: string, state: string, updated_at: string) => ({
  context,
  state,
  target_url: `https://vercel.com/${state}`,
  updated_at,
});

describe("commitDeploymentStatus", () => {
  it("maps the newest Vercel commit status and ignores other contexts", () => {
    const result = commitDeploymentStatus([
      status("Vercel", "pending", "2026-10-29T01:00:00Z"),
      status("Vercel", "success", "2026-10-29T01:02:00Z"),
      status("ci/other", "failure", "2026-10-29T01:03:00Z"),
    ]);
    assert.equal(result?.status.state, "success");
    assert.equal(result?.status.log_url, "https://vercel.com/success");
    assert.equal(commitDeploymentStatus([status("ci/other", "success", "x")]), null);
  });
});
