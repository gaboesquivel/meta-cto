import { defineAgent } from "eve";

export default defineAgent({
  model: process.env.EVE_AGENT_MODEL?.trim() ?? "anthropic/claude-sonnet-4-20250514",
  modelContextWindowTokens: 200_000,
});
