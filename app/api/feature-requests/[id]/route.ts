import { handleSignal, readId } from "@/lib/signal/http";

export const dynamic = "force-dynamic";

/** Feature Request detail: Underlying Need, Supports, Comments and Related Links. */
export const GET = (_request: Request, { params }: { params: Promise<{ id: string }> }) =>
  handleSignal({
    run: async (service) => {
      const id = await readId(params);
      const detail = await service.get(id);
      return Response.json(detail);
    },
  });
