"use client";

import {
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
  useQuery,
} from "@tanstack/react-query";

/**
 * Thin wrapper around TanStack `useQuery` that forces `enabled: false` while
 * the caller has no token, preventing unauthenticated requests on cold load.
 *
 * The caller's `enabled` option (if provided) is ANDed with `Boolean(token)`,
 * so neither gate can be bypassed accidentally.
 *
 *   const data = useAuthedQuery(token, {
 *     queryKey: ["jobs"],
 *     queryFn: () => api.jobs.listJobs({}),
 *   });
 */
export function useAuthedQuery<
  TData = unknown,
  TError = Error,
  TQueryKey extends QueryKey = QueryKey,
>(
  token: string | null,
  options: Omit<UseQueryOptions<TData, TError, TData, TQueryKey>, "enabled"> & {
    enabled?: boolean;
  },
): UseQueryResult<TData, TError> {
  return useQuery({
    ...options,
    enabled: Boolean(token) && (options.enabled ?? true),
  } as UseQueryOptions<TData, TError, TData, TQueryKey>);
}
