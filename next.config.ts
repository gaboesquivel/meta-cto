import { withEve } from "eve/next";
import type { NextConfig } from "next";

/** Markdown negotiation when Accept asks for markdown and does not list text/html. */
const markdownAcceptPattern = "^(?!.*text/html).*text/markdown";

/** Files the Proof Report reads at request time (lib/signal/proof/sources.ts). */
const proofReportFiles = [
  "./data/pilot/*.json",
  "./evals/signal-verdict/held-out-v2*.json",
  "./evals/signal-verdict/runs.jsonl",
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
