"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

// The ONLY interactive island in the candidate marketing hero — pulled out of
// the (formerly 900+ LOC) client tree so the surrounding CandidateBody can be
// a Server Component. Ships ~4 kB of JS instead of the whole marketing page.
export function LandingSearchIsland() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("");

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (loc.trim()) params.set("location", loc.trim());
    router.push(`/jobs${params.toString() ? `?${params}` : ""}`);
  }

  return (
    <form className="search glass irid-edge" role="search" aria-label="Search roles" onSubmit={onSearch}>
      <div className="field">
        <span className="fi" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.2-3.2" />
          </svg>
        </span>
        <label className="sr-only" htmlFor="q">Job title or skill</label>
        <input id="q" value={q} onChange={(e) => setQ(e.target.value)} type="text" placeholder="Job title or skill" autoComplete="off" />
      </div>
      <div className="field">
        <span className="fi" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 10c0 5-8 11-8 11s-8-6-8-11a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="2.6" />
          </svg>
        </span>
        <label className="sr-only" htmlFor="loc">Location</label>
        <input id="loc" value={loc} onChange={(e) => setLoc(e.target.value)} type="text" placeholder="Location" autoComplete="off" />
      </div>
      <button className="btn btn-primary btn-hero" type="submit">Search</button>
    </form>
  );
}
