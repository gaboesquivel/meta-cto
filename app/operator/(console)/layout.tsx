import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import {
  OPERATOR_SESSION_COOKIE,
  getOperatorAccessToken,
  isOperatorAccessConfigured,
  signOperatorSession,
} from "@/lib/auth/operator-access";
import { OperatorDisabled } from "../operator-disabled";

export default async function OperatorConsoleLayout({ children }: { children: ReactNode }) {
  if (!isOperatorAccessConfigured()) return <OperatorDisabled />;

  const cookieStore = await cookies();
  const session = cookieStore.get(OPERATOR_SESSION_COOKIE)?.value;
  const expected = signOperatorSession({ token: getOperatorAccessToken() });

  if (session !== expected) redirect("/operator/access");

  return children;
}
