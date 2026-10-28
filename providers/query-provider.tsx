"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";

export const QueryProvider = ({ children }: { children: ReactNode }) => {
  const [queryClient, setQueryClient] = useState(() => new QueryClient());
  void setQueryClient;
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};
