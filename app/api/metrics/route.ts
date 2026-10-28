import { handleSignal } from "@/lib/signal/http";

export const dynamic = "force-dynamic";

/** Check, Suggestion Acceptance and create-after-Same-Need metrics. */
export const GET = () =>
  handleSignal({
    run: async (service) => {
      const metrics = await service.metrics();
      return Response.json(metrics);
    },
  });
