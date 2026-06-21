import {
  AuthService,
  type ApiClients,
  aiAgentsClientsFromTransport,
  clientsFromTransport,
} from "@ip/api-client";
import { Code, ConnectError, type Interceptor, createClient } from "@connectrpc/connect";
import { createGrpcWebTransport } from "@connectrpc/connect-web";

import type { TokenStore } from "./tokens.js";

// Last correlation ID returned by any unary RPC, for attaching to client-side telemetry.
let _lastCorrelationId: string | null = null;

export function getLastCorrelationId(): string | null {
  return _lastCorrelationId;
}

// Transport quality event hook — avoids a circular import between transport ↔ observability.
// observability.ts calls registerTransportTracker(track) during initObservability so the
// interceptors can emit api.timeout and api.unauthorized_refresh without importing observability.
type QualityEventName = "api.timeout" | "api.unauthorized_refresh";
type TransportTracker = (name: QualityEventName, props: { service: string; rpc: string }) => void;
let _transportTracker: TransportTracker | null = null;

export function registerTransportTracker(fn: TransportTracker): void {
  _transportTracker = fn;
}

// One in-flight refresh per token store, shared across BOTH transports (admin + ai-agents)
// that bind the same store. A 401 on an admin RPC and a 401 on an ai-agents RPC that race
// must share a single rotation instead of each spending the (single-use) refresh token —
// the second would reuse a now-rotated token and spuriously log the user out. WeakMap so a
// torn-down app's promise is collectable with its store.
const inflightByStore = new WeakMap<TokenStore, Promise<boolean>>();

// Monotonic counter: incremented on every successful token rotation. Callers capture their
// seen value before refreshing; if the counter advanced since they captured it, a concurrent
// caller already rotated — they skip their own rotation (3-way race guard).
const rotationCountByStore = new WeakMap<TokenStore, number>();
function rotationCount(store: TokenStore): number {
  return rotationCountByStore.get(store) ?? 0;
}
function bumpRotation(store: TokenStore): void {
  rotationCountByStore.set(store, (rotationCountByStore.get(store) ?? 0) + 1);
}

// Sentinel for transient (5xx / network / malformed-body) refresh errors: keep the store,
// let the original 401 surface — only a genuine auth rejection clears + redirects.
class TransientRefreshError extends Error {}

/**
 * Refresh the access token for `store`, single-flight across all transports sharing it.
 * Password sessions rotate via the gRPC Refresh RPC; SSO sessions via the HttpOnly cookie
 * endpoint — BOTH live on the admin origin (`refreshBaseUrl`), even when the failing RPC
 * was on the ai-agents transport. On a genuine failure: clear the store + `onAuthLost`.
 */
function refreshToken(
  store: TokenStore,
  refreshBaseUrl: string,
  onAuthLost: () => void,
): Promise<boolean> {
  const pending = inflightByStore.get(store);
  if (pending) return pending;
  const run = (async () => {
    try {
      const stored = store.get();
      if (stored?.refresh) {
        const bare = createGrpcWebTransport({ baseUrl: refreshBaseUrl });
        const res = await createClient(AuthService, bare).refresh({
          refreshToken: stored.refresh,
        });
        store.set({ access: res.accessToken, refresh: res.refreshToken });
      } else {
        // SSO session: the refresh token is an HttpOnly cookie the SPA can't read — rotate
        // via the cookie endpoint (credentials included); the refresh stays in the cookie.
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 8000);
        let res: Response;
        try {
          res = await fetch(`${refreshBaseUrl}/auth/oauth/refresh`, {
            method: "POST",
            credentials: "include",
            signal: controller.signal,
          });
        } finally {
          window.clearTimeout(timer);
        }
        if (!res.ok) {
          if (res.status >= 500)
            throw new TransientRefreshError(`cookie refresh transient (${res.status})`);
          throw new Error(`cookie refresh rejected (${res.status})`);
        }
        const data = (await res.json().catch(() => {
          throw new TransientRefreshError("cookie refresh: malformed response body");
        })) as { access_token?: unknown };
        if (typeof data.access_token !== "string" || !data.access_token) {
          throw new Error("cookie refresh: missing access_token");
        }
        store.set({ access: data.access_token, refresh: "" });
      }
      bumpRotation(store);
      return true;
    } catch (err) {
      if (err instanceof TransientRefreshError) {
        console.warn("transport: transient refresh failure, store preserved", err.message);
        return false;
      }
      store.clear();
      onAuthLost();
      return false;
    } finally {
      inflightByStore.delete(store);
    }
  })();
  inflightByStore.set(store, run);
  return run;
}

