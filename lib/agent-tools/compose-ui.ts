import type { CompositionEnvelope } from "@/lib/genui";
import { composeQueryToEnvelope, MAX_QUERY_CODE_POINTS } from "@/lib/genui";
import { defineTool } from "eve/tools";
import { z } from "zod";

const priorEnvelopeSchema = z.object({
  fallbackText: z.string(),
  libraryVersion: z.number(),
  openuiText: z.string(),
  records: z.array(z.record(z.string(), z.unknown())),
  requestId: z.string(),
});

export default defineTool({
  description:
    "Generate a validated OpenUI composition from a natural-language UI request (synthetic demo data).",
  async execute({ mode, priorEnvelope, query, turns }) {
    const clientRequestId = `eve-${Date.now()}`;
    const { envelope, result } = await composeQueryToEnvelope({
      input: {
        clientRequestId,
        mode,
        priorEnvelope: priorEnvelope as CompositionEnvelope | undefined,
        query,
        turns,
        version: 1,
      },
    });
    if (!envelope || result.metadata.outcome !== "success")
      return {
        error: "composition_failed",
        failureCode: result.metadata.failureCode,
        validationOk: result.metadata.validationOk,
      };
    return {
      envelope,
      metadata: result.metadata,
    };
  },
  inputSchema: z.object({
    mode: z.enum(["create", "refine"]).optional(),
    priorEnvelope: priorEnvelopeSchema.optional(),
    query: z.string().min(1).max(MAX_QUERY_CODE_POINTS),
    turns: z
      .array(
        z.object({
          content: z.string(),
          role: z.enum(["assistant", "user"]),
        }),
      )
      .max(12)
      .optional(),
  }),
});
