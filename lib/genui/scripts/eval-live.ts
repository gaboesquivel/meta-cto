import { composeQuery } from "../orchestration/compose";

const prompts = ["Design a completely novel interface", "Surprise me with a custom layout"];

const run = async () => {
  if (!process.env.AI_GATEWAY_API_KEY?.trim()) {
    console.error("eval-live requires AI_GATEWAY_API_KEY");
    process.exit(1);
  }

  const results = await Promise.all(
    prompts.map(async (query) => {
      const result = await composeQuery({
        input: { clientRequestId: `live-${Date.now()}`, query, version: 1 },
      });
      const complete = result.events.find((event) => event.type === "complete");
      return JSON.stringify({
        outcome: result.metadata.outcome,
        query,
        root: complete?.type === "complete" ? complete.envelope.openuiText.slice(0, 80) : null,
        tier: result.metadata.tier,
      });
    }),
  );
  for (const line of results) console.log(line);
};

await run();
