import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "vitest";

import { seedFeatureRequests } from "@/data/crewday/seed";
import type { CheckResult, Verdict } from "@/lib/signal/contracts";

import { freezeV2, V2_SET_FILE, writeV2Lock } from "./held-out-v2";
import type { HeldOutV2Pair } from "./held-out-v2";
import { readRunLog } from "./run-log";
import { runEval } from "./runner";
import type { EvalService } from "./runner";
import { loadEvalSet } from "./sets";

const PROMPT = { id: "pv-000000000001", model: "test/judge" };
const NOW = new Date("2026-11-01T12:00:00.000Z");
const seedKeys = new Set(seedFeatureRequests.map((fr) => fr.key));
const [first, second] = seedFeatureRequests;
assert.ok(first && second);

/** Seeded titles resolve to their key as id; each draft title maps to a verdict for its target. */
const mockService = (
  verdicts: Map<string, Verdict | "absent" | "throw" | "degraded">,
): EvalService & {
  checks: number;
} => {
  const service = {
    check: ({ draft }: { draft: { title: string } }): Promise<CheckResult> => {
      service.checks += 1;
      const pair = [...verdicts.entries()].find(([title]) => title === draft.title);
      const outcome = pair?.[1] ?? "absent";
      if (outcome === "throw") return Promise.reject(new Error("database unavailable"));
      const target = draft.title.split("|")[0] ?? "";
      const verdictFor: Record<typeof outcome, Verdict> = {
        absent: "different",
        degraded: "unknown",
        different: "different",
        related_need: "related_need",
        same_need: "same_need",
        unknown: "unknown",
      };
      const verdict = verdictFor[outcome];
      return Promise.resolve({
        candidates:
          outcome === "absent"
            ? []
            : [
                {
                  featureRequestId: target,
                  reason: "because",
                  sharedDimension: null,
                  title: "t",
                  verdict,
                },
              ],
        checkId: "00000000-0000-0000-0000-000000000000",
        consideredCount: 1,
        degraded: outcome === "degraded",
        expiresAt: NOW.toISOString(),
        nextAction: "create",
        underlyingNeed: null,
      });
    },
    checks: 0,
    search: ({ q }: { q?: string }) => {
      const seed = seedFeatureRequests.find((fr) => fr.title === q);
      return Promise.resolve({
        items: seed
          ? [
              {
                accountCount: 0,
                createdAt: NOW.toISOString(),
                description: seed.description,
                id: seed.key,
                supportCount: 0,
                title: seed.title,
                underlyingNeed: null,
              },
            ]
          : [],
        nextCursor: null,
      });
    },
  };
  return service;
};

const v2Pair = (
  i: number,
  expected: HeldOutV2Pair["expected"],
  target = first.key,
): HeldOutV2Pair => ({
  confirmedAt: "2026-10-30",
  confirmedBy: "Product Manager",
  draft: { description: "d", title: `${target}|${i}` },
  expected,
  id: `v2-${String(i).padStart(3, "0")}`,
  note: "label reason",
  target,
});

/** A temp dir holding a v2 set (frozen unless told otherwise). */
const v2Dir = (pairs: HeldOutV2Pair[], options: { frozen?: boolean } = {}) => {
  const dir = mkdtempSync(path.join(tmpdir(), "v2-run-"));
  writeFileSync(path.join(dir, V2_SET_FILE), JSON.stringify(pairs, null, 2));
  if (options.frozen !== false) {
    const result = freezeV2({ devTitles: new Set(), lock: null, now: NOW, pairs, seedKeys });
    assert.ok(result.ok);
    writeV2Lock(result.lock, dir);
  }
  return dir;
};

const run = (
  dir: string,
  service: EvalService | null,
  set: "held-out-v2" | "held-out" = "held-out-v2",
) =>
  runEval({ dir, getService: () => Promise.resolve(service), now: () => NOW, prompt: PROMPT, set });

