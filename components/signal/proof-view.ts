import type { BarVerdict, Interval, ProofBar } from "@/lib/signal/proof/report";

/** Pure view helpers for the Proof Report page (spec 003). */

export const VERDICT_TEXT: Record<BarVerdict, string> = {
  fail: "Fail",
  inconclusive: "Inconclusive",
  pass: "Pass",
};

/** A rate as a percent with at most one decimal; "—" when there is none. */
export const percent = (value: number | null): string =>
  value === null || !Number.isFinite(value) ? "—" : `${Number((value * 100).toFixed(1))}%`;

export const intervalLine = (interval: Interval | null): string =>
  interval
    ? `95% interval ${percent(interval.lower)}–${percent(interval.upper)}`
    : "No interval yet";

export const countsLine = (bar: ProofBar): string => {
  const c = bar.counts;
  if (Object.keys(c).length === 0) return "No counts yet";
  if (bar.key === "intakeDuplicateRate")
    return `${c.duplicates} of ${c.reviewed} reviewed new Feature Requests confirmed Duplicate · ${c.filings} filings`;
  if (bar.key === "reviewCoverage")
    return `${c.reviewed} of ${c.total} new Feature Requests reviewed · ${c.filings} filings`;
  const label = bar.key === "sameNeedPrecision" ? "Same Need" : "Related Need";
  return `${c.truePositives} of ${c.predicted} ${label} labels confirmed by the set · ${c.sameNeedPositives} same-need positives`;
};
