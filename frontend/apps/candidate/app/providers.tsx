"use client";

import { makeQueryClient } from "@ip/shared";
import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import { AuthProvider } from "../lib/auth";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
