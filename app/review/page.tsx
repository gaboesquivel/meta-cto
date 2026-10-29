import type { Metadata } from "next";
import { headers } from "next/headers";

import { ReviewBoard } from "@/components/signal/review-board";
import { SignalHeader } from "@/components/signal/signal-header";
import { verifyOperatorRequest } from "@/lib/auth/operator-access";

export const metadata: Metadata = {
  description:
    "Review Queue: confirm Suspected Duplicates as Duplicate, Related or Distinct, and see the Intake Duplicate Rate next to the backlog baseline.",
  title: "Review Queue · Signal",
};

/** True when this browser carries a valid Operator session (the same check the write routes run). */
const hasOperatorAccess = async (): Promise<boolean> => {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") ?? "";
  const request = new Request("http://localhost/review", { headers: { cookie } });
  return verifyOperatorRequest(request).ok;
};

export default async function ReviewPage() {
  const operator = await hasOperatorAccess();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-8">
      <SignalHeader />
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
        <p className="text-muted-foreground text-sm">
          Is Signal preventing duplicates? Compare the Intake Duplicate Rate for Feature Requests
          created through a Check with the backlog baseline, then work the Review Queue. The AI
          suggests; the Product Manager decides, and every decision can be undone.
        </p>
      </div>
      <ReviewBoard operator={operator} />
    </main>
  );
}
