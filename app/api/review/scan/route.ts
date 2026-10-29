import { scanOptionsSchema, SignalError } from "@/lib/signal/contracts";
import { handleReview, parseWith } from "@/lib/signal/http";
import { REST_SCAN_LIMIT } from "@/lib/signal/scan";

export const dynamic = "force-dynamic";
/** Seconds; the scan stops starting new rows at 240 s, leaving room for in-flight judgments. */
export const maxDuration = 300;

const overCap = (limit: number) =>
  new SignalError({
    code: "invalid_input",
    details: {
      issues: [
        {
          code: "too_big",
          maximum: REST_SCAN_LIMIT,
          message: `limit must be at most ${REST_SCAN_LIMIT}.`,
          path: ["limit"],
        },
      ],
    },
    message: `The scan limit ${limit} is above the REST cap of ${REST_SCAN_LIMIT}.`,
    resolution: `Send a limit from 1 to ${REST_SCAN_LIMIT} (default 20) and call again for the rest, or run pnpm signal:scan --limit N (up to 200).`,
    status: 400,
  });

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
      if (options.limit !== undefined && options.limit > REST_SCAN_LIMIT)
        throw overCap(options.limit);
      const result = await service.scan(options);
      return Response.json(result);
    },
    write: true,
  });
