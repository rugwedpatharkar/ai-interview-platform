// Shared `authedFetch` for the REST clients (interview / chat / jd / proctor) that live on
// ai-agents. It mirrors transport.ts: attach the bearer token, and on a 401 perform a
// SINGLE-FLIGHT refresh (one in-flight refresh promise shared across concurrent 401s),
// update the store, then retry the request ONCE with the new token. On refresh failure it
// clears the store and calls the same `onAuthLost` redirect path the transport uses.
//
// Why a registry: the REST clients hit ai-agents (NEXT_PUBLIC_AIAGENTS_URL), but BOTH
// refresh mechanisms — the AuthService.Refresh RPC and POST /auth/oauth/refresh — live on
// the admin service (NEXT_PUBLIC_ADMIN_URL). The client factories take only (baseUrl, store)
// and the apps depend on that signature, so they can't be handed the admin origin or the
// app's `onAuthLost` directly. `makeAuth` (which already has both, plus the shared store)
// registers them here, keyed by the store the REST clients share. `authedFetch` itself still
// takes everything explicitly so it's reusable framework-free; the registry is just how the
// fixed-signature factories resolve their deps.
import { AuthService } from "@ip/api-client";
import { createClient } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";

import type { TokenStore } from "./tokens.js";

export interface RestAuthContext {
  store: TokenStore;
  // Admin origin that serves the Refresh RPC + /auth/oauth/refresh cookie endpoint.
  refreshUrl: string;
  // Called after a failed refresh (store already cleared) to redirect to login.
  onAuthLost: () => void;
}

// One in-flight refresh per token store, so a 401 on chat and a 401 on jd that race share a
// single rotation instead of each spending the (single-use) refresh token. Mirrors the
// `inflight ??=` guard in transport.ts, lifted to module scope to span sibling clients.
const inflightByStore = new WeakMap<TokenStore, Promise<boolean>>();

// Registry of REST auth contexts keyed by the shared token store. WeakMap so a torn-down
// app's context is collectable with its store.
const contextByStore = new WeakMap<TokenStore, RestAuthContext>();

/** Register how REST clients sharing `ctx.store` should refresh + recover. Called by makeAuth. */
export function registerRestAuth(ctx: RestAuthContext): void {
  contextByStore.set(ctx.store, ctx);
}

/** Resolve the registered context for a store, if any (REST clients use this to self-wire). */
export function getRestAuth(store: TokenStore): RestAuthContext | undefined {
  return contextByStore.get(store);
}

/**
 * Context a REST client (interview/chat/jd) passes to `authedFetch`. Returns the one
 * `makeAuth` registered for this shared store; if none is registered yet, returns a fallback
 * that attaches the token but never refreshes — i.e. the pre-existing behavior (a 401 just
 * surfaces). The fallback resolves the live context per call, so a client constructed before
 * `makeAuth` (module init order) still gains refresh once registration lands.
 */
export function restAuthFor(store: TokenStore): RestAuthContext {
  return {
    store,
    get refreshUrl(): string {
      return contextByStore.get(store)?.refreshUrl ?? "";
    },
    onAuthLost: () => contextByStore.get(store)?.onAuthLost(),
  };
}

async function refresh(ctx: RestAuthContext): Promise<boolean> {
  let pending = inflightByStore.get(ctx.store);
  if (pending) return pending;
  pending = (async () => {
    try {
      const stored = ctx.store.get();
      if (stored?.refresh) {
        // Password session: rotate via the gRPC Refresh RPC (refresh token in hand).
        const bare = createGrpcWebTransport({ baseUrl: ctx.refreshUrl });
        const res = await createClient(AuthService, bare).refresh({
          refreshToken: stored.refresh,
        });
        ctx.store.set({ access: res.accessToken, refresh: res.refreshToken });
      } else {
        // SSO session: the refresh token is an HttpOnly cookie the SPA can't read — rotate
        // via the cookie endpoint (credentials included); the refresh stays in the cookie.
        const res = await fetch(`${ctx.refreshUrl}/auth/oauth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) throw new Error("cookie refresh failed");
        const data = (await res.json()) as { access_token: string };
        ctx.store.set({ access: data.access_token, refresh: "" });
      }
      return true;
    } catch {
      ctx.store.clear();
      ctx.onAuthLost();
      return false;
    } finally {
      inflightByStore.delete(ctx.store);
    }
  })();
  inflightByStore.set(ctx.store, pending);
  return pending;
}

/**
 * Fetch with the store's bearer token attached. On a 401, single-flight refresh once
 * (RPC for a password session, the cookie endpoint for SSO), then retry the request ONCE
 * with the fresh token. On refresh failure the store is cleared and `onAuthLost` fires.
 *
 * `ctx` carries the shared store, the admin refresh origin, and the recovery callback. The
 * caller owns `init` (method/headers/body/keepalive); we only manage the Authorization
 * header and clone `init` for the retry so a one-shot body isn't reused.
 */
export async function authedFetch(
  url: string,
  init: RequestInit,
  ctx: RestAuthContext,
): Promise<Response> {
  const sent = ctx.store.get()?.access;
  const res = await fetch(url, withAuth(init, sent));
  if (res.status !== 401) return res;

  // If a concurrent request already refreshed, retry with the current token rather than
  // refreshing again (which would reuse a now-rotated refresh token and log the user out).
  const current = ctx.store.get()?.access;
  if (current && current !== sent) {
    return fetch(url, withAuth(init, current));
  }
  // We sent a token and it was rejected -> refresh once, then retry. Skip tokenless requests
  // (nothing to refresh) and the unregistered case (no refreshUrl) — there the 401 surfaces,
  // preserving the clients' pre-authedFetch behavior.
  if (sent && ctx.refreshUrl && (await refresh(ctx))) {
    const fresh = ctx.store.get()?.access;
    return fetch(url, withAuth(init, fresh));
  }
  return res;
}

function withAuth(init: RequestInit, token: string | undefined): RequestInit {
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  else headers.delete("authorization");
  return { ...init, headers };
}
