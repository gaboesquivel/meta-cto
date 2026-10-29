import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { ProofAccess } from "@/lib/auth/proof-access";
import { proofReportFor } from "@/lib/signal/proof/report";
import { getProofReport } from "@/lib/signal/proof/sources";

import { advertised, invalidInputToolError, toToolError } from "./signal-tool-helpers";
import { asToolResult } from "./tool-result";

/** The Proof Report read tool (spec 003): public MCP with the Pilot Key, and the Operator MCP. */
export const PROOF_REPORT_TOOL = "proof_report";

export const proofReportToolDescription =
  "Read the Proof Report (read-only): each preset bar (pilot Intake Duplicate Rate at most half the backlog baseline, Review Coverage at least 80% over about 200 filings, Same-Need Precision at least 85% and Related-Need Precision at least 75% on Held-Out Set v2) with its value, counts, 95% interval where it applies, and verdict pass, fail or inconclusive with reasons; the consequences (kill criterion triggered, three-way verdict to be narrowed, slice 3 may start or not yet); supporting Agent Correctness, Product Manager agreement (blind and not) and Suggestion Acceptance (reported, not evidence), Operator MCP only: with the Pilot Key the supporting section is withheld ({ withheld: true, note }) during the pilot; and readiness (including changed after freeze: reading reset, and re-frozen, no reading yet) of the frozen pilot files and Held-Out Set v2. On the public MCP it needs the Pilot Key header; otherwise the call returns pilot_key_required: branch on error.details.reason: missing (send the key), invalid (wrong key) or disabled (no Pilot Key configured on this deployment).";

const inputSchema = z.object({});

/** `authorize` decides per call: the Pilot Key on the public MCP, always granted on the Operator MCP. */
export const registerProofMcpTool = (server: McpServer, authorize: () => ProofAccess) => {
  registerAppTool(
    server,
    PROOF_REPORT_TOOL,
    {
      _meta: {},
      description: proofReportToolDescription,
      inputSchema: advertised(inputSchema),
    },
    async (args) => {
      const parsed = inputSchema.safeParse(args ?? {});
      if (!parsed.success) return invalidInputToolError(parsed.error);
      const access = authorize();
      if (!access.ok) return toToolError(access.error);
      try {
        return asToolResult(proofReportFor(await getProofReport(), access.via));
      } catch (error) {
        return toToolError(error);
      }
    },
  );
};
