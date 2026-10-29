import { decideRequestSchema } from "@/lib/signal/contracts";
import { handleReview, parseJsonBody } from "@/lib/signal/http";

export const dynamic = "force-dynamic";

/** Record a Review Decision (Duplicate, Related, Distinct or none). Operator access only. */
export const POST = (request: Request) =>
  handleReview({
    request,
    run: async (service) => {
      const { actor, ...input } = await parseJsonBody(request, decideRequestSchema);
      const decision = await service.decide(input, actor);
      return Response.json({ decision }, { status: 201 });
    },
    write: true,
  });
