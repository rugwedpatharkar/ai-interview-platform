"use client";

import { Component, type ReactNode } from "react";

interface Props {
  fallback: ReactNode;
  children: ReactNode;
}

interface State {
  caught: boolean;
}

/**
 * Reusable class-component error boundary. Wraps compound subtrees that own
 * their own async state (e.g. ChatWindow) so an unhandled exception doesn't
 * unmount the entire page — the route-level app/error.tsx handles page-level
 * crashes; this handles component-level ones.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { caught: false };

  static getDerivedStateFromError(): State {
    return { caught: true };
  }

  override render() {
    if (this.state.caught) return this.props.fallback;
    return this.props.children;
  }
}
