import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { validateCompositionEnvelope } from "../contract/compiler";
import { composeQuery, publishComposition } from "./compose";
import { defaultEntityIds } from "./routing";

describe("composeQuery", () => {
  it("routes compare plans to tier 1", async () => {
    const result = await composeQuery({
      input: {
        clientRequestId: "t1",
        query: "Compare Orbit plan versus Nova plan",
        version: 1,
      },
    });
    assert.equal(result.metadata.tier, 1);
    assert.equal(result.metadata.validationOk, true);
    assert.equal(result.metadata.outcome, "success");
    assert.equal(result.metadata.component, "ComparisonView");
    assert.deepEqual(
      result.events.map((event) => event.type),
      ["start", "partial", "complete"],
    );
    const partial = result.events.find((event) => event.type === "partial");
    assert.ok(partial && partial.type === "partial");
    assert.equal(validateCompositionEnvelope({ envelope: partial.envelope }).ok, true);
  });

  it("does not emit a renderable event when validation fails", () => {
    const events: { type: string }[] = [];
    const result = publishComposition({
      emit: (event) => events.push(event),
      envelope: {
        fallbackText: "Unavailable.",
        libraryVersion: 1,
        openuiText: "root = NotARealComponent()",
        records: [],
        requestId: "bad",
      },
      requestId: "bad",
      sequence: 1,
    });
    assert.equal(result.ok, false);
    assert.deepEqual(
      events.map((event) => event.type),
      ["error"],
    );
  });

  it("does not treat workflow plan wording as an Acme plan comparison", async () => {
    const result = await composeQuery({
      input: {
        clientRequestId: "flow-plan",
        query: "Show the Flow workflow: Explore, Specify, Plan, Build, Review, Ship",
        version: 1,
      },
    });
    const complete = result.events.find((event) => event.type === "complete");
    assert.ok(complete && complete.type === "complete");
    assert.equal(complete.envelope.openuiText.includes("entity:orbit-plan"), false);
    assert.equal(complete.envelope.openuiText.includes("ComparisonView"), false);
  });

  it("composes tier 2 stack for compound prompts", async () => {
    const result = await composeQuery({
      input: {
        clientRequestId: "t2",
        query: "Explain the API and show revenue metrics",
        version: 1,
      },
    });
    assert.equal(result.metadata.tier, 2);
    assert.equal(result.metadata.validationOk, true);
  });

  it("returns the mobile entity for mobile search", async () => {
    const result = await composeQuery({
      input: {
        clientRequestId: "search-mobile",
        query: "search mobile products",
        version: 1,
      },
    });

    const complete = result.events.find((event) => event.type === "complete");

    assert.ok(complete && complete.type === "complete");
    assert.equal(result.metadata.tier, 1);
    assert.equal(result.metadata.validationOk, true);
    assert.match(complete.envelope.openuiText, /entity:pulse-mobile/u);
  });

  it("returns the default catalog entities for non-mobile search", async () => {
    const result = await composeQuery({
      input: {
        clientRequestId: "search-general",
        query: "search products",
        version: 1,
      },
    });

    const complete = result.events.find((event) => event.type === "complete");

    assert.ok(complete && complete.type === "complete");
    assert.equal(result.metadata.tier, 1);
    assert.equal(result.metadata.validationOk, true);

    const text = complete.envelope.openuiText;
    const expected = defaultEntityIds().slice(0, 2);

    for (const id of expected) {
      assert.ok(text.includes(id));
    }

    assert.ok(!text.includes("entity:pulse-mobile"));
  });

  it("surfaces tier 3 missing credentials as StatusMessage failure", async () => {
    const previous = process.env.AI_GATEWAY_API_KEY;

    process.env.AI_GATEWAY_API_KEY = "";

    try {
      const result = await composeQuery({
        input: {
          clientRequestId: "general-uncited",
          query: "Design a completely novel interface",
          version: 1,
        },
      });

      const complete = result.events.find((event) => event.type === "complete");

      assert.ok(complete && complete.type === "complete");
      assert.equal(result.metadata.tier, 3);
      assert.equal(result.metadata.validationOk, true);
      assert.equal(result.metadata.outcome, "failed");
      assert.equal(result.metadata.failureCode, "missing_credentials");
      assert.equal(result.modelCalls, 0);
      assert.match(complete.envelope.openuiText, /StatusMessage/u);
      assert.match(complete.envelope.openuiText, /"error"/u);
    } finally {
      if (previous === undefined) {
        delete process.env.AI_GATEWAY_API_KEY;
      } else {
        process.env.AI_GATEWAY_API_KEY = previous;
      }
    }
  });

  it("reports unsupported catalog requests as failed outcomes", async () => {
    const result = await composeQuery({
      input: {
        clientRequestId: "unsupported",
        query: "This request is unsupported",
        version: 1,
      },
    });

    const complete = result.events.find((event) => event.type === "complete");

    assert.ok(complete && complete.type === "complete");
    assert.equal(result.metadata.outcome, "failed");
    assert.equal(result.metadata.failureCode, "unsupported_request");
    assert.match(complete.envelope.openuiText, /StatusMessage/u);
  });

  it("routes onboarding form prompts to tier 1 InteractiveForm stack", async () => {
    const result = await composeQuery({
      input: {
        clientRequestId: "onboarding",
        query: "Design an onboarding form for new users",
        version: 1,
      },
    });

    const complete = result.events.find((event) => event.type === "complete");

    assert.ok(complete && complete.type === "complete");
    assert.equal(result.metadata.tier, 1);
    assert.equal(result.metadata.outcome, "success");
    assert.match(complete.envelope.openuiText, /InteractiveForm/u);
    assert.match(complete.envelope.openuiText, /form:onboarding/u);
  });
});
