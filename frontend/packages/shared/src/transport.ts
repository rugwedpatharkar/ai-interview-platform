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
          if (!res.ok) throw new Error("cookie refresh failed");
          const data = (await res.json()) as { access_token: string };
          store.set({ access: data.access_token, refresh: "" });
        }
        return true;
      } catch {
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
