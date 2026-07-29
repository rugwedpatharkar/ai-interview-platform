"use client";

import { type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRequireRole } from "@ip/shared";

import { useAuth } from "../lib/auth";

// The dashboard is a signed-in-only surface. Every visitor to the marketing
// landing was pulling ~40+ kB of dashboard code they never rendered. Lazy-load
// so signed-out visitors pay nothing and signed-in candidates pay only once
// the auth token has resolved and we know we're going to mount it.
const Dashboard = dynamic(
  () => import("../components/dashboard").then((m) => m.Dashboard),
  { ssr: false, loading: () => null },
);

/**
 * Chooses between the marketing landing and the candidate dashboard at `/`.
 *
 * The landing arrives as server-rendered `children`, so the route ships real HTML.
 * Auth lives in localStorage and cannot be read on the server, so the swap to the
 * dashboard happens after mount: `ready` flips true once the persisted token has
 * been read, at which point we either render the dashboard (candidate token) or
 * fall through to the landing (signed out, wrong-role token being redirected).
 *
 * A signed-in candidate sees the landing for one paint before the dashboard
 * replaces it. Removing that flash properly needs a server-readable session hint
 * (Phase 7). Falling through to the landing in the wrong-role branch avoids the
 * previous blank-white paint while useRequireRole navigates to /login.
 */
export function HomeClient({ children }: { children: ReactNode }) {
  const { token, identity, ready } = useAuth();
  useRequireRole(token ? identity?.role : "candidate", ["candidate"], ready);

  if (ready && token && identity?.role === "candidate") return <Dashboard />;

  return <>{children}</>;
}
