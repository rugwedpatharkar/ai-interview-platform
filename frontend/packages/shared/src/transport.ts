import { AuthService, type ApiClients, clientsFromTransport } from "@ip/api-client";
import { Code, ConnectError, type Interceptor, createClient } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";

import type { TokenStore } from "./tokens.js";

/**
 * gRPC-web transport that attaches the bearer token and, on `Unauthenticated`, silently
 * refreshes once (single-flight) and retries. On refresh failure it clears the store and
 * calls `onAuthLost`. All RPCs are unary, so re-invoking `next(req)` is a safe retry.
 */
export function createAuthedTransport(
  baseUrl: string,
  store: TokenStore,
  onAuthLost: () => void,
) {
  let inflight: Promise<boolean> | null = null;

  // Sentinel for transient refresh errors that must not clear the store.
  class TransientRefreshError extends Error {}

  async function refresh(): Promise<boolean> {
    inflight ??= (async () => {
      try {
        const stored = store.get();
        if (stored?.refresh) {
          // Password session: rotate via the gRPC Refresh RPC (refresh token in hand).
          const bare = createGrpcWebTransport({ baseUrl });
          const res = await createClient(AuthService, bare).refresh({
            refreshToken: stored.refresh,
          });
          store.set({ access: res.accessToken, refresh: res.refreshToken });
        } else {
          // SSO session: the refresh token is an HttpOnly cookie the SPA can't read —
          // rotate via the cookie endpoint (credentials included); refresh stays in the
          // cookie. This is what stops an SSO session becoming a zombie at token expiry.
          const res = await fetch(`${baseUrl}/auth/oauth/refresh`, {
            method: "POST",
            credentials: "include",
          });
          // 5xx / network blip: keep the store; let the RPC failure surface.
          if (!res.ok) {
            if (res.status >= 500) throw new TransientRefreshError(`cookie refresh transient (${res.status})`);
            throw new Error(`cookie refresh rejected (${res.status})`);
          }
          // A non-JSON body on a 200 is a proxy/CDN error, treat as transient.
          const data = await res.json().catch(() => {
            throw new TransientRefreshError("cookie refresh: malformed response body");
          }) as { access_token?: unknown };
          // A valid response missing the token is a genuine auth failure.
          if (typeof data.access_token !== "string" || !data.access_token) {
            throw new Error("cookie refresh: missing access_token");
          }
          store.set({ access: data.access_token, refresh: "" });
        }
        return true;
      } catch (err) {
        if (err instanceof TransientRefreshError) {
          console.warn("transport: transient refresh failure, store preserved", (err as Error).message);
          return false;
        }
        store.clear();
        onAuthLost();
        return false;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  const interceptor: Interceptor = (next) => async (req) => {
    const sent = store.get()?.access;
    if (sent) req.header.set("Authorization", `Bearer ${sent}`);
    try {
      return await next(req);
    } catch (err) {
      if (!(err instanceof ConnectError) || err.code !== Code.Unauthenticated) throw err;
      // If a concurrent request already refreshed the token, retry with it rather than
      // refreshing again (which would reuse a now-rotated refresh token and spuriously
      // log the user out).
      const current = store.get()?.access;
      if (current && current !== sent) {
        req.header.set("Authorization", `Bearer ${current}`);
        return await next(req);
      }
      // We sent a token and it expired -> attempt a refresh (RPC for a password session,
      // the HttpOnly cookie endpoint for an SSO session). Skips truly tokenless requests.
      if (sent && (await refresh())) {
        const fresh = store.get()?.access;
        if (fresh) req.header.set("Authorization", `Bearer ${fresh}`);
        return await next(req);
      }
      throw err;
    }
  };

  return createGrpcWebTransport({ baseUrl, interceptors: [interceptor] });
}

export function createClients(
  baseUrl: string,
  store: TokenStore,
  onAuthLost: () => void,
): ApiClients {
  return clientsFromTransport(createAuthedTransport(baseUrl, store, onAuthLost));
}
