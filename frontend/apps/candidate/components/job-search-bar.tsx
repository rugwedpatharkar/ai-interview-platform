"use client";

import { Button, Input } from "@ip/ui";
import { MapPin, Search } from "lucide-react";
import { useState } from "react";

import type { SearchJobsParams } from "../app/jobs/types";

/** Keyword + location search bar. Controlled by the parent's params; submitting
 * merges `q`/`location` into the current params and resets to page 1. A real
 * `<form>` (Enter submits; inputs are labelled) for crawlability + a11y. */
export function JobSearchBar({
  value,
  onSearch,
}: {
  value: SearchJobsParams;
  onSearch: (params: SearchJobsParams) => void;
}) {
  const [q, setQ] = useState(value.q ?? "");
  const [location, setLocation] = useState(value.location ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSearch({ ...value, q: q.trim() || undefined, location: location.trim() || undefined, page: 1 });
      }}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <label className="sr-only" htmlFor="job-search-q">
        Search jobs
      </label>
      <div className="flex items-center gap-2 rounded-lg border border-input bg-surface px-3 shadow-sm transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40 sm:flex-[2]">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          id="job-search-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Job title, skill, or company"
          className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
        />
      </div>
      <label className="sr-only" htmlFor="job-search-location">
        Location
      </label>
      <div className="flex items-center gap-2 rounded-lg border border-input bg-surface px-3 shadow-sm transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40 sm:flex-1">
        <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          id="job-search-location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Location or remote"
          className="h-9 border-0 bg-transparent px-0 shadow-none focus-visible:border-0 focus-visible:ring-0"
        />
      </div>
      <Button type="submit" size="sm" className="shrink-0">
        <Search className="size-4" aria-hidden />
        Search
      </Button>
    </form>
  );
}
