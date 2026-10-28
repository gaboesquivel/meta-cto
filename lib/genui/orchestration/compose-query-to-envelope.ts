import type { CompositionEnvelope } from "../core/envelope";
import type { ComposeInput, ComposeResult } from "./compose";
import { composeQuery } from "./compose";

export const composeQueryToEnvelope = async ({
  input,
  signal,
}: {
  input: ComposeInput;
  signal?: AbortSignal;
}): Promise<{
  envelope: CompositionEnvelope | null;
  result: ComposeResult;
}> => {
  const result = await composeQuery({ input, signal });
  const complete = result.events.find((event) => event.type === "complete");
  const envelope = complete?.type === "complete" ? complete.envelope : null;
  return { envelope, result };
};
