"use client";

import { Button, Input } from "@ip/ui";
import { Search } from "lucide-react";
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
      className="flex flex-col gap-2 sm:flex-row"
    >
      <label className="sr-only" htmlFor="job-search-q">
        Search jobs
      </label>
      <Input
        id="job-search-q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Job title, company, or keyword"
        className="sm:flex-[2]"
      />
      <label className="sr-only" htmlFor="job-search-location">
        Location
      </label>
      <Input
        id="job-search-location"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        placeholder="Location"
        className="sm:flex-1"
      />
      <Button type="submit" className="shrink-0">
        <Search className="size-4" aria-hidden />
        Search
      </Button>
    </form>
  );
}
