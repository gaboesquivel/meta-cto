import { cn } from "cn";

import type { BarVerdict, ProofBar, ProofReport } from "@/lib/signal/proof/report";

import { countsLine, intervalLine, percent, VERDICT_TEXT } from "./proof-view";

const VERDICT_STYLE: Record<BarVerdict, string> = {
  fail: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  inconclusive: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  pass: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
};

const VERDICT_MARK: Record<BarVerdict, string> = { fail: "✕", inconclusive: "?", pass: "✓" };

/** Verdict badge: the word carries the meaning; color and mark only reinforce it. */
export const VerdictBadge = ({ verdict }: { verdict: BarVerdict }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tracking-wide uppercase",
      VERDICT_STYLE[verdict],
    )}
  >
    <span aria-hidden="true">{VERDICT_MARK[verdict]}</span>
    {VERDICT_TEXT[verdict]}
  </span>
);

const Muted = ({ children }: { children: React.ReactNode }) => (
  <p className="text-muted-foreground text-xs">{children}</p>
);

const BarCard = ({ bar }: { bar: ProofBar }) => (
  <article className="bg-card flex flex-col gap-3 rounded-2xl border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{bar.label}</h3>
      <VerdictBadge verdict={bar.verdict} />
    </div>
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="flex flex-col">
        <span className="text-3xl font-semibold tabular-nums">{percent(bar.value)}</span>
        <span className="text-muted-foreground text-xs">{intervalLine(bar.interval)}</span>
      </div>
      {bar.baseline ? (
        <div className="flex flex-col border-l pl-4">
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Backlog baseline
          </span>
          <span className="text-2xl font-semibold tabular-nums">{percent(bar.baseline.rate)}</span>
          <span className="text-muted-foreground text-xs">
            {bar.baseline.duplicates} of {bar.baseline.reviewed} reviewed ·{" "}
            {intervalLine(bar.baseline.interval)}
          </span>
        </div>
      ) : null}
    </div>
    <div className="flex flex-col gap-1">
      <p className="text-sm">
        Bar: {bar.bar}
        {bar.key === "intakeDuplicateRate" && bar.threshold !== null
          ? ` (${percent(bar.threshold)})`
          : ""}
      </p>
      <Muted>{countsLine(bar)}</Muted>
      {bar.baseline ? (
        <Muted>
          Backlog review coverage {percent(bar.baseline.coverage)}
          {bar.baseline.backlogRequests === null
            ? ""
            : ` of ${bar.baseline.backlogRequests} backlog Feature Requests`}
          ; expected backlog duplicate rate stated before the run:{" "}
          {percent(bar.baseline.expectedRate)}.
        </Muted>
      ) : null}
      {bar.reading ? (
        <Muted>
          Reading of {bar.reading.at} on prompt version {bar.reading.promptVersion}
          {bar.reading.current ? " (current)" : " (not the current prompt version)"}.
        </Muted>
      ) : null}
    </div>
    {bar.reasons.length > 0 ? (
      <ul className="text-muted-foreground list-disc pl-5 text-xs">
        {bar.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    ) : null}
    {bar.consequence ? (
      <p className="rounded-lg bg-red-50 p-2 text-sm font-medium text-red-900 dark:bg-red-950/50 dark:text-red-200">
        {bar.consequence}
      </p>
    ) : null}
  </article>
);

const Fact = ({ label, value, note }: { label: string; note?: string; value: string }) => (
  <div className="flex flex-col gap-0.5 rounded-xl border p-3">
    <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
      {label}
    </span>
    <span className="text-xl font-semibold tabular-nums">{value}</span>
    {note ? <span className="text-muted-foreground text-xs">{note}</span> : null}
  </div>
);

const yesNo = (value: boolean) => (value ? "Yes" : "No");

const Supporting = ({ supporting }: { supporting: ProofReport["supporting"] }) => {
  const agent = supporting.agentCorrectness;
  const pm = supporting.pmAgreement;
  const acceptance = supporting.suggestionAcceptance;
  return (
    <section aria-labelledby="supporting-heading" className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold" id="supporting-heading">
          Supporting metrics
        </h2>
        <Muted>No bar: these explain the result, they do not decide it.</Muted>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Fact
          label="Agent Correctness"
          note={
            agent
              ? `${agent.correct} of ${agent.scored} scored · harm ${agent.harm} · miss ${agent.miss} · ${intervalLine(agent.interval)}`
              : "Unavailable"
          }
          value={percent(agent?.rate ?? null)}
        />
        <Fact
          label="Product Manager agreement, Blind Review"
          note={
            pm
              ? `${pm.blind.agree} agree · ${pm.blind.disagree} disagree · ${intervalLine(pm.blind.interval)}`
              : "Unavailable"
          }
          value={percent(pm?.blind.rate ?? null)}
        />
        <Fact
          label="Product Manager agreement, not blind"
          note={
            pm
              ? `${pm.nonBlind.agree} agree · ${pm.nonBlind.disagree} disagree · ${intervalLine(pm.nonBlind.interval)}`
              : "Unavailable"
          }
          value={percent(pm?.nonBlind.rate ?? null)}
        />
        <Fact
          label="Suggestion Acceptance (reported, not evidence)"
          note={acceptance ? acceptance.note : "Unavailable"}
          value={percent(acceptance?.rate ?? null)}
        />
      </div>
      {supporting.notes.map((note) => (
        <Muted key={note}>{note}</Muted>
      ))}
    </section>
  );
};

const Readiness = ({ readiness }: { readiness: ProofReport["readiness"] }) => {
  const { heldOutV2: v2, pilotFiles: files } = readiness;
  return (
    <section aria-labelledby="readiness-heading" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold" id="readiness-heading">
        Readiness
      </h2>
      {readiness.readingResets.length > 0 ? (
        <ul className="rounded-lg bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
          {readiness.readingResets.map((reset) => (
            <li key={reset}>{reset}</li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 rounded-xl border p-3 text-sm">
          <h3 className="font-semibold">Pilot files and Answer Key</h3>
          {files.readable ? (
            <>
              <span>
                Frozen: {yesNo(files.frozen)} · Changed after freeze: {yesNo(files.changed)}
              </span>
              <span>Unconfirmed Answer Key entries: {files.unconfirmed}</span>
              <Muted>
                {files.backlogRequests} backlog Feature Requests · {files.feedback} feedback items
              </Muted>
            </>
          ) : (
            <span>Could not be read: {files.message}</span>
          )}
        </div>
        <div className="flex flex-col gap-1 rounded-xl border p-3 text-sm">
          <h3 className="font-semibold">Held-Out Set v2</h3>
          {v2.readable ? (
            <>
              <span>
                Frozen: {yesNo(v2.frozen)} · Changed after freeze: {yesNo(v2.changed)}
              </span>
              <span>Unconfirmed pairs: {v2.unconfirmed}</span>
              <Muted>
                {v2.pairs} pairs · {v2.sameNeedPositives} same-need positives
              </Muted>
            </>
          ) : (
            <span>Could not be read: {v2.message}</span>
          )}
        </div>
      </div>
      <Muted>
        Prompt version: current {readiness.promptVersion.current ?? "unknown"}; reading{" "}
        {readiness.promptVersion.reading ?? "none"}.
      </Muted>
    </section>
  );
};

/** The Proof Report: overall verdict and consequences, each bar, supporting metrics, readiness. */
export const ProofReportView = ({ report }: { report: ProofReport }) => (
  <div className="flex flex-col gap-8">
    <section
      aria-labelledby="verdict-heading"
      className="flex flex-col gap-3 rounded-2xl border p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold" id="verdict-heading">
          Overall
        </h2>
        <VerdictBadge verdict={report.verdict} />
        <span className="text-sm font-medium">
          {report.slice3 === "may_start" ? "Slice 3 may start" : "Slice 3: not yet"}
        </span>
      </div>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        {report.consequences.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <Muted>Generated {report.generatedAt}.</Muted>
    </section>
    <section aria-labelledby="bars-heading" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold" id="bars-heading">
        Preset bars
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {report.bars.map((bar) => (
          <BarCard bar={bar} key={bar.key} />
        ))}
      </div>
    </section>
    <Supporting supporting={report.supporting} />
    <Readiness readiness={report.readiness} />
  </div>
);
