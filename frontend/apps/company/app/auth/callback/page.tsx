"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { store } from "../../../lib/auth";

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
    // The SSO refresh token rides an HttpOnly cookie (not readable by JS). Seed the
    // access token now; cookie-based silent refresh is a documented follow-up.
    store.set({ access, refresh: "" });
    router.replace("/jobs");
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6 text-center">
      <p
        className={
          error
            ? "text-sm text-danger-foreground"
            : "text-sm text-muted-foreground"
        }
      >
        {error ?? "Signing you in…"}
      </p>
    </main>
  );
}
