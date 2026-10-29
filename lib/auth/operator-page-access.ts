import { headers } from "next/headers";

import { verifyOperatorRequest } from "./operator-access";

/**
 * True when this browser carries a valid Operator session: the same check the write routes run,
 * for server-rendered pages (`/review` actions, `/proof`).
 */
export const hasOperatorSession = async (): Promise<boolean> => {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") ?? "";
  const request = new Request("http://localhost/", { headers: { cookie } });
  return verifyOperatorRequest(request).ok;
};
