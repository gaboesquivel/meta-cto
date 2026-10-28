import { componentPropsByName } from "../contract/schemas";

/** Authoritative list — derived from Zod prop schemas to avoid registry drift. */
export const componentNames = Object.keys(componentPropsByName) as ComponentName[];

export type ComponentName = keyof typeof componentPropsByName;

export const forbiddenComponentKeys = [
  "presentation",
  "variant",
  "layout",
  "frame",
  "html",
  "css",
  "tool",
  "toolName",
  "endpoint",
  "onClick",
  "onSubmit",
] as const;
