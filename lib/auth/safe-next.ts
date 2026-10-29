/**
 * Same-site path to return to after Operator sign-in, from a `?next=` query string.
 * The target is resolved as a URL and kept only when it stays on `origin`; backslashes,
 * control characters and protocol-relative tricks all resolve elsewhere and fall back.
 */
export const safeNext = (search: string, origin: string): string => {
  const fallback = "/operator";
  const next = new URLSearchParams(search).get("next");
  if (!next?.startsWith("/")) return fallback;
  let target: URL;
  try {
    target = new URL(next, origin);
  } catch {
    return fallback;
  }
  if (target.origin !== origin) return fallback;
  return `${target.pathname}${target.search}${target.hash}`;
};
