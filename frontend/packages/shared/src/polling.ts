/**
 * Reusable polling backoff for Tanstack Query's refetchInterval. Exponential growth
 * with optional jitter, clamped to capMs, stops after maxPolls. The whole reason this
 * lives in @ip/shared is so every long-poll site in the app uses the same backoff
 * curve and the same hard cap — no more "we poll every 3s forever" surprises.
 */
export interface PollingBackoffOptions {
  initialMs: number;
  capMs: number;
  maxPolls: number;
  jitterRatio?: number;
}

interface QueryLike {
  state: { dataUpdateCount: number; status: string };
}

export function pollingBackoff(
  opts: PollingBackoffOptions,
): (query: QueryLike) => number | false {
  const { initialMs, capMs, maxPolls, jitterRatio = 0.15 } = opts;
  return (query) => {
    const n = query.state.dataUpdateCount;
    if (n >= maxPolls) return false;
    const base = Math.min(initialMs * 2 ** n, capMs);
    const jitter = base * jitterRatio * Math.random();
    return Math.round(base + jitter);
  };
}
