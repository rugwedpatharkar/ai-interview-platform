import { type Query, QueryClient } from "@tanstack/react-query";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // gRPC errors are mostly deterministic (4xx-equivalent) — don't retry blindly.
      queries: { staleTime: 30_000, retry: false },
      mutations: { retry: false },
    },
  });
}

/**
 * `refetchInterval` helper for async backend flows (resume parse, aptitude/report readiness):
 * poll every `intervalMs` until `done(data)` is true, then stop.
 *   useQuery({ ..., refetchInterval: refetchUntil<Profile>((p) => p?.parsed === true) })
 */
export function refetchUntil<T>(
  done: (data: T | undefined) => boolean,
  intervalMs = 2500,
) {
  return (query: Query<T, Error>) => (done(query.state.data) ? false : intervalMs);
}
