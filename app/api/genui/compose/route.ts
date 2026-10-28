import {
  composeQuery,
  GENUI_LIBRARY_VERSION,
  groundedRecordSchema,
  MAX_QUERY_CODE_POINTS,
} from "@/lib/genui";
import type { ComposeInput } from "@/lib/genui";
import { z } from "zod";

import { loadRootEnv } from "@/lib/env";

loadRootEnv();

const priorEnvelopeSchema = z.object({
  fallbackText: z.string(),
  libraryVersion: z.literal(GENUI_LIBRARY_VERSION),
  openuiText: z.string(),
  records: z.array(groundedRecordSchema),
  requestId: z.string(),
});

const bodySchema = z.object({
  clientRequestId: z.string().min(1),
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
  version: z.number().int().positive(),
});

export const POST = async (request: Request) => {
  let input: ComposeInput;
  try {
    const json = await request.json();
    input = bodySchema.parse(json);
  } catch {
    return Response.json({ error: "invalid-body" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      void composeQuery({
        input,
        onEvent: (event) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        },
        signal: request.signal,
      })
        .then(() => controller.close())
        .catch(() => {
          controller.enqueue(
            encoder.encode(
              `${JSON.stringify({
                message: "Compose failed.",
                requestId: input.clientRequestId,
                sequence: 0,
                type: "error",
              })}\n`,
            ),
          );
          controller.close();
        });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
};
