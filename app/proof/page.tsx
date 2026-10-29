import type { Metadata } from "next";

import { OperatorSignIn } from "@/components/signal/operator-sign-in";
import { ProofReportView } from "@/components/signal/proof-report";
import { SignalHeader } from "@/components/signal/signal-header";
import { hasOperatorSession } from "@/lib/auth/operator-page-access";
import { getProofReport } from "@/lib/signal/proof/sources";

export const metadata: Metadata = {
  description:
    "Proof Report: each preset bar of the proof run with its value, counts, 95% interval and pass, fail or inconclusive.",
  title: "Proof Report · Signal",
};

export default async function ProofPage() {
  const operator = await hasOperatorSession();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8">
      <SignalHeader />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Proof Report</h1>
        <p className="text-muted-foreground text-sm">
          Does the check before create prevent duplicates? Every bar was set before the proof run. A
          bar passes only when its whole 95% interval clears it and its minimums are met; when the
          evidence is short or the interval straddles the bar, it is inconclusive.
        </p>
      </div>
      {operator ? (
        <ProofReportView report={await getProofReport()} />
      ) : (
        <OperatorSignIn
          next="/proof"
          note="The Proof Report needs Operator access here; agents read it over REST or MCP with the Pilot Key."
        />
      )}
    </main>
  );
}
