import { describe, expect, it } from "vitest";

import type { ProofBar } from "@/lib/signal/proof/report";

import { countsLine, intervalLine, VERDICT_TEXT } from "./proof-view";

const bar = (overrides: Partial<ProofBar>): ProofBar => ({
  bar: "",
  baseline: null,
  consequence: null,
  counts: {},
  interval: null,
  key: "intakeDuplicateRate",
  label: "",
  reading: null,
  reasons: [],
  threshold: null,
  value: null,
  verdict: "inconclusive",
  ...overrides,
});

describe("proof view helpers", () => {
  it("says each verdict in words, not color alone", () => {
    expect(VERDICT_TEXT).toEqual({ fail: "Fail", inconclusive: "Inconclusive", pass: "Pass" });
  });

  it("states counts per bar", () => {
    expect(countsLine(bar({ counts: { duplicates: 8, filings: 220, reviewed: 160 } }))).toBe(
      "8 of 160 reviewed new Feature Requests confirmed Duplicate · 220 filings",
    );
    expect(
      countsLine(
        bar({ counts: { filings: 220, reviewed: 160, total: 180 }, key: "reviewCoverage" }),
      ),
    ).toBe("160 of 180 new Feature Requests reviewed · 220 filings");
    expect(
      countsLine(
        bar({
          counts: { predicted: 100, sameNeedPositives: 70, truePositives: 97 },
          key: "sameNeedPrecision",
        }),
      ),
    ).toBe("97 of 100 Same Need labels confirmed by the set · 70 same-need positives");
    expect(countsLine(bar({}))).toBe("No counts yet");
  });

  it("states the 95% interval or that there is none", () => {
    expect(intervalLine({ lower: 0.915, upper: 0.99 })).toBe("95% interval 91.5%–99%");
    expect(intervalLine(null)).toBe("No interval yet");
  });
});
