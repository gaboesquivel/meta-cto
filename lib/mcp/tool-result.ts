export const asToolResult = (value: unknown) => ({
  content: [{ text: JSON.stringify(value, null, 2), type: "text" as const }],
  structuredContent: value,
});