/** 70 same-need positives all predicted same_need, plus related and different pairs. */
const fullSet = () => {
  const pairs: HeldOutV2Pair[] = [];
  const verdicts = new Map<string, Verdict | "absent">();
  for (let i = 0; i < 70; i += 1) {
    const p = v2Pair(i, "same_need");
    pairs.push(p);
    verdicts.set(p.draft.title, "same_need");
  }
  for (let i = 70; i < 80; i += 1) {
    const p = v2Pair(i, "related_need", second.key);
    pairs.push(p);
    verdicts.set(p.draft.title, i < 78 ? "related_need" : "same_need");
  }
  for (let i = 80; i < 85; i += 1) {
    const p = v2Pair(i, "different", second.key);
    pairs.push(p);
    verdicts.set(p.draft.title, "absent");
  }
  return { pairs, verdicts };
};

describe("runEval on Held-Out Set v2", () => {
  test("refuses the shipped empty template without touching the service", async () => {
    const dir = v2Dir([], { frozen: false });
    const service = mockService(new Map());
    const outcome = await run(dir, service);
    assert.equal(outcome.status, "refused");
    assert.equal(service.checks, 0);
    assert.equal(readRunLog(dir)[0]?.status, "refused");
  });

  test("refuses unconfirmed pairs", async () => {
    const dir = v2Dir([{ ...v2Pair(1, "same_need"), confirmedBy: null }], { frozen: false });
    const outcome = await run(dir, mockService(new Map()));
    assert.equal(outcome.status, "refused");
    assert.match(outcome.message, /unconfirmed/u);
  });

  test("refuses a set that is not frozen", async () => {
    const dir = v2Dir([v2Pair(1, "same_need")], { frozen: false });
    const outcome = await run(dir, mockService(new Map()));
    assert.match(outcome.message, /not frozen/u);
  });

  test("refuses a set changed after freeze, logs it and says the reading reset", async () => {
    const pairs = [v2Pair(1, "same_need")];
    const dir = v2Dir(pairs);
    writeFileSync(
      path.join(dir, V2_SET_FILE),
      JSON.stringify([{ ...pairs[0], expected: "different" }]),
    );
    const service = mockService(new Map());
    const outcome = await run(dir, service);
    assert.equal(outcome.status, "refused");
    assert.match(outcome.message, /changed after freeze: reading reset/u);
    assert.equal(service.checks, 0);
    const [entry] = readRunLog(dir);
    assert.equal(entry?.status, "refused");
    assert.match(entry?.message ?? "", /reading reset/u);
  });

  test("reads precision with intervals, logs the run and writes the v2 report", async () => {
    const { pairs, verdicts } = fullSet();
    const dir = v2Dir(pairs);
    const outcome = await run(dir, mockService(verdicts));
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.entry.repeat, false);
    const { readings } = outcome.entry;
    assert.ok(readings);
    assert.equal(readings.sameNeedPositives, 70);
    assert.equal(readings.enoughPositives, true);
    assert.equal(readings.sameNeed.truePositives, 70);
    assert.equal(readings.sameNeed.predicted, 72);
    assert.ok(readings.sameNeed.interval && readings.sameNeed.interval.lower < 0.97);
    assert.equal(readings.relatedNeed.truePositives, 8);
    assert.equal(readings.relatedNeed.predicted, 8);

    const [entry] = readRunLog(dir);
    assert.equal(entry?.promptVersion, PROMPT.id);
    assert.equal(entry?.model, PROMPT.model);
    assert.equal(entry?.at, NOW.toISOString());
    assert.match(entry?.fingerprint ?? "", /^sha256:/u);
    assert.equal(entry?.counts.pairs, 85);
    assert.equal(entry?.results.length, 85);

    const report = readFileSync(path.join(dir, "report.v2.md"), "utf-8");
    assert.match(report, /Prompt version: pv-000000000001/u);
    assert.match(
      report,
      /Same-Need Precision: 97\.2% \(95% CI \d+\.\d%–\d+\.\d%\), 70\/72 predicted same_need/u,
    );
    assert.match(report, /Same-need positives: 70 \(minimum 60: met\)/u);
    assert.match(report, /Related-Need Precision: 100\.0%/u);
  });

  test("flags a second run on the same prompt version as a repeat, not a new reading", async () => {
    const { pairs, verdicts } = fullSet();
    const dir = v2Dir(pairs);
    await run(dir, mockService(verdicts));
    const firstReport = readFileSync(path.join(dir, "report.v2.md"), "utf-8");
    const again = await run(dir, mockService(verdicts));
    assert.equal(again.status, "completed");
    assert.equal(again.entry.repeat, true);
    assert.equal(readRunLog(dir).length, 2);
    assert.equal(readFileSync(path.join(dir, "report.v2.md"), "utf-8"), firstReport);
    assert.match(
      readFileSync(path.join(dir, "report.v2.repeat.md"), "utf-8"),
      /repeat run, not a new reading/iu,
    );
    const newPrompt = await runEval({
      dir,
      getService: () => Promise.resolve(mockService(verdicts)),
      now: () => NOW,
      prompt: { ...PROMPT, id: "pv-000000000002" },
      set: "held-out-v2",
    });
    assert.equal(newPrompt.entry.repeat, false);
  });

  test("marks the reading inconclusive below 60 same-need positives", async () => {
    const pairs = [v2Pair(1, "same_need"), v2Pair(2, "same_need")];
    const dir = v2Dir(pairs);
    const verdicts = new Map(pairs.map((p) => [p.draft.title, "same_need" as const]));
    const outcome = await run(dir, mockService(verdicts));
    assert.equal(outcome.entry.readings?.sameNeed.verdict, "inconclusive");
    assert.match(readFileSync(path.join(dir, "report.v2.md"), "utf-8"), /minimum 60: NOT met/u);
  });

  test("logs failed pairs and degraded Checks; the run is failed and inconclusive", async () => {
    const { pairs, verdicts } = fullSet();
    const withDegraded = new Map<string, Verdict | "absent" | "throw" | "degraded">([
      ...verdicts,
      [pairs[0]?.draft.title ?? "", "throw"],
      [pairs[1]?.draft.title ?? "", "degraded"],
    ]);
    const dir = v2Dir(pairs);
    const outcome = await run(dir, mockService(withDegraded));
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.entry.failures.length, 2);
    assert.match(outcome.entry.failures[0]?.error ?? "", /database unavailable/u);
    assert.equal(outcome.entry.readings?.sameNeed.verdict, "inconclusive");
    assert.equal(readRunLog(dir)[0]?.status, "failed");
  });

  test("logs a failed run when the service is unavailable", async () => {
    const dir = v2Dir([v2Pair(1, "same_need")]);
    const outcome = await run(dir, null);
    assert.equal(outcome.status, "failed");
    assert.equal(readRunLog(dir)[0]?.status, "failed");
  });
});

