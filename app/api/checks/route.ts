import { checkInputSchema } from "@/lib/signal/contracts";
import { handleSignal, parseJsonBody } from "@/lib/signal/http";

export const dynamic = "force-dynamic";

/** Check a Draft against existing Feature Requests before creating one. */
export const POST = (request: Request) =>
  handleSignal({
    request,
    run: async (service) => {
      const input = await parseJsonBody(request, checkInputSchema);
      const result = await service.check(input);
      return Response.json(result);
    },
    write: true,
  });
