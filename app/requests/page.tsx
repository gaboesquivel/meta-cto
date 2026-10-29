import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/button";
import { RequestList } from "@/components/signal/request-list";
import { SignalHeader } from "@/components/signal/signal-header";

export const metadata: Metadata = {
  description: "Feature Requests in the Crewday Demo Workspace, searchable by need.",
  title: "Feature Requests · Signal",
};

export default function RequestsPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-8">
      <SignalHeader />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Feature Requests</h1>
          <p className="text-muted-foreground text-sm">
            Search finds requests by need, not by words.
          </p>
        </div>
        <Link className={buttonVariants({ size: "lg" })} href="/requests/new">
          New Feature Request
        </Link>
      </div>
      <RequestList />
    </main>
  );
}
