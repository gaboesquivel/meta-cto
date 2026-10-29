import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { safeNext } from "./safe-next";

const origin = "https://meta-cto-app.vercel.app";

describe("safeNext", () => {
  it("keeps same-site paths with query and hash", () => {
    assert.equal(safeNext("?next=/review", origin), "/review");
    assert.equal(safeNext("?next=/requests/abc%3Fx%3D1", origin), "/requests/abc?x=1");
  });

  it("falls back to the console for missing or off-site targets", () => {
    for (const search of [
      "",
      "?next=",
      "?next=review",
      "?next=//evil.com",
      "?next=/%5Cevil.com",
      "?next=/%09/evil.com",
      "?next=%2F%2Fevil.com",
      "?next=https://evil.com",
      "?next=/%0A/evil.com",
      "?next=javascript:alert(1)",
    ]) {
      assert.equal(safeNext(search, origin), "/operator", search);
    }
  });
});
