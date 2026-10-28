import { cn } from "cn";

import type { Verdict } from "@/lib/signal/contracts";

const LABELS: Record<Verdict, string> = {
  different: "Different",
  related_need: "Related Need",
  same_need: "Same Need",
  unknown: "Verdict unknown",
};

const STYLES: Record<Verdict, string> = {
  different: "bg-muted text-muted-foreground",
  related_need: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  same_need: "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950",
  unknown: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
};

export const VerdictBadge = ({ verdict }: { verdict: Verdict }) => (
  <span
    className={cn(
      "inline-flex h-6 w-fit items-center rounded-full px-2.5 text-xs font-semibold tracking-wide uppercase",
      STYLES[verdict],
    )}
  >
    {LABELS[verdict]}
  </span>
);
