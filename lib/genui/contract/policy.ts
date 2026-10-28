import { forbiddenComponentKeys } from "../registry/components";

const forbiddenKeySet = new Set<string>(forbiddenComponentKeys);

const collectStrings = (value: unknown, out: string[]) => {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) collectStrings(nested, out);
  }
};

const stringValues = (value: unknown) => {
  const out: string[] = [];
  collectStrings(value, out);
  return out;
};

const valueReason = (value: string) => {
  if (/<[a-z][^>]*>/iu.test(value)) return "html";
  if (/\{[^}]*:[^}]*\}/u.test(value)) return "css";
  if (/^https?:\/\//u.test(value)) return "endpoint";
  return null;
};

export const checkComponentDocument = ({
  name,
  props,
}: {
  name: string;
  props: Record<string, unknown>;
}) => {
  for (const key of Object.keys(props)) {
    if (forbiddenKeySet.has(key)) {
      if (name === "StatusMessage" && key === "variant") continue;
      return { code: "forbidden_property" as const, key, ok: false as const };
    }
  }
  for (const value of stringValues(props)) {
    const reason = valueReason(value);
    if (reason === "html" || reason === "css") {
      return { code: "forbidden_value" as const, ok: false as const };
    }
    if (reason === "endpoint" && name !== "Answer") {
      return { code: "unauthorized_endpoint" as const, ok: false as const };
    }
  }
  return { name, ok: true as const };
};
