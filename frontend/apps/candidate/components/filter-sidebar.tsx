"use client";

import { Button, Checkbox } from "@ip/ui";
import { useId } from "react";

import type { FacetBucket, RemoteMode, SearchJobsParams } from "../app/jobs/types";

const REMOTE_LABEL: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
};
const TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  internship: "Internship",
};
const labelFor = (map: Record<string, string>, v: string) =>
  map[v] ?? v.replace(/_/g, " ");

/** A single facet group: a heading + a checkbox per bucket. Single-select per group
 * (clicking the active value clears it) — mirrors the scalar `remote`/`type`/`level`
 * params. Buckets with their count; empty groups render nothing. */
function FacetGroup({
  heading,
  buckets,
  selected,
  labels,
  onToggle,
}: {
  heading: string;
  buckets: FacetBucket[];
  selected: string | undefined;
  labels: Record<string, string>;
  onToggle: (value: string) => void;
}) {
  const groupId = useId();
  if (buckets.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {heading}
      </legend>
      {buckets.map((b) => {
        const id = `${groupId}-${b.value}`;
        return (
          <label key={b.value} htmlFor={id} className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              id={id}
              checked={selected === b.value}
              onCheckedChange={() => onToggle(b.value)}
            />
            <span className="flex-1">{labelFor(labels, b.value)}</span>
            <span className="text-xs text-muted-foreground">{b.count}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

/** Controlled facet filters. Reads the live `facets` (counts) and the active
 * `params`; each toggle merges the change into `params` and resets to page 1. */
export function FilterSidebar({
  facets,
  value,
  onChange,
}: {
  facets?: {
    remoteMode: FacetBucket[];
    employmentType: FacetBucket[];
    experienceLevel: FacetBucket[];
  };
  value: SearchJobsParams;
  onChange: (params: SearchJobsParams) => void;
}) {
  const set = <K extends keyof SearchJobsParams>(key: K, next: SearchJobsParams[K]) =>
    onChange({ ...value, [key]: next, page: 1 });

  const remote = facets?.remoteMode ?? [];
  const types = facets?.employmentType ?? [];
  const levels = facets?.experienceLevel ?? [];
  const hasAny = remote.length || types.length || levels.length;
  const active = value.remote || value.type || value.level;

  return (
    <aside className="flex flex-col gap-5" aria-label="Filters">
      {!hasAny ? (
        <p className="text-sm text-muted-foreground">No filters available.</p>
      ) : (
        <>
          <FacetGroup
            heading="Work mode"
            buckets={remote}
            selected={value.remote}
            labels={REMOTE_LABEL}
            onToggle={(v) =>
              set("remote", value.remote === v ? undefined : (v as RemoteMode))
            }
          />
          <FacetGroup
            heading="Employment type"
            buckets={types}
            selected={value.type}
            labels={TYPE_LABEL}
            onToggle={(v) => set("type", value.type === v ? undefined : v)}
          />
          <FacetGroup
            heading="Experience level"
            buckets={levels}
            selected={value.level}
            labels={{}}
            onToggle={(v) => set("level", value.level === v ? undefined : v)}
          />
          {active && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start px-0"
              onClick={() =>
                onChange({ ...value, remote: undefined, type: undefined, level: undefined, page: 1 })
              }
            >
              Clear filters
            </Button>
          )}
        </>
      )}
    </aside>
  );
}
