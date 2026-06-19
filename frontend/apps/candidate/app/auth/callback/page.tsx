"use client";

import { Alert, Card, CardContent, CardHeader, CardTitle, Spinner } from "@ip/ui";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { store } from "../../../lib/auth";

// If the hash token never resolves (provider redirect dropped it, or a hung navigation),
// fail to a clear error with a way back rather than spinning forever.
const RESOLVE_TIMEOUT_MS = 8000;

/** Returns true iff `token` is a structurally-valid JWT with a non-empty JSON payload. */
function isValidJwt(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !p)) return false;
  // length === 3 and all segments non-empty — parts[1] is a non-empty string here.
  const payload64 = parts[1] as string;
  try {
    const json = atob(payload64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload: unknown = JSON.parse(json);
    if (typeof payload !== "object" || payload === null) return false;
    // Reject tokens that are already expired (clock-skew: 10 s grace).
    const exp = (payload as Record<string, unknown>).exp;
    if (typeof exp === "number" && exp < Date.now() / 1000 - 10) return false;
    return true;
  } catch {
    return false;
  }
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (params.get("error")) {
      setError("Sign-in failed. Please try again.");
      return;
    }
    const access = params.get("access_token");
    if (!access) {
      setError("No session was returned.");
      return;
    }
    if (!isValidJwt(access)) {
      setError("The session token was invalid. Please sign in again.");
      return;
    }
    // The SSO refresh token rides an HttpOnly cookie (not readable by JS). Seed the
    // access token now; cookie-based silent refresh is a documented follow-up.
    store.set({ access, refresh: "" });
    router.replace("/");

    const timer = window.setTimeout(
      () => setError("Sign-in is taking too long. Please try again."),
      RESOLVE_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Signing you in</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? (
            <>
              <Alert tone="danger">{error}</Alert>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Back to login
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Signing you in…
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