/**
 * gRPC-web transport that attaches the bearer token and, on `Unauthenticated`, silently
 * refreshes once (single-flight across transports) and retries. `baseUrl` is where the RPCs
 * go; `refreshBaseUrl` is the admin origin that serves the refresh RPC + cookie endpoint
 * (equal to `baseUrl` for the admin transport; the admin origin for the ai-agents transport).
 *
 * Note: this catch only fires for unary RPCs (and streaming setup errors). A gRPC-web
 * SERVER-STREAM carries auth failures in the trailer, surfaced during iteration — outside
 * this interceptor — so streaming callers (chat) handle that retry themselves.
 */
export function createAuthedTransport(
  baseUrl: string,
  refreshBaseUrl: string,
  store: TokenStore,
  onAuthLost: () => void,
) {
  const correlationInterceptor: Interceptor = (next) => async (req) => {
    const res = await next(req);
    const cid = res.header.get("x-correlation-id");
    if (cid) _lastCorrelationId = cid;
    return res;
  };

  const interceptor: Interceptor = (next) => async (req) => {
    const sent = store.get()?.access;
    // Capture the rotation counter before the RPC so we can detect a concurrent rotation.
    const seenRotation = rotationCount(store);
    if (sent) req.header.set("Authorization", `Bearer ${sent}`);
    const rpcCtx = {
      service: req.method.parent.typeName,
      rpc: req.method.name,
    };
    try {
      return await next(req);
    } catch (err) {
      if (!(err instanceof ConnectError)) throw err;
      if (err.code === Code.DeadlineExceeded) {
        _transportTracker?.("api.timeout", rpcCtx);
        throw err;
      }
      if (err.code !== Code.Unauthenticated) throw err;
      // A concurrent request may have already refreshed — if the token changed OR the
      // rotation counter advanced, retry with the current token without rotating again
      // (reusing a now-rotated refresh token would fail and spuriously log the user out).
      const current = store.get()?.access;
      if ((current && current !== sent) || rotationCount(store) !== seenRotation) {
        if (current) req.header.set("Authorization", `Bearer ${current}`);
        return await next(req);
      }
      if (sent && (await refreshToken(store, refreshBaseUrl, onAuthLost))) {
        _transportTracker?.("api.unauthorized_refresh", rpcCtx);
        const fresh = store.get()?.access;
        if (fresh) req.header.set("Authorization", `Bearer ${fresh}`);
        return await next(req);
      }
      throw err;
    }
  };

  return createGrpcWebTransport({ baseUrl, interceptors: [interceptor, correlationInterceptor] });
}

/**
 * Build the full client set: admin clients on the admin transport + ai-agents clients on a
 * second transport, both sharing the token store + the single-flight refresh keyed by it.
 */
export function createClients(
  adminBaseUrl: string,
  aiAgentsBaseUrl: string,
  store: TokenStore,
  onAuthLost: () => void,
): ApiClients {
  const adminTransport = createAuthedTransport(adminBaseUrl, adminBaseUrl, store, onAuthLost);
  const aiAgentsTransport = createAuthedTransport(
    aiAgentsBaseUrl,
    adminBaseUrl,
    store,
    onAuthLost,
  );
  return {
    ...clientsFromTransport(adminTransport),
    ...aiAgentsClientsFromTransport(aiAgentsTransport),
  };
}
