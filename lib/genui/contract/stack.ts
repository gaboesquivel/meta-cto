import { GENUI_MAX_STACK_CHILDREN } from "../core/limits";
import type { ComponentName } from "../registry/components";

export interface ParsedComponentChild {
  props: Record<string, unknown>;
  typeName: ComponentName;
}

export const isParsedComponentChild = (value: unknown): value is ParsedComponentChild =>
  Boolean(
    value &&
    typeof value === "object" &&
    (value as { type?: string }).type === "element" &&
    typeof (value as { typeName?: string }).typeName === "string",
  );

export const parseStackChildren = (
  raw: unknown,
): { ok: true; children: ParsedComponentChild[] } | { ok: false } => {
  if (!Array.isArray(raw)) return { ok: false };
  if (raw.length < 1 || raw.length > GENUI_MAX_STACK_CHILDREN) {
    return { ok: false };
  }
  const children: ParsedComponentChild[] = [];
  for (const item of raw) {
    if (!isParsedComponentChild(item)) return { ok: false };
    if (item.typeName === "SectionStack") return { ok: false };
    children.push({
      props: item.props,
      typeName: item.typeName as ComponentName,
    });
  }
  return { children, ok: true };
};
