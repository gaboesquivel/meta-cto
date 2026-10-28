import { z } from "zod";

import { validateCompositionEnvelope } from "../contract/compiler";
import { GENUI_LIBRARY_VERSION } from "../core/envelope";
import { groundedRecordSchema } from "../core/grounded-record-schema";
import { GENUI_MAX_DOCUMENT_BYTES } from "../core/limits";
import type { ComposeStreamEvent } from "./stream";

export const NDJSON_MAX_LINE_BYTES = 128 * 1024;
export const NDJSON_MAX_RESPONSE_BYTES = 512 * 1024;
export const NDJSON_MAX_EVENTS = 32;

const requestId = z.string().min(1).max(128);
const sequence = z.number().int().nonnegative();

const envelopeSchema = z.strictObject({
  fallbackText: z.string().max(8000),
  libraryVersion: z.literal(GENUI_LIBRARY_VERSION),
  openuiText: z.string().min(1).max(GENUI_MAX_DOCUMENT_BYTES),
  records: z.array(groundedRecordSchema).max(64),
  requestId,
});

const composeStreamEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ requestId, sequence, type: z.literal("start") }),
  z.strictObject({
    envelope: envelopeSchema,
    requestId,
    sequence,
    type: z.literal("partial"),
  }),
  z.strictObject({
    envelope: envelopeSchema,
    metadata: z
      .strictObject({
        classifier: z.enum(["jev", "regex"]).optional(),
        component: z.string().optional(),
        composite: z.string().nullable().optional(),
        failureCode: z
          .enum([
            "classification_failed",
            "generation_invalid",
            "missing_credentials",
            "unsupported_request",
            "validation_failed",
          ])
          .optional(),
        outcome: z.enum(["failed", "success"]),
        refined: z.boolean().optional(),
        tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        validationOk: z.boolean(),
      })
      .optional(),
    requestId,
    sequence,
    type: z.literal("complete"),
  }),
  z.strictObject({
    message: z.string().min(1).max(500),
    requestId,
    sequence,
    type: z.literal("error"),
  }),
]);

export const parseComposeStreamEvent = (
  value: unknown,
): { event: ComposeStreamEvent; ok: true } | { ok: false; reason: "invalid_event" } => {
  const parsed = composeStreamEventSchema.safeParse(value);
  if (!parsed.success) return { ok: false, reason: "invalid_event" };
  if (parsed.data.type === "partial" || parsed.data.type === "complete") {
    const validated = validateCompositionEnvelope({
      envelope: parsed.data.envelope,
    });
    if (!validated.ok) return { ok: false, reason: "invalid_event" };
  }
  return { event: parsed.data, ok: true };
};
