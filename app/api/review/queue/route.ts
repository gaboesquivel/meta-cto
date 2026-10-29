import { handleReview } from "@/lib/signal/http";

export const dynamic = "force-dynamic";

/** Review Queue: new Feature Requests to review and backlog ones with suspected duplicates. Open read. */
export const GET = () =>
  handleReview({
    run: async (service) => {
      const queue = await service.queue();
      return Response.json(queue);
    },
  });
