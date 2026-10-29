import { withEve } from "eve/next";
import type { NextConfig } from "next";

/** Markdown negotiation when Accept asks for markdown and does not list text/html. */
const markdownAcceptPattern = "^(?!.*text/html).*text/markdown";

/**
 * The only files the Proof Report reads at request time: the committed freeze locks (fingerprint,
 * time and counts; lib/signal/proof/locks.ts). Pilot and v2 content is read from the database and
 * never traced into the deployment (spec 004, decision 0004).
 */
const proofReportFiles = [
  "./data/pilot/pilot.lock.json",
  "./evals/signal-verdict/held-out-v2.lock.json",
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["meta-cto.localhost", "*.meta-cto.localhost"],
  experimental: {
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
    },
  },
  headers() {
    return [
      {
        headers: [{ key: "Vary", value: "Accept" }],
        source: "/",
      },
    ];
  },
  outputFileTracingIncludes: {
    "/api/mcp": ["./mcp-app/dist/genui-preview.html", ...proofReportFiles],
    "/api/mcp/operator": ["./mcp-app/dist/genui-preview.html", ...proofReportFiles],
    "/api/proof": proofReportFiles,
    "/mcp": ["./mcp-app/dist/genui-preview.html", ...proofReportFiles],
    "/proof": proofReportFiles,
  },
  redirects() {
    return [{ destination: "/dev", permanent: false, source: "/developers" }];
  },
  rewrites() {
    return {
      beforeFiles: [
        {
          destination: "/api/:path*",
          source: "/v1/api/:path*",
        },
        {
          destination: "/markdown/home",
          source: "/index.md",
        },
        {
          destination: "/markdown/home",
          has: [
            {
              key: "accept",
              type: "header",
              value: markdownAcceptPattern,
            },
          ],
          source: "/",
        },
      ],
    };
  },
};

export default withEve(nextConfig, { eveRoot: "." });
