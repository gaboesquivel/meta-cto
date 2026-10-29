import type { Origin } from "@/lib/signal/contracts";
import { handleReview } from "@/lib/signal/http";

export const dynamic = "force-dynamic";

/**
 * Review metrics (Intake Duplicate Rate, backlog baseline, Review Coverage, Suspected Duplication,
 * Undo Rate) plus Suggestion Acceptance for one Origin: `?origin=` or the caller's own (demo, or
 * pilot with the Pilot Key, which also scopes it to the Pilot Workspace).
 * Open read; needs only the database. An unknown Origin is `invalid_input`.
 */
export const GET = (request: Request) =>
  handleReview({
    request,
    run: async (service) => {
      const origin = new URL(request.url).searchParams.get("origin");
      const metrics = await service.metrics(origin === null ? {} : { origin: origin as Origin });
      return Response.json(metrics);
    },
  });
