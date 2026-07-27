"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Normalizes a user-supplied redirect target so we never post-login-bounce the
 * user to a foreign origin or a protocol-relative URL. Anything that isn't a
 * strict same-origin absolute path is coerced back to null. */
export function safeRedirect(target: string | null | undefined): string | null {
  if (!target) return null;
  if (!target.startsWith("/")) return null;
  // "//evil.example" and "/\evil.example" are the classic open-redirect vectors
  // — both start with "/" but resolve to a different origin.
  if (target.startsWith("//") || target.startsWith("/\\")) return null;
  return target;
}

/** Redirect to `loginPath` when there is no token. `ready` defers the check until the
 * persisted token has been read post-mount, so an authed user isn't bounced during the
 * first (token-less) client render that must match SSR. The current pathname + query
 * ride along in `?redirect=` so the user lands back where they were after signing in. */
export function useRequireAuth(
  token: string | null,
  ready = true,
  loginPath = "/login",
): void {
  const router = useRouter();
  useEffect(() => {
    if (!ready || token) return;
    // Preserve the deep link the user tried to reach — but not if they're
    // already sitting on the login screen, which would loop the param.
    const here = window.location.pathname + window.location.search;
    const redirect = here && here !== loginPath ? here : null;
    router.replace(redirect ? `${loginPath}?redirect=${encodeURIComponent(redirect)}` : loginPath);
  }, [token, ready, router, loginPath]);
}

/** Redirect when the caller's role is not one of `allowed`. Unauthed users go to
 * `loginPath`; already-authed users with the wrong role go to `forbiddenPath` — the
 * previous shape sent everyone to /login, which logged a signed-in recruiter out
 * of a candidate-only page and vice-versa. `ready` defers the check until auth has
 * hydrated (see useRequireAuth). */
export function useRequireRole(
  role: string | null | undefined,
  allowed: string[],
  ready = true,
  loginPath = "/login",
  forbiddenPath = "/",
): void {
  const router = useRouter();
  const allowedKey = allowed.join(",");
  useEffect(() => {
    if (!ready) return;
    if (role == null) router.replace(loginPath);
    else if (!allowed.includes(role)) router.replace(forbiddenPath);
    // allowed referenced via allowedKey to keep the dep array stable.
  }, [role, ready, allowedKey, loginPath, forbiddenPath, router]);
}
