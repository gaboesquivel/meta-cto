import { streamText } from "ai";

import { chatUnavailableResolution, resolveChatModel } from "@/lib/ai/resolve-chat-model";
import { operatorAccessDeniedResponse, verifyOperatorRequest } from "@/lib/auth/operator-access";
import { jsonError } from "@/lib/api/json-error";

const systemPrompt = `You are the Operator assistant for this meta-cto deployment.

You may discuss protected diagnostics, configuration status, and GenUI/MCP capabilities.
You must not expose secret values (API keys, tokens). When Operator access is misconfigured, explain fail-closed behavior.

Keep answers concise and actionable.`;

export const POST = async (request: Request) => {
  const access = verifyOperatorRequest(request);
  if (!access.ok) return operatorAccessDeniedResponse({ reason: access.reason });

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
    const body = (await request.json()) as {
      messages?: { role: "user" | "assistant"; content: string }[];
    };
    const { messages: parsed } = body;
    if (!parsed?.length)
      return jsonError({
        code: "invalid_request",
        message: "Request body must include a non-empty messages array.",
        resolution: "POST JSON with a messages array.",
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
};