describe("runEval on v1", () => {
  test("runs the frozen v1 set as before and writes report.md", async () => {
    const heldOut = loadEvalSet("held-out");
    const dir = mkdtempSync(path.join(tmpdir(), "v1-run-"));
    // v1 drafts are shared across targets (must-pass pairs), so answer every pair with the title.
    const service = mockService(new Map());
    service.check = ({ draft }) =>
      Promise.resolve({
        candidates: heldOut
          .filter((p) => p.draft.title === draft.title && p.expected !== "different")
          .map((p) => ({
            featureRequestId: p.target,
            reason: "r",
            sharedDimension: null,
            title: "t",
            verdict: p.expected,
          })),
        checkId: "00000000-0000-0000-0000-000000000000",
        consideredCount: 1,
        degraded: false,
        expiresAt: NOW.toISOString(),
        nextAction: "create",
        underlyingNeed: null,
      });
    const outcome = await run(dir, service, "held-out");
    assert.equal(outcome.status, "completed");
    assert.equal(outcome.entry.repeat, false);
    const report = readFileSync(path.join(dir, "report.md"), "utf-8");
    assert.match(report, /^# Signal verdict eval: held-out\n/u);
    assert.match(report, /- Pairs: 25 \(correct 25, absent \d+, unknown 0\)/u);
    assert.match(report, /Same-Need Precision: 100\.0%/u);
    assert.match(report, /About 25 pairs is a first reading, not a verdict\./u);
    assert.ok(!existsSync(path.join(dir, "report.v2.md")));
    assert.equal(readRunLog(dir)[0]?.set, "held-out");
  });
});
