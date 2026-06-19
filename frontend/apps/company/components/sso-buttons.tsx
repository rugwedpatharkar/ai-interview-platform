"use client";

import { buttonVariants, cn } from "@ip/ui";
import { useEffect, useState } from "react";

import { useAuth } from "../lib/auth";

const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:8080";

const LABELS: Record<string, string> = {
  google: "Continue with Google",
  microsoft: "Continue with Microsoft",
};

/**
 * SSO buttons gated on the backend's configured providers (no dead 404 buttons). Each
 * links to admin's authorize endpoint with THIS app's own callback as the allow-listed
 * `redirect`, so the candidate and company apps each receive their own SSO callback.
 * Renders nothing when no providers are configured OR the lookup fails — SSO is optional
 * and email/password is always available, so an unreachable/absent providers endpoint
 * must degrade silently (a `console.error` here would trip Next's dev error overlay for
 * an expected, handled condition). The failure is logged at debug for observability.
 */
export function SsoButtons() {
  const { api } = useAuth();
  const [providers, setProviders] = useState<string[]>([]);
  const [redirect, setRedirect] = useState("");

  useEffect(() => {
    setRedirect(`${window.location.origin}/auth/callback`);
    api.auth
      .listOAuthProviders({})
      .then((res) => setProviders(res.providers))
      .catch((err) => {
        console.debug("SSO providers unavailable", err);
        setProviders([]);
      });
  }, [api]);

  const shown = providers.filter((p) => p in LABELS);
  if (shown.length === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      {shown.map((p) => (
        <a
          key={p}
          href={`${ADMIN_URL}/auth/oauth/authorize?provider=${p}&redirect=${encodeURIComponent(redirect)}`}
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          {LABELS[p]}
        </a>
      ))}
    </div>
  );
}
