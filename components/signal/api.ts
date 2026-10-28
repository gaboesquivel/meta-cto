import type { ApiError } from "./view";
import { readApiError } from "./view";

export type ApiResult<T> = { data: T; ok: true } | { error: ApiError; ok: false };

const NETWORK_ERROR: ApiError = {
  code: "network_error",
  message: "Could not reach the Signal API.",
  resolution: "Check your connection and try again.",
};

/** Calls a Signal REST route and returns either the JSON body or an agent-style error. */
export const callApi = async <T>(
  path: string,
  init?: { body?: unknown; method?: "GET" | "POST" },
): Promise<ApiResult<T>> => {
  let response: Response;
  try {
    response = await fetch(path, {
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
      method: init?.method ?? "GET",
    });
  } catch {
    return { error: NETWORK_ERROR, ok: false };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return { error: readApiError(body, response.status), ok: false };
  return { data: body as T, ok: true };
};
