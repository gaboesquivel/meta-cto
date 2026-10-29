import { scanOptionsSchema } from "@/lib/signal/contracts";
import { handleReview, parseWith } from "@/lib/signal/http";

export const dynamic = "force-dynamic";

/** Run the backlog scan for suspected duplicates (paid AI calls). Operator access only. */
export const POST = (request: Request) =>
  handleReview({
    request,
    run: async (service) => {
      const text = await request.text();
      let json: unknown = {};
      if (text.trim()) {
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
      }
      const options = parseWith(scanOptionsSchema, json);
      const result = await service.scan(options);
      return Response.json(result);
    },
    write: true,
  });
