import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { flowGenuiContractLibrary } from "../contract/library";
import { flowGenuiReactLibrary } from "../react/library";
import { componentNames } from "./components";
import { namesFromOpenUiLibrary } from "./library-names";

describe("GenUI library parity", () => {
  it("contract and registry expose the same component names", () => {
    const contractNames = namesFromOpenUiLibrary(flowGenuiContractLibrary);
    assert.deepEqual(contractNames, [...componentNames].toSorted());
  });

  it("react library registers every contract component", () => {
    const contractNames = namesFromOpenUiLibrary(flowGenuiContractLibrary);
    const reactNames = new Set(namesFromOpenUiLibrary(flowGenuiReactLibrary));
    for (const name of contractNames) {
      assert.equal(reactNames.has(name), true, `missing react renderer: ${name}`);
    }
  });
});
