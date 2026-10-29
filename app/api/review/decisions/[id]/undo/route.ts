import { undoRequestSchema } from "@/lib/signal/contracts";
import { decisionNotFound, handleReview, parseJsonBody, readId } from "@/lib/signal/http";

export const dynamic = "force-dynamic";

/** Undo a Review Decision; the decision and its undo stay in history. Operator access only. */
export const POST = (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  handleReview({
    request,
    run: async (service) => {
      const id = await readId(params, decisionNotFound);
      const { actor } = await parseJsonBody(request, undoRequestSchema);
      const decision = await service.undo(id, actor);
      return Response.json({ decision });
    },
    write: true,
  });
