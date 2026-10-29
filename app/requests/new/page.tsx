import type { Metadata } from "next";

import { CheckFlow } from "@/components/signal/check-flow";
import { SignalHeader } from "@/components/signal/signal-header";

export const metadata: Metadata = {
  description: "Draft a Feature Request and Check it against existing ones before you create.",
  title: "New Feature Request · Signal",
};

export default function NewRequestPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8">
      <SignalHeader />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New Feature Request</h1>
        <p className="text-muted-foreground text-sm">
          Check the Draft first. Signal gives a Verdict on each existing Feature Request before
          anything is created.
        </p>
      </div>
      <CheckFlow />
    </main>
  );
}
