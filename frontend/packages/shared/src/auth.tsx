"use client";

import type { ApiClients } from "@ip/api-client";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { registerRestAuth } from "./authed-fetch.js";
import { makeTokenStore } from "./tokens.js";
import { createClients } from "./transport.js";

export interface Identity {
  id: string;
  role: string; // candidate | recruiter | company_admin
  compId: string;
}

export interface AuthState {
  token: string | null;
  // True once the persisted token has been read post-mount. Guards hold their redirect
  // until this flips so they don't bounce an authed user during the first (token-less)
  // client render that must match SSR. See AuthProvider.
  ready: boolean;
  identity: Identity | null;
  api: ApiClients;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export interface AuthConfig {
  baseUrl: string;
  namespace: string; // localStorage scope, e.g. "candidate" | "company"
  // Optional: some apps (company) register with extra fields and call registerCompany +
  // login directly, so they don't provide this. Then AuthState.register throws.
  register?: (api: ApiClients, email: string, password: string) => Promise<unknown>;
  // Where to send the user when the session is lost (refresh failed). Default "/login".
  loginPath?: string;
}

function decodeIdentity(jwt: string): Identity | null {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as {
      sub?: string;
      role?: string;
      comp_id?: string;
    };
    if (!payload.sub || !payload.role) return null;
    return { id: payload.sub, role: payload.role, compId: payload.comp_id ?? "" };
  } catch {
    return null;
  }
}

/** Build an app-specific AuthProvider + useAuth bound to a token namespace + register RPC. */
export function makeAuth(config: AuthConfig) {
  const store = makeTokenStore(config.namespace);
  const loginPath = config.loginPath ?? "/login";
  const AuthContext = createContext<AuthState | null>(null);

  // On a failed token refresh the transport clears the store and calls this; redirect to
  // the login screen so a lost session doesn't strand the user on a now-tokenless page.
  function onAuthLost() {
    if (typeof window !== "undefined") window.location.assign(loginPath);
  }

  // The REST clients (interview/chat/jd/proctor) share this store but hit ai-agents, while
  // refresh lives on the admin origin (config.baseUrl). Register both here so authedFetch can
  // refresh + recover identically to the gRPC transport without changing the client factories'
  // (baseUrl, store) signatures.
  registerRestAuth({ store, refreshUrl: config.baseUrl, onAuthLost });

  function AuthProvider({ children }: { children: ReactNode }) {
    // Start null so the server render (no localStorage) and the first client render agree;
    // read the persisted token after mount, then track changes. This is what prevents a
    // hydration mismatch on every auth-gated page (`if (!token) return null`).
    const [token, setToken] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    useEffect(() => {
      setToken(store.get()?.access ?? null);
      setReady(true);
      return store.subscribe(() => setToken(store.get()?.access ?? null));
    }, []);

    const api = useMemo(
      () => createClients(config.baseUrl, store, onAuthLost),
      [],
    );
    const identity = useMemo(() => (token ? decodeIdentity(token) : null), [token]);

    const login = useCallback(
      async (email: string, password: string) => {
        const res = await api.auth.login({ email, password });
        store.set({ access: res.accessToken, refresh: res.refreshToken });
      },
      [api],
    );

    const register = useCallback(
      async (email: string, password: string) => {
        if (!config.register) throw new Error("registration not supported here");
        await config.register(api, email, password);
        await login(email, password);
      },
      [api, login],
    );

    const logout = useCallback(() => store.clear(), []);

    const value = useMemo(
      () => ({ token, ready, identity, api, login, register, logout }),
      [token, ready, identity, api, login, register, logout],
    );
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  function useAuth(): AuthState {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
    return ctx;
  }

  // `store` is returned so other token consumers (e.g. the interview REST client) share it.
  return { AuthProvider, useAuth, store };
}
