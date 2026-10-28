import type { CompositionEnvelope } from "../core/envelope";
import type { ComposeResult } from "./compose";
import {
  NDJSON_MAX_EVENTS,
  NDJSON_MAX_LINE_BYTES,
  NDJSON_MAX_RESPONSE_BYTES,
  parseComposeStreamEvent,
} from "./stream-schema";

export type ComposeStreamEvent =
  | { requestId: string; sequence: number; type: "start" }
  | {
      envelope: CompositionEnvelope;
      requestId: string;
      sequence: number;
      type: "partial";
    }
  | {
      envelope: CompositionEnvelope;
      metadata?: ComposeResult["metadata"];
      requestId: string;
      sequence: number;
      type: "complete";
    }
  | { message: string; requestId: string; sequence: number; type: "error" };

export type NdjsonFailureReason =
  | "aborted"
  | "empty_stream"
  | "invalid_event"
  | "malformed_line"
  | "no_body"
  | "oversized_line"
  | "oversized_response"
  | "too_many_events"
  | "truncated_stream";

export type NdjsonConsumeResult = { ok: true } | { ok: false; reason: NdjsonFailureReason };

const encoder = new TextEncoder();

export const utf8ByteLength = (value: string) => encoder.encode(value).byteLength;

const parseLine = (line: string) => {
  if (utf8ByteLength(line) > NDJSON_MAX_LINE_BYTES)
    return { ok: false as const, reason: "oversized_line" as const };
  let value: unknown;
  try {
    value = JSON.parse(line) as unknown;
  } catch {
    return { ok: false as const, reason: "malformed_line" as const };
  }
  const parsed = parseComposeStreamEvent(value);
  if (!parsed.ok) return { ok: false as const, reason: "invalid_event" as const };
  return { event: parsed.event, ok: true as const };
};

export const parseNdjsonText = (
  text: string,
): { events: ComposeStreamEvent[]; ok: true } | { ok: false; reason: NdjsonFailureReason } => {
  if (utf8ByteLength(text) > NDJSON_MAX_RESPONSE_BYTES)
    return { ok: false, reason: "oversized_response" };
  const events: ComposeStreamEvent[] = [];
  const lines = text.split("\n");
  const completeLines = lines.slice(0, -1);
  const trailing = lines.at(-1) ?? "";
  for (const line of completeLines) {
    if (!line.trim()) continue;
    const parsed = parseLine(line);
    if (!parsed.ok) return parsed;
    events.push(parsed.event);
    if (events.length > NDJSON_MAX_EVENTS) return { ok: false, reason: "too_many_events" };
  }
  if (trailing.trim()) {
    const parsed = parseLine(trailing);
    if (!parsed.ok) {
      return text.endsWith("\n") ? parsed : { ok: false, reason: "truncated_stream" };
    }
    events.push(parsed.event);
  }
  if (events.length > NDJSON_MAX_EVENTS) return { ok: false, reason: "too_many_events" };
  if (!events.length) return { ok: false, reason: "empty_stream" };
  return { events, ok: true };
};

export const consumeNdjsonResponse = async ({
  onEvent,
  response,
}: {
  onEvent: (event: ComposeStreamEvent) => void;
  response: Response;
}): Promise<NdjsonConsumeResult> => {
  const reader = response.body?.getReader();
  if (!reader) return { ok: false, reason: "no_body" };
  const decoder = new TextDecoder();
  let pending = "";
  let totalBytes = 0;
  let events = 0;

  const emitLine = (line: string): NdjsonConsumeResult | null => {
    if (!line.trim()) return null;
    if (utf8ByteLength(line) > NDJSON_MAX_LINE_BYTES) {
      return { ok: false, reason: "oversized_line" };
    }
    const parsed = parseLine(line);
    if (!parsed.ok) return parsed;
    events += 1;
    if (events > NDJSON_MAX_EVENTS) return { ok: false, reason: "too_many_events" };
    onEvent(parsed.event);
    return null;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > NDJSON_MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return { ok: false, reason: "oversized_response" };
      }
      pending += decoder.decode(value, { stream: true });
      let newline = pending.indexOf("\n");
      while (newline !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        const failure = emitLine(line);
        if (failure) {
          await reader.cancel();
          return failure;
        }
        newline = pending.indexOf("\n");
      }
      if (utf8ByteLength(pending) > NDJSON_MAX_LINE_BYTES) {
        await reader.cancel();
        return { ok: false, reason: "oversized_line" };
      }
    }
    pending += decoder.decode();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      return { ok: false, reason: "aborted" };
    return { ok: false, reason: "truncated_stream" };
  }

  if (pending.trim()) {
    const parsed = parseLine(pending);
    if (!parsed.ok) return { ok: false, reason: "truncated_stream" };
    events += 1;
    if (events > NDJSON_MAX_EVENTS) return { ok: false, reason: "too_many_events" };
    onEvent(parsed.event);
  }

  if (events === 0) return { ok: false, reason: "empty_stream" };
  return { ok: true };
};
