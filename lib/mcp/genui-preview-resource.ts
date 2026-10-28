import { readFile } from "node:fs/promises";
import path from "node:path";

export const GENUI_PREVIEW_RESOURCE_URI = "ui://genui/preview";

export const genuiPreviewResourceDescription =
  "Interactive GenUI preview for MCP Apps hosts — renders OpenUI compositions from compose_ui results.";

export const genuiPreviewHtmlPath = () =>
  path.join(process.cwd(), "mcp-app/dist/genui-preview.html");

export const readGenuiPreviewHtml = () => readFile(genuiPreviewHtmlPath(), "utf-8");
