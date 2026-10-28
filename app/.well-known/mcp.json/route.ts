import { buildMcpRegistryManifest } from "@/lib/mcp/tool-catalog";
import { resolveSiteOrigin } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export const GET = (request: Request) =>
  Response.json(buildMcpRegistryManifest(resolveSiteOrigin(request)));
