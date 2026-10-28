import { createInputSchema, searchInputSchema } from "@/lib/signal/contracts";
import { handleSignal, parseJsonBody, parseSearchParams } from "@/lib/signal/http";

export const dynamic = "force-dynamic";

/** Search or list Feature Requests; `q` is semantic. */
export const GET = (request: Request) =>
  handleSignal({
    run: async (service) => {
      const input = parseSearchParams(request, searchInputSchema);
      const page = await service.search(input);
      return Response.json(page);
    },
  });

/** Create a Feature Request; requires a recent Check for the same Draft. */
export const POST = (request: Request) =>
  handleSignal({
    request,
    run: async (service) => {
      const input = await parseJsonBody(request, createInputSchema);
      const featureRequest = await service.create(input);
      return Response.json({ featureRequest }, { status: 201 });
    },
    write: true,
  });
