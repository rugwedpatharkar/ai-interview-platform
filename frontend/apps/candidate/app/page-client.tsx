"use client";

import { useEffect, useState } from "react";
import { useRequireRole } from "@ip/shared";

import { Dashboard } from "../components/dashboard";
import { MarketingLanding } from "./(marketing)/marketing-landing";
import { useAuth } from "../lib/auth";

export function HomeClient() {
  const { token, identity, ready } = useAuth();
  // Gate on mount so the server render (no localStorage) and first client render match —
  // avoids a hydration mismatch + signed-out flash for logged-in users.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // A token from the wrong app (e.g. a recruiter on the candidate origin) would render a
  // dashboard whose every query 403s; bounce it to login instead of a broken page. Pass
  // "candidate" when signed out so the marketing landing below still shows (no redirect).
  useRequireRole(token ? identity?.role : "candidate", ["candidate"], ready);
  if (!mounted) return null;
  if (token) return identity?.role === "candidate" ? <Dashboard /> : null;

  return <MarketingLanding />;
}
