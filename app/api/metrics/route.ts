import { handleSignal } from "@/lib/signal/http";

export const dynamic = "force-dynamic";

/** Review metrics (Intake Duplicate Rate, backlog baseline, Review Coverage, Suspected Duplication, Undo Rate) plus Suggestion Acceptance. */
export const GET = () =>
  handleSignal({
    run: async (service) => {
      const metrics = await service.metrics();
      return Response.json(metrics);
    },
  });
