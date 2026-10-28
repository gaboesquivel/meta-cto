import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { draftSchema } from "@/lib/signal/contracts";

export const evalPairSchema = z.object({
  draft: draftSchema,
  expected: z.enum(["same_need", "related_need", "different"]),
  id: z.string().min(1),
  note: z.string().min(1),
  target: z.string().min(1),
});

export type EvalPair = z.infer<typeof evalPairSchema>;
export type EvalSetName = "dev" | "held-out";

export const loadEvalSet = (name: EvalSetName): EvalPair[] => {
  const file = path.join(import.meta.dirname, `${name}.json`);
  return z.array(evalPairSchema).parse(JSON.parse(readFileSync(file, "utf-8")));
};
