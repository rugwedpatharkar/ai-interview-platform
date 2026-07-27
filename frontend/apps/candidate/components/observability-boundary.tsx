"use client";

import { Component, type ErrorInfo, type ReactNode, useEffect, useRef } from "react";

import { initObservability, recordError } from "@ip/shared";

import { useAuth } from "../lib/auth";

// ── ObservabilityProvider ─────────────────────────────────────────────────────
// Calls initObservability once after the auth API client is available. Uses a
// ref to guard against re-init on token refreshes (api is stable via useMemo).

export function ObservabilityProvider({ children }: { children: ReactNode }) {
  const { api } = useAuth();
  const inited = useRef(false);
  useEffect(() => {
    if (inited.current || !api) return;
    initObservability({
      buildSha: process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev",
      client: { observability: api.observability },
    });
    inited.current = true;
  }, [api]);
  return <>{children}</>;
}

// ── ObservabilityBoundary ─────────────────────────────────────────────────────
// Class component — required by React for error boundaries. Catches render
// errors and forwards them to recordError before rendering the fallback.
// Wrap this outside ObservabilityProvider so render errors are captured even if
// the provider hasn't mounted yet (recordError is a no-op when not inited).

interface BoundaryState {
  caught: boolean;
}

export class ObservabilityBoundary extends Component<
  { children: ReactNode },
  BoundaryState
> {
  override state: BoundaryState = { caught: false };

  static getDerivedStateFromError(): BoundaryState {
    return { caught: true };
  }

  override componentDidCatch(err: Error, info: ErrorInfo): void {
    recordError(err, { component: info.componentStack?.split("\n")[1]?.trim() ?? "unknown" });
  }

  override render(): ReactNode {
    if (this.state.caught) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Something went wrong. Try again — or refresh if it keeps happening.
          </p>
          <div className="flex gap-2">
            <button
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              onClick={() => this.setState({ caught: false })}
            >
              Try again
            </button>
            <button
              className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground"
              onClick={() => window.location.reload()}
            >
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
