import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/button";
import { VerdictBadge } from "@/components/signal/verdict-badge";

export const metadata: Metadata = {
  description: "A verdict before every create: Check a Draft against existing Feature Requests.",
  title: "Signal",
};

const VERDICTS = [
  {
    next: "Support or Comment on the existing Feature Request, with this customer's words and Account Context.",
    verdict: "same_need",
  },
  {
    next: "Create it, with a Related Link and the Shared Dimension. Related needs are never merged away.",
    verdict: "related_need",
  },
  { next: "Create it.", verdict: "different" },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-8 px-4 py-12 sm:px-8">
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm font-semibold tracking-widest uppercase">
          Signal
        </p>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight text-balance sm:text-4xl">
          A verdict before every create, not a merge after it.
        </h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          Before a Feature Request is written, Signal Checks the Draft against what already exists.
          It states the Underlying Need, then gives each close match a Verdict with a Reason: Same
          Need, Related Need or Different. Whoever is filing, a support person or an agent acting
          for a customer, knows whether to Support, link or create, and passing over a Same Need
          takes a stated Skip Reason.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {VERDICTS.map((item) => (
          <li
            className="flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-center sm:gap-4"
            key={item.verdict}
          >
            <span className="sm:w-32 sm:shrink-0">
              <VerdictBadge verdict={item.verdict} />
            </span>
            <span className="text-sm">{item.next}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <Link className={buttonVariants({ size: "lg" })} href="/requests/new">
          Check a Draft
        </Link>
        <Link className={buttonVariants({ size: "lg", variant: "outline" })} href="/requests">
          Browse Feature Requests
        </Link>
      </div>
    </main>
  );
}
