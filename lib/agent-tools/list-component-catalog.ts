import { componentNames, compositionGuidance } from "@/lib/genui";
import { defineTool } from "eve/tools";
import { z } from "zod";

export default defineTool({
  description: "List registered GenUI root components and composition guidance.",
  execute() {
    return { components: componentNames, guidance: compositionGuidance };
  },
  inputSchema: z.object({}),
});
