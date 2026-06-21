"use client";

import { ApIcon } from "@ip/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AuthShell, Notice, roleHome } from "../../../components/auth/auth-card";
import { store } from "../../../lib/auth";

/* ============================================================
   APTURA · v3 — SSO callback
   The provider redirects here with #access_token=… (and possibly
   #error=…). We parse the hash, validate the JWT structurally,
   write tokens to the candidate store, decode the role claim, and
   route. If we don't resolve within RESOLVE_TIMEOUT_MS we bail to
   /login so the user isn't stranded on a forever-spinner.
   ============================================================ */

const RESOLVE_TIMEOUT_MS = 8000;

interface JwtPayload {
  exp?: number;
  role?: string;
}

/** Structurally validates a JWT: 3 non-empty segments + decodable JSON payload
 *  + (if present) an unexpired `exp` claim (10s skew grace). */
function decodeValidJwt(token: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) return null;
  const payload64 = parts[1] as string;
  try {
    const json = atob(payload64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as unknown;
    if (typeof payload !== "object" || payload === null) return null;
    const exp = (payload as Record<string, unknown>).exp;
    if (typeof exp === "number" && exp < Date.now() / 1000 - 10) return null;
    return payload as JwtPayload;
  } catch {
    return null;
  }
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const called = useRef(false);

  useEffect(() => {
    // StrictMode double-mount guard — the side effect (store.set + redirect)
    // must not fire twice.
    if (called.current) return;
    called.current = true;

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (params.get("error")) {
      setError("Sign-in failed. Please try again.");
      return;
    }
    const access = params.get("access_token");
    if (!access) {
      setError("No session was returned by the provider.");
      return;
    }
    const payload = decodeValidJwt(access);
    if (!payload) {
      setError("The session token was invalid. Please sign in again.");
      return;
    }
    // The SSO refresh token rides an HttpOnly cookie (not JS-readable). Seed
    // the access token; cookie-based silent refresh is a documented follow-up.
    store.set({ access, refresh: "" });
    // Arm the timeout before router.replace so it only covers the pending
    // navigation window; clear immediately after to prevent a stale-toast race.
    const timer = window.setTimeout(
      () => setError("Sign-in is taking too long. Please try again."),
      RESOLVE_TIMEOUT_MS,
    );
    router.replace(roleHome(payload.role));
    window.clearTimeout(timer);
    return () => window.clearTimeout(timer);
  }, [router]);

  if (error) {
    return (
      <AuthShell
        eyebrow="Single sign-on"
        title="Sign-in failed."
        sub="The handshake with your identity provider didn't complete."
      >
        <div className="mt-6 grid gap-4">
          <Notice tone="danger">{error}</Notice>
          <Link
            href="/login"
            className="ap-btn ap-btn-primary ap-btn-lg w-full justify-center"
          >
            Back to sign in
            <ApIcon name="arrow" className="size-4" />
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      eyebrow="Single sign-on"
      title="Signing you in…"
      sub="Finishing the handshake. You'll land on your dashboard in a moment."
    >
      <div className="mt-6 grid place-items-center gap-4 py-8">
        <ApertureSpinner />
        <p className="text-[0.86rem] text-ink-3">Verifying session token…</p>
      </div>
    </AuthShell>
  );
}

/** Aperture mark + perimeter spinner — branded loading affordance. */
function ApertureSpinner() {
  return (
    <div className="relative grid size-20 place-items-center">
      <span className="absolute inset-0 animate-spin rounded-full border-2 border-line border-t-teal" />
      <ApIcon name="mark" className="size-10 text-teal" />
    </div>
  );
}
