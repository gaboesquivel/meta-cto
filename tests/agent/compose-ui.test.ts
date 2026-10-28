import assert from "node:assert/strict";
import { test } from "vitest";

import type { ToolContext } from "eve/tools";

import composeUi from "../../lib/agent-tools/compose-ui";

test("compose-ui execute returns support dashboard envelope", async () => {
  const result = await composeUi.execute(
    {
      mode: "create",
      query: "Generate a customer support dashboard",
    },
    {} as ToolContext,
  );

  if (!("envelope" in result) || !result.envelope) {
    assert.fail("expected successful composition");
  }
  const { envelope, metadata } = result;
  assert.equal(metadata?.outcome, "success");
  assert.match(envelope.openuiText, /SectionStack/u);
  assert.match(envelope.openuiText, /metrics-dashboard/u);
  assert.match(envelope.openuiText, /list-compact/u);
});
