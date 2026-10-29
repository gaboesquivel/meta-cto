import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import { SignalError } from "@/lib/signal/contracts";
import { z } from "zod";

import { asToolError } from "./tool-result";

/**
 * Advertise the zod JSON Schema in tools/list but let every call through, so the
 * handler can return `invalid_input` with a resolution instead of the SDK's bare message.
 */
export const advertised = <S extends z.ZodType>(
  schema: S,
): StandardSchemaWithJSON<z.input<S>, unknown> => ({
  "~standard": {
    jsonSchema: schema["~standard"].jsonSchema,
    validate: (value: unknown) => ({ value }),
    vendor: "signal",
    version: 1,
  },
});

/** Keep structured details (issues, existing records); drop raw strings that may wrap provider messages. */
const safeDetails = (details: unknown) =>
  details && typeof details === "object" ? details : undefined;

/** Maps a thrown error to `{ code, message, resolution }`; unknown errors become `internal_error`. */
export const toToolError = (error: unknown) => {
  if (error instanceof SignalError)
    return asToolError({
      code: error.code,
      details: safeDetails(error.details),
      message: error.message,
      resolution: error.resolution,
    });
  console.error("[signal] unexpected MCP tool error", error);
  return asToolError({
    code: "internal_error",
    message: "Unexpected error",
    resolution: "Retry the call; if it keeps failing, report it to the operator.",
  });
};

/** Generic `invalid_input` error listing each failing field. */
export const invalidInputToolError = (error: z.ZodError) =>
  asToolError({
    code: "invalid_input",
    details: error.issues.map((issue) => ({
      message: issue.message,
      path: issue.path.join("."),
    })),
    message: `Invalid arguments: ${z.prettifyError(error)}`,
    resolution: "Fix the fields listed in details to match the tool's input schema and call again.",
  });
