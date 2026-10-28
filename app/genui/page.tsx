import { Suspense } from "react";

import { StudioClient } from "../_components/studio/studio-client";

export const dynamic = "force-dynamic";

export default function GenuiPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground p-8 text-sm">Loading…</p>}>
      <StudioClient />
    </Suspense>
  );
}
