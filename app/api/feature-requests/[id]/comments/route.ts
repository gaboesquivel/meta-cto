import { commentInputSchema } from "@/lib/signal/contracts";
import { handleSignal, parseJsonBody, readId } from "@/lib/signal/http";

export const dynamic = "force-dynamic";

/** Comment on a Feature Request. */
export const POST = (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  handleSignal({
    request,
    run: async (service) => {
      const id = await readId(params);
      const input = await parseJsonBody(request, commentInputSchema);
      const comment = await service.comment(id, input);
      return Response.json({ comment }, { status: 201 });
    },
    write: true,
  });
