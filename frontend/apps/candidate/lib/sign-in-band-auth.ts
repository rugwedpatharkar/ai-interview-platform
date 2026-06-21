"use client";

import { decodeRoleFromStore, roleHome } from "../components/auth/auth-card";
import { useAuth } from "./auth";

/** Adapter for SignInBand: pairs the candidate app's `login()` with a synchronous
 *  role-aware home resolver. The band lives in @ip/ui and can't import these
 *  app-local helpers directly; injecting via this hook keeps the boundary clean. */
export function useSignInBandAuth() {
  const { login } = useAuth();
  return {
    login,
    resolveHome: () => roleHome(decodeRoleFromStore()),
  };
}
