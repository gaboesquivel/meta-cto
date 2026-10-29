import Link from "next/link";

import { buttonVariants } from "@/components/button";

/** Sign-in path shown in place of review actions when the browser has no Operator session. */
export const OperatorSignIn = ({
  compact = false,
  next = "/review",
  note = "Review Decisions and Undo need Operator access. Everything stays readable without it.",
}: {
  compact?: boolean;
  /** Same-site path to return to after sign-in. */
  next?: string;
  note?: string;
}) => (
  <div className="flex flex-wrap items-center gap-3">
    <Link
      className={buttonVariants({ size: compact ? "sm" : "default", variant: "outline" })}
      href={`/operator/access?next=${encodeURIComponent(next)}`}
    >
      Sign in as Operator
    </Link>
    {compact ? null : <span className="text-muted-foreground text-xs">{note}</span>}
  </div>
);
