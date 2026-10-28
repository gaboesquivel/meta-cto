import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { consumeNdjsonResponse } from "@/lib/genui";
import type { ComposeStreamEvent } from "@/lib/genui";

describe("POST /api/genui/compose", () => {
  it("rejects invalid body with 400", async () => {
    const { POST } = await import("../app/api/genui/compose/route");
    const response = await POST(
      new Request("http://localhost/api/genui/compose", {
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
    assert.equal(response.status, 400);
  });

  it("streams NDJSON for support dashboard query without database", async () => {
    const { POST } = await import("../app/api/genui/compose/route");
    const response = await POST(
      new Request("http://localhost/api/genui/compose", {
        body: JSON.stringify({
          clientRequestId: "route-test-1",
          query: "customer support dashboard",
          version: 1,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
    assert.equal(response.status, 200);

    const events: ComposeStreamEvent[] = [];
    const result = await consumeNdjsonResponse({
      onEvent: (event) => {
        events.push(event);
      },
      response,
    });

    assert.equal(result.ok, true);
    const complete = events.find(
      (event): event is Extract<ComposeStreamEvent, { type: "complete" }> =>
        event.type === "complete",
    );
    assert.ok(complete);
    assert.equal(complete.metadata?.outcome, "success");
    assert.match(complete.envelope.openuiText, /SectionStack/u);
  });
});
