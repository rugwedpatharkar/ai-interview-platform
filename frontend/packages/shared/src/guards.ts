"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Redirect to `loginPath` when there is no token. `ready` defers the check until the
 * persisted token has been read post-mount, so an authed user isn't bounced during the
 * first (token-less) client render that must match SSR. */
export function useRequireAuth(
  token: string | null,
  ready = true,
  loginPath = "/login",
): void {
  const router = useRouter();
  useEffect(() => {
    if (ready && !token) router.replace(loginPath);
  }, [token, ready, router, loginPath]);
}

/** Redirect to `fallback` unless the caller's role is one of `allowed`. `ready` defers the
 * check until auth has hydrated (see useRequireAuth). */
export function useRequireRole(
  role: string | null | undefined,
  allowed: string[],
  ready = true,
  fallback = "/login",
): void {
  const router = useRouter();
  const allowedKey = allowed.join(",");
  useEffect(() => {
    if (ready && (role == null || !allowed.includes(role))) router.replace(fallback);
    // allowed referenced via allowedKey to keep the dep array stable.
  }, [role, ready, allowedKey, fallback, router]);
}
