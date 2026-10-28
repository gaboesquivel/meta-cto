import { generateText } from "ai";

const DEFAULT_GENUI_MODEL = "anthropic/claude-sonnet-4.6";

export const synthesizeOpenEndedAnswer = async ({
  query,
  signal,
}: {
  query: string;
  signal?: AbortSignal;
}) => {
  const apiKey = process.env.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.GENUI_MODEL?.trim() || DEFAULT_GENUI_MODEL;

  const result = await generateText({
    abortSignal: signal,
    maxOutputTokens: 600,
    model,
    prompt: `Answer briefly using only general product knowledge. Do not invent URLs, code, or credentials.\n\nQuestion: ${query}`,
  });

  const text = result.text.trim();
  return text.length > 0 ? text : null;
};
