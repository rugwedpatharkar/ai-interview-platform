// Access+refresh token store, persisted to localStorage and observable by React.
// One store per app (namespaced) — the single source of truth the transport reads live.

export interface Tokens {
  access: string;
  refresh: string;
}

export interface TokenStore {
  get(): Tokens | null;
  set(tokens: Tokens | null): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
}

export function makeTokenStore(namespace: string): TokenStore {
  const key = `ip:${namespace}:tokens`;
  const listeners = new Set<() => void>();

  function read(): Tokens | null {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Tokens;
    } catch {
      return null;
    }
  }

  let current = read();

  function set(tokens: Tokens | null) {
    current = tokens;
    if (typeof window !== "undefined") {
      if (tokens) window.localStorage.setItem(key, JSON.stringify(tokens));
      else window.localStorage.removeItem(key);
    }
    for (const listener of listeners) listener();
  }

  return {
    get: () => current,
    set,
    clear: () => set(null),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
