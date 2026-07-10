"use client";

import Link from "next/link";

/**
 * Audience switcher for the two primary landings — Candidates (/) is primary,
 * Hiring Teams (/hiring-teams) is one tap away. Rendered inside the `.lucent` nav
 * of both landings; styled by `.lucent .aud-switch` in globals.css.
 */
export function AudienceSwitch({ active }: { active: "candidates" | "hiring" }) {
  return (
    <div className="aud-switch" role="group" aria-label="Choose what you're here for">
      <Link
        href="/"
        className={active === "candidates" ? "on" : undefined}
        aria-current={active === "candidates" ? "page" : undefined}
      >
        For candidates
      </Link>
      <Link
        href="/hiring-teams"
        className={active === "hiring" ? "on" : undefined}
        aria-current={active === "hiring" ? "page" : undefined}
      >
        For hiring teams
      </Link>
    </div>
  );
}
