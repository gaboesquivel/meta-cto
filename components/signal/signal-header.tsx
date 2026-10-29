import Link from "next/link";

/** Small top bar shared by the Signal pages. */
export const SignalHeader = () => (
  <nav aria-label="Signal" className="flex items-center justify-between gap-4 text-sm">
    <Link className="font-semibold tracking-tight" href="/">
      Signal
    </Link>
    <div className="flex gap-3 sm:gap-4">
      <Link className="text-muted-foreground hover:text-foreground" href="/requests">
        Feature Requests
      </Link>
      <Link className="text-muted-foreground hover:text-foreground" href="/requests/new">
        New
      </Link>
      <Link className="text-muted-foreground hover:text-foreground" href="/review">
        Review
      </Link>
      <Link className="text-muted-foreground hover:text-foreground" href="/proof">
        Proof
      </Link>
    </div>
  </nav>
);
