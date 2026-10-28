import { Suspense } from "react";

import { StudioClient } from "@/app/_components/studio/studio-client";

export const dynamic = "force-dynamic";

export default function OperatorPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b px-6 py-3">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">Operator</p>
        <h1 className="font-semibold text-sm">Protected GenUI console</h1>
      </header>
      <Suspense fallback={<p className="text-muted-foreground p-8 text-sm">Loading…</p>}>
        <StudioClient />
      </Suspense>
    </div>
  );
}
