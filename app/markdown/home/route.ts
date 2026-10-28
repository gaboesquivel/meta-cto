import { markdownResponse } from "@/lib/markdown-negotiation";
import { starterHomeMarkdown } from "@/lib/starter-content";

export const dynamic = "force-dynamic";

export const GET = () => markdownResponse(starterHomeMarkdown);
