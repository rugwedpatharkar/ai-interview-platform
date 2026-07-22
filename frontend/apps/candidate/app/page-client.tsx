"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRequireRole } from "@ip/shared";

import { Dashboard } from "../components/dashboard";
import { useAuth } from "../lib/auth";

/**
 * Chooses between the marketing landing and the candidate dashboard at `/`.
 *
 * The landing arrives as server-rendered `children`, so the route ships real HTML.
 * Auth lives in localStorage and cannot be read on the server, so the swap to the
 * dashboard happens after mount: the first client render still shows the landing,
 * which is what keeps hydration matched.
 *
 * The cost is that a signed-in candidate sees the landing for roughly one paint
 * before the dashboard replaces it. That is the deliberate trade — the previous
 * shape avoided the flash by rendering nothing at all on the server, which served
 * an empty body to every crawler and delayed LCP for every visitor. Removing the
 * flash properly needs a server-readable signal (a non-sensitive session-hint
 * cookie set at login), which belongs with the auth work in Phase 7.
 */
export function HomeClient({ children }: { children: ReactNode }) {
  const { token, identity, ready } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // A token from the wrong app (e.g. a recruiter on the candidate origin) would render a
  // dashboard whose every query 403s; bounce it to login instead of a broken page. Pass
  // "candidate" when signed out so the marketing landing still shows (no redirect).
  useRequireRole(token ? identity?.role : "candidate", ["candidate"], ready);

  if (mounted && token) return identity?.role === "candidate" ? <Dashboard /> : null;

  return <>{children}</>;
}
