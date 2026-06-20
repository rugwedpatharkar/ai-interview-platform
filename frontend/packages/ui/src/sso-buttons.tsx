"use client";

import { buttonVariants } from "./button.js";
import { cn } from "./cn.js";
import { useEffect, useState } from "react";

const LABELS: Record<string, string> = {
  google: "Continue with Google",
  microsoft: "Continue with Microsoft",
};

/** Minimal shape of the auth client this needs — each app passes `useAuth().api`, whose
 *  `auth.listOAuthProviders` is structurally compatible. */
export interface OAuthProvidersApi {
  auth: {
    listOAuthProviders(req: Record<string, never>): Promise<{ providers: string[] }>;
  };
}

export interface SsoButtonsProps {
  api: OAuthProvidersApi;
  /** Admin base URL for the authorize endpoint (app resolves it from env). */
  adminUrl: string;
}

/**
 * SSO buttons gated on the backend's configured providers (no dead 404 buttons). Each
 * links to admin's authorize endpoint with THIS app's own callback as the allow-listed
 * `redirect`, so the candidate and company apps each receive their own SSO callback.
 * Renders nothing when no providers are configured OR the lookup fails — SSO is optional
 * and email/password is always available, so an unreachable/absent providers endpoint
 * must degrade silently (a `console.error` here would trip Next's dev error overlay for
 * an expected, handled condition). The failure is logged at debug for observability.
 */
export function SsoButtons({ api, adminUrl }: SsoButtonsProps) {
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
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex items-center gap-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      {shown.map((p) => (
        <a
          key={p}
          href={`${adminUrl}/auth/oauth/authorize?provider=${p}&redirect=${encodeURIComponent(redirect)}`}
          className={cn(buttonVariants({ variant: "outline" }), "w-full")}
        >
          {LABELS[p]}
        </a>
      ))}
    </div>
  );
}
