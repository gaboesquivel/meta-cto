import Link from "next/link";

import { buttonVariants } from "@/components/button";

/** Sign-in path shown in place of review actions when the browser has no Operator session. */
export const OperatorSignIn = ({ compact = false }: { compact?: boolean }) => (
  <div className="flex flex-wrap items-center gap-3">
    <Link
      className={buttonVariants({ size: compact ? "sm" : "default", variant: "outline" })}
      href="/operator/access"
    >
      Sign in as Operator
    </Link>
    {compact ? null : (
      <span className="text-muted-foreground text-xs">
        Review Decisions and Undo need Operator access. Everything stays readable without it.
      </span>
    )}
  </div>
);
