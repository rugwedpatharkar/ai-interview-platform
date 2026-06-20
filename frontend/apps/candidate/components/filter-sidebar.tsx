"use client";

import { Button, Checkbox, cn } from "@ip/ui";
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

/** Mono uppercase facet heading — matches the `.facet-h` label in the mockup. */
function FacetHeading({ children }: { children: string }) {
  return (
    <span className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
      {children}
    </span>
  );
}

/** A chip-toggle facet group (work mode, skills). Each bucket is an `aria-pressed`
 * pill; pressed reads as `border-primary bg-primary/10 text-primary`. Single-select
 * per group (clicking the active value clears it) — mirrors the scalar param. */
function ChipFacetGroup({
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
  if (buckets.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <FacetHeading>{heading}</FacetHeading>
      <div className="flex flex-wrap gap-2">
        {buckets.map((b) => {
          const on = selected === b.value;
          return (
            <button
              key={b.value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(b.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                on
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface text-foreground hover:bg-surface-muted",
              )}
            >
              {labelFor(labels, b.value)}
              <span className="font-mono text-[0.72rem] tabular-nums text-muted-foreground">
                {b.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A single facet group rendered as checkbox rows (employment type, experience
 * level). Single-select per group (clicking the active value clears it). */
function CheckFacetGroup({
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
    <fieldset className="flex flex-col gap-3">
      <legend>
        <FacetHeading>{heading}</FacetHeading>
      </legend>
      {buckets.map((b) => {
        const id = `${groupId}-${b.value}`;
        return (
          <label
            key={b.value}
            htmlFor={id}
            className="flex cursor-pointer items-center gap-3 text-sm text-foreground"
          >
            <Checkbox
              id={id}
              checked={selected === b.value}
              onCheckedChange={() => onToggle(b.value)}
            />
            <span className="flex-1">{labelFor(labels, b.value)}</span>
            <span className="font-mono text-[0.72rem] tabular-nums text-muted-foreground">
              {b.count}
            </span>
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
    <aside
      className="flex flex-col gap-6 md:sticky md:top-6"
      aria-label="Filters"
    >
      {!hasAny ? (
        <p className="text-sm text-muted-foreground">No filters available.</p>
      ) : (
        <>
          <ChipFacetGroup
            heading="Work mode"
            buckets={remote}
            selected={value.remote}
            labels={REMOTE_LABEL}
            onToggle={(v) =>
              set("remote", value.remote === v ? undefined : (v as RemoteMode))
            }
          />
          <CheckFacetGroup
            heading="Employment type"
            buckets={types}
            selected={value.type}
            labels={TYPE_LABEL}
            onToggle={(v) => set("type", value.type === v ? undefined : v)}
          />
          <CheckFacetGroup
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
