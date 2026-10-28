import assert from "node:assert/strict";
import { test } from "vitest";

import { POST as postSession } from "../../app/api/operator/session/route";

test("operator session POST fails closed without OPERATOR_SECRET", async () => {
  const previous = process.env.OPERATOR_SECRET;
  delete process.env.OPERATOR_SECRET;
  delete process.env.OPERATOR_ACCESS_TOKEN;
  try {
    const response = await postSession(
      new Request("http://meta-cto.localhost/api/operator/session", {
        body: JSON.stringify({ token: "anything" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }),
    );
    assert.equal(response.status, 503);
  } finally {
    if (previous !== undefined) process.env.OPERATOR_SECRET = previous;
  }
});
