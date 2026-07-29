"use client";

import { useAuthedQuery } from "@ip/shared";
import Link from "next/link";

import { useAuth } from "../../../lib/auth";

/** Signed-in-only skill-gap chip strip on the JD sidebar. Compares the
 *  candidate's profile skills against the JD's declared skills and paints
 *  matched / missing chips + a one-tap "Add {missing[0]} to your profile"
 *  link that opens the profile editor. Renders nothing when signed out,
 *  when either side has no skills, or when the profile query is loading. */
export function SkillGapIsland({ jobSkills }: { jobSkills: string[] }) {
  const { api, token } = useAuth();
  const profile = useAuthedQuery(token, {
    queryKey: ["profile"],
    queryFn: () => api.profile.getProfile({}),
    staleTime: 60_000,
  });

  if (!token || jobSkills.length === 0) return null;
  const profileSkills = (profile.data?.skills as string[] | undefined) ?? [];
  if (profile.isLoading || profileSkills.length === 0) return null;

  const normalize = (s: string) => s.trim().toLowerCase();
  const jobSet = new Set(jobSkills.map(normalize));
  const profSet = new Set(profileSkills.map(normalize));
  const matched = jobSkills.filter((s) => profSet.has(normalize(s)));
  const missing = jobSkills.filter((s) => !profSet.has(normalize(s)));

  return (
    <div className="border-t border-line pt-4">
      <p className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-ink-3">
        Your skill fit
      </p>
      <p className="mt-2 text-sm">
        <span className="font-semibold tabular-nums text-foreground">
          {matched.length}/{jobSkills.length}
        </span>{" "}
        <span className="text-ink-2">skills matched</span>
      </p>
      {matched.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {matched.map((s) => (
            <span
              key={s}
              className="rounded-full bg-brand-soft px-2 py-0.5 text-[0.72rem] font-medium text-brand-strong"
            >
              {s}
            </span>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <>
          <p className="mt-3 text-[0.78rem] text-ink-3">Not on your profile</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {missing.slice(0, 6).map((s) => (
              <span
                key={s}
                className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.72rem] text-ink-2"
              >
                {s}
              </span>
            ))}
          </div>
          <Link
            href="/profile"
            className="mt-3 inline-flex text-[0.78rem] font-medium text-brand-strong hover:underline"
          >
            {jobSkills.length && jobSkills[0] ? `Add ${missing[0]} to your profile →` : "Update your profile →"}
          </Link>
        </>
      )}
    </div>
  );
}
