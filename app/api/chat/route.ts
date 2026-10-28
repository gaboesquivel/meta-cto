import { streamText } from "ai";

import { chatUnavailableResolution, resolveChatModel } from "@/lib/ai/resolve-chat-model";
import { jsonError, withExtraHeaders } from "@/lib/api/json-error";
import { discoveryRateLimitHeaders } from "@/lib/api/rate-limit-headers";

const systemPrompt = `You assist users building agentic application UIs in this starter.

You can explain GenUI, MCP compose_ui, and Eve tools. You do not mutate remote systems.
When users want a new screen, suggest they use the GenUI playground at /genui or compose_ui with a clear UI description.

Keep answers concise. Use bullets for next steps when helpful.`;

export const GET = () =>
  withExtraHeaders(
    jsonError({
      code: "method_not_allowed",
      message: "Use POST with a messages array.",
      resolution: "POST /api/chat with Content-Type application/json.",
      status: 405,
    }),
    discoveryRateLimitHeaders(),
  );

export async function POST(req: Request) {
  const model = resolveChatModel();
  if (!model)
    return jsonError({
      code: "chat_unavailable",
      message: "Chat model credentials are not configured.",
      resolution: chatUnavailableResolution(),
      status: 503,
    });

  let messages: { role: "user" | "assistant"; content: string }[];
  try {
    const body = (await req.json()) as {
      messages?: { role: "user" | "assistant"; content: string }[];
    };
    const { messages: parsed } = body;
    if (!parsed?.length)
      return jsonError({
        code: "invalid_request",
        message: "Request body must include a non-empty messages array.",
        resolution: "See /openapi.json.",
        status: 400,
      });
    messages = parsed;
  } catch {
    return jsonError({
      code: "invalid_json",
      message: "Request body must be valid JSON.",
      resolution: "Send Content-Type application/json.",
      status: 400,
    });
  }

  const result = streamText({
    messages,
    model,
    system: systemPrompt,
  });

  return result.toUIMessageStreamResponse();
}
