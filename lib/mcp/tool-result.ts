export const asToolResult = (value: unknown) => ({
  content: [{ text: JSON.stringify(value, null, 2), type: "text" as const }],
  structuredContent: value,
});

/** Agent-actionable tool error: `{ code, message, resolution }` so the caller can recover. */
export interface ToolErrorBody {
  code: string;
  details?: unknown;
  message: string;
  resolution: string;
}

export const asToolError = (error: ToolErrorBody) => ({
  content: [{ text: JSON.stringify({ error }, null, 2), type: "text" as const }],
  isError: true,
  structuredContent: { error },
});
