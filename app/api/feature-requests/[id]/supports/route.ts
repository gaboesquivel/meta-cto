import { supportInputSchema } from "@/lib/signal/contracts";
import { handleSignal, parseJsonBody, readId, signalJsonError } from "@/lib/signal/http";

export const dynamic = "force-dynamic";

/** Support a Feature Request on behalf of an Account; one Support per Account. */
export const POST = (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  handleSignal({
    request,
    run: async (service) => {
      const id = await readId(params);
      const input = await parseJsonBody(request, supportInputSchema);
      const { created, featureRequest, support } = await service.support(id, input);
      if (!created) {
        return await signalJsonError(
          {
            code: "already_supported",
            message: "This Account already supports this Feature Request.",
            resolution:
              "Cite the existing Support returned here, or add a Comment with new evidence.",
            status: 409,
          },
          { featureRequest, support },
        );
      }
      return Response.json({ featureRequest, support }, { status: 201 });
    },
    write: true,
  });
