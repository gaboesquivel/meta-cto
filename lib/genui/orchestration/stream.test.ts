import assert from "node:assert/strict";
import { describe, it } from "vitest";

import type { CompositionEnvelope } from "../core/envelope";
import { composeQuery } from "./compose";
import { consumeNdjsonResponse } from "./stream";
import {
  NDJSON_MAX_EVENTS,
  NDJSON_MAX_LINE_BYTES,
  NDJSON_MAX_RESPONSE_BYTES,
} from "./stream-schema";

const responseOf = (body: string) =>
  new Response(body, { headers: { "content-type": "application/x-ndjson" } });

const validEvents = async () => {
  const result = await composeQuery({
    input: {
      clientRequestId: "stream-1",
      query: "Compare Orbit plan versus Nova plan",
      version: 1,
    },
  });
  return result.events;
};

const encode = (events: unknown[]) =>
  `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;

describe("consumeNdjsonResponse", () => {
  it("accepts start, partial, and complete", async () => {
    const seen: string[] = [];
    const result = await consumeNdjsonResponse({
      onEvent: (event) => seen.push(event.type),
      response: responseOf(encode(await validEvents())),
    });
    assert.deepEqual(result, { ok: true });
    assert.deepEqual(seen, ["start", "partial", "complete"]);
  });

  it("accepts an error event after start", async () => {
    const seen: string[] = [];
    const result = await consumeNdjsonResponse({
      onEvent: (event) => seen.push(event.type),
      response: responseOf(
        encode([
          { requestId: "stream-1", sequence: 0, type: "start" },
          {
            message: "Composition failed validation.",
            requestId: "stream-1",
            sequence: 1,
            type: "error",
          },
        ]),
      ),
    });
    assert.equal(result.ok, true);
    assert.deepEqual(seen, ["start", "error"]);
  });

  it("rejects a malformed JSON line", async () => {
    const seen: unknown[] = [];
    const result = await consumeNdjsonResponse({
      onEvent: (event) => seen.push(event),
      response: responseOf('{"type":"start"\n'),
    });
    assert.deepEqual(result, { ok: false, reason: "malformed_line" });
    assert.equal(seen.length, 0);
  });

  it("rejects a truncated stream", async () => {
    const result = await consumeNdjsonResponse({
      onEvent: () => null,
      response: responseOf('{"type":"start"'),
    });
    assert.deepEqual(result, { ok: false, reason: "truncated_stream" });
  });

  it("rejects an oversized line", async () => {
    const line = `${"x".repeat(NDJSON_MAX_LINE_BYTES + 1)}\n`;
    const result = await consumeNdjsonResponse({
      onEvent: () => null,
      response: responseOf(line),
    });
    assert.deepEqual(result, { ok: false, reason: "oversized_line" });
  });

  it("rejects an oversized response", async () => {
    const line = `${JSON.stringify({
      requestId: "stream-1",
      sequence: 0,
      type: "start",
    })}\n`;
    const copies = Math.ceil((NDJSON_MAX_RESPONSE_BYTES + 1) / line.length);
    const bytes = new TextEncoder().encode(line.repeat(copies));
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
    );
    const result = await consumeNdjsonResponse({
      onEvent: () => null,
      response,
    });
    assert.deepEqual(result, { ok: false, reason: "oversized_response" });
  });

  it("rejects too many events", async () => {
    const events = Array.from({ length: NDJSON_MAX_EVENTS + 1 }, (_, index) => ({
      requestId: "stream-1",
      sequence: index,
      type: "start",
    }));
    const result = await consumeNdjsonResponse({
      onEvent: () => null,
      response: responseOf(encode(events)),
    });
    assert.deepEqual(result, { ok: false, reason: "too_many_events" });
  });

  it("rejects an unknown event", async () => {
    const result = await consumeNdjsonResponse({
      onEvent: () => null,
      response: responseOf(
        `${JSON.stringify({ requestId: "stream-1", sequence: 0, type: "nope" })}\n`,
      ),
    });
    assert.deepEqual(result, { ok: false, reason: "invalid_event" });
  });

  it("rejects the wrong library version", async () => {
    const events = await validEvents();
    const complete = events.find((event) => event.type === "complete");
    assert.ok(complete && complete.type === "complete");
    const result = await consumeNdjsonResponse({
      onEvent: () => null,
      response: responseOf(
        encode([
          {
            ...complete,
            envelope: { ...complete.envelope, libraryVersion: 2 },
            type: "partial",
          },
        ]),
      ),
    });
    assert.deepEqual(result, { ok: false, reason: "invalid_event" });
  });

  it("rejects an invalid component", async () => {
    const events = await validEvents();
    const complete = events.find((event) => event.type === "complete");
    assert.ok(complete && complete.type === "complete");
    const envelope: CompositionEnvelope = {
      ...complete.envelope,
      openuiText: "root = NotARealComponent()",
    };
    const result = await consumeNdjsonResponse({
      onEvent: () => null,
      response: responseOf(encode([{ ...complete, envelope }])),
    });
    assert.deepEqual(result, { ok: false, reason: "invalid_event" });
  });

  it("rejects an invalid record reference", async () => {
    const events = await validEvents();
    const complete = events.find((event) => event.type === "complete");
    assert.ok(complete && complete.type === "complete");
    const envelope: CompositionEnvelope = {
      ...complete.envelope,
      openuiText: complete.envelope.openuiText.replace("entity:orbit-plan", "entity:missing"),
    };
    const result = await consumeNdjsonResponse({
      onEvent: () => null,
      response: responseOf(encode([{ ...complete, envelope }])),
    });
    assert.deepEqual(result, { ok: false, reason: "invalid_event" });
  });
});
