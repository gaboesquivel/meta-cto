import { generateObject } from "ai";
import { z } from "zod";

import { validateCompositionEnvelope } from "../contract/compiler";
import type { CompositionEnvelope, GroundedRecord } from "../core/envelope";
import { GENUI_LIBRARY_VERSION } from "../core/envelope";
import { groundedRecordSchema } from "../core/grounded-record-schema";
import { acmeCatalogRecords } from "../fixtures/acme-catalog";
import { supportDashboardRecords } from "../fixtures/synthetic-support";
import { componentNames } from "../registry/components";
import { compositionGuidance } from "../registry/semantics";

export interface ComposeTurn {
  content: string;
  role: "assistant" | "user";
}

const DEFAULT_GENUI_MODEL = "anthropic/claude-sonnet-4.6";

const generationSchema = z.object({
  fallbackText: z.string().min(1).max(400),
  openuiText: z
    .string()
    .min(8)
    .max(2000)
    .refine((t) => /^\s*root\s*=/u.test(t), "must start with root ="),
  records: z.array(groundedRecordSchema).max(24),
});

export const synthesizeOpenUiComposition = async ({
  query,
  requestId,
  signal,
}: {
  query: string;
  requestId: string;
  signal?: AbortSignal;
}): Promise<CompositionEnvelope | null> => {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.GENUI_MODEL?.trim() || DEFAULT_GENUI_MODEL;
  const seedRecords = [...acmeCatalogRecords, ...supportDashboardRecords];

  const result = await generateObject({
    abortSignal: signal,
    maxOutputTokens: 1200,
    model,
    prompt: `You generate declarative OpenUI compositions for a demo app. Use ONLY these root components: ${componentNames.join(", ")}.
Rules:
- openuiText must be a single expression: root = ComponentName(...)
- Use realistic synthetic data in records; ids must match references in openuiText.
- No scripts, URLs to arbitrary domains, or credentials.
- Guidance: ${compositionGuidance}

User request: ${query}

Example records (you may copy ids or invent similar synthetic rows): ${JSON.stringify(seedRecords.slice(0, 6))}`,
    schema: generationSchema,
  });

  const envelope: CompositionEnvelope = {
    fallbackText: result.object.fallbackText,
    libraryVersion: GENUI_LIBRARY_VERSION,
    openuiText: result.object.openuiText,
    records: result.object.records as GroundedRecord[],
    requestId,
  };

  const validated = validateCompositionEnvelope({ envelope });
  if (!validated.ok) return null;
  return envelope;
};

const turnTranscript = (turns?: ComposeTurn[]) => {
  if (!turns?.length) return "";
  return turns
    .slice(-6)
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join("\n");
};

export const refineOpenUiComposition = async ({
  priorEnvelope,
  query,
  requestId,
  signal,
  turns,
}: {
  priorEnvelope: CompositionEnvelope;
  query: string;
  requestId: string;
  signal?: AbortSignal;
  turns?: ComposeTurn[];
}): Promise<CompositionEnvelope | null> => {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.GENUI_MODEL?.trim() || DEFAULT_GENUI_MODEL;
  const transcript = turnTranscript(turns);

  const result = await generateObject({
    abortSignal: signal,
    maxOutputTokens: 1400,
    model,
    prompt: `You refine an existing declarative OpenUI composition for a demo app. Use ONLY these root components: ${componentNames.join(", ")}.
Rules:
- openuiText must be a single expression: root = ComponentName(...)
- Preserve grounded record ids from the prior composition when still relevant; you may add synthetic rows.
- Apply the user's requested change; do not discard unrelated sections unless asked.
- No scripts, URLs to arbitrary domains, or credentials.
- Guidance: ${compositionGuidance}

Prior openuiText:
${priorEnvelope.openuiText}

Prior records:
${JSON.stringify(priorEnvelope.records)}

Conversation:
${transcript || "(none)"}

Refinement request: ${query}`,
    schema: generationSchema,
  });

  const envelope: CompositionEnvelope = {
    fallbackText: result.object.fallbackText,
    libraryVersion: GENUI_LIBRARY_VERSION,
    openuiText: result.object.openuiText,
    records: result.object.records as GroundedRecord[],
    requestId,
  };

  const validated = validateCompositionEnvelope({ envelope });
  if (!validated.ok) return null;
  return envelope;
};
