import { generateDemoData, generateDemoDataInputSchema } from "@/lib/demo/generate-demo-data";
import { defineTool } from "eve/tools";

export default defineTool({
  description:
    "Generate deterministic synthetic demo records for allowed schemas (users, support_tickets, orders).",
  execute(input) {
    return generateDemoData(input);
  },
  inputSchema: generateDemoDataInputSchema,
});
