import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { acmeCatalogRecords } from "../fixtures/acme-catalog";
import { compileExperience } from "./compiler";

describe("compileExperience", () => {
  it("accepts a grounded Answer document", () => {
    const result = compileExperience({
      document: 'root = Answer("Hello", ["document:api-overview"])',
      libraryVersion: 1,
      records: acmeCatalogRecords,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.component, "Answer");
    }
  });

  it("rejects unauthorized executable statements", () => {
    const result = compileExperience({
      document: 'query x = fetch("http://evil.test")',
      libraryVersion: 1,
      records: acmeCatalogRecords,
    });
    assert.equal(result.ok, false);
  });

  it("rejects comparison with one entity", () => {
    const result = compileExperience({
      document: 'root = ComparisonView("side-by-side", ["entity:orbit-plan"])',
      libraryVersion: 1,
      records: acmeCatalogRecords,
    });
    assert.equal(result.ok, false);
  });

  it("accepts SearchResults with grounded entities", () => {
    const result = compileExperience({
      document: 'root = SearchResults("results-with-filters", ["entity:orbit-plan"], "orbit")',
      libraryVersion: 1,
      records: acmeCatalogRecords,
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.component, "SearchResults");
  });

  it("accepts SectionStack with supported child components", () => {
    const result = compileExperience({
      document:
        'root = SectionStack([Answer("Stacked", []), CollectionGrid("grid-cards", ["entity:orbit-plan"])])',
      libraryVersion: 1,
      records: acmeCatalogRecords,
    });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.component, "SectionStack");
  });
});
