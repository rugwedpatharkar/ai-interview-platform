import { type Query, QueryClient } from "@tanstack/react-query";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // gRPC errors are mostly deterministic (4xx-equivalent) — don't retry blindly.
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: false,
        // A quick tab-switch shouldn't refire every visible query — the default is
        // useful for consumer news sites, wrong for an interview-heavy dashboard
        // where refocusing after reading a JD would kick off a fan-out of RPCs.
        refetchOnWindowFocus: false,
        // Coming back from a network drop DOES want fresh data.
        refetchOnReconnect: "always",
      },
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
