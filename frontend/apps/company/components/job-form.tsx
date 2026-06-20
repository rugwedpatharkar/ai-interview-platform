"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@ip/ui";
import { type FormEvent, useRef, useState } from "react";

import { EMPTY_JOB_FORM, type JobFormValues } from "../app/jobs/job-form-types";
import { AiSuggestPanel } from "./ai-suggest-panel";
import { GateModeToggle } from "./gate-mode-toggle";

export function parseSkills(raw: string): string[] {
  const seen = new Set<string>();
  for (const s of raw
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean))
    seen.add(s);
  return [...seen];
}

/** Maps form state → the (generated) CreateJob/UpdateJob request shape. Only this adapter
 *  changes when `pnpm gen` lands the additive fields; the component below stays put. The
 *  generated request uses `salaryMin: bigint`, so empty strings coerce to `0n`. */
export function toCreateRequest(v: JobFormValues) {
  return {
    title: v.title.trim(),
    jdText: v.jdText,
    city: v.city.trim(),
    region: v.region.trim(),
    country: v.country.trim(),
    remoteMode: v.remoteMode,
    employmentType: v.employmentType,
    salaryMin: v.salaryMin ? BigInt(v.salaryMin) : 0n,
    salaryMax: v.salaryMax ? BigInt(v.salaryMax) : 0n,
    salaryCurrency: v.salaryCurrency.trim(),
    skills: v.skills,
    gateMode: v.gateMode,
  };
}

const REMOTE = [
  ["remote", "Remote"],
  ["hybrid", "Hybrid"],
  ["onsite", "On-site"],
] as const;
const EMPLOYMENT = [
  ["full_time", "Full-time"],
  ["contract", "Contract"],
  ["internship", "Internship"],
] as const;

// `jdText` is lifted to the parent (so the AI-improved draft flows back into the textarea);
// the rest of the marketplace fields are owned here.
export function JobForm({
  initial = EMPTY_JOB_FORM,
  submitting,
  submitLabel = "Create job",
  onSubmit,
  jdText,
  onJdChange,
  improving,
  suggestions,
  onImprove,
}: {
  initial?: JobFormValues;
  submitting: boolean;
  submitLabel?: string;
  onSubmit: (values: JobFormValues) => void;
  jdText: string;
  onJdChange: (jdText: string) => void;
  improving: boolean;
  suggestions: string[];
  onImprove: (jdText: string) => void;
}) {
  const [v, setV] = useState<JobFormValues>(initial);
  const [skillsRaw, setSkillsRaw] = useState(initial.skills.join(", "));
  const [titleError, setTitleError] = useState<string | null>(null);
  // Synchronous latch: a form can fire submit twice (Enter + click) before React
  // re-renders the pending state, so guard the handler itself, not just the button.
  const latch = useRef(false);
  const set = <K extends keyof JobFormValues>(k: K, val: JobFormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!v.title.trim()) {
      setTitleError("Job title is required.");
      return;
    }
    setTitleError(null);
    if (latch.current) return;
    latch.current = true;
    onSubmit({ ...v, jdText, skills: parseSkills(skillsRaw) });
    latch.current = false;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Role details</CardTitle>
        <CardDescription>What candidates see in the marketplace.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <Field label="Title" htmlFor="title" error={titleError}>
            <Input
              id="title"
              required
              value={v.title}
              aria-invalid={Boolean(titleError) || undefined}
              onChange={(e) => {
                set("title", e.target.value);
                if (titleError) setTitleError(null);
              }}
            />
          </Field>

          <Field label="Job description" htmlFor="jd">
            <Textarea
              id="jd"
              rows={8}
              value={jdText}
              placeholder="Role, responsibilities, and requirements — the AI uses this to build the aptitude test and interview."
              onChange={(e) => onJdChange(e.target.value)}
            />
          </Field>
          <AiSuggestPanel
            improving={improving}
            suggestions={suggestions}
            disabled={!jdText.trim()}
            onImprove={() => onImprove(jdText)}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City" htmlFor="city">
              <Input id="city" value={v.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="Region" htmlFor="region">
              <Input id="region" value={v.region} onChange={(e) => set("region", e.target.value)} />
            </Field>
            <Field label="Country" htmlFor="country">
              <Input
                id="country"
                value={v.country}
                onChange={(e) => set("country", e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Work mode">
              <Select
                value={v.remoteMode || undefined}
                onValueChange={(val) => set("remoteMode", val as JobFormValues["remoteMode"])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {REMOTE.map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Employment type">
              <Select
                value={v.employmentType || undefined}
                onValueChange={(val) =>
                  set("employmentType", val as JobFormValues["employmentType"])
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT.map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Salary min" htmlFor="smin">
              <Input
                id="smin"
                type="number"
                inputMode="numeric"
                value={v.salaryMin}
                onChange={(e) => set("salaryMin", e.target.value)}
              />
            </Field>
            <Field label="Salary max" htmlFor="smax">
              <Input
                id="smax"
                type="number"
                inputMode="numeric"
                value={v.salaryMax}
                onChange={(e) => set("salaryMax", e.target.value)}
              />
            </Field>
            <Field label="Currency" htmlFor="cur">
              <Input
                id="cur"
                value={v.salaryCurrency}
                maxLength={3}
                onChange={(e) => set("salaryCurrency", e.target.value.toUpperCase())}
              />
            </Field>
          </div>

          <Field label="Skills" htmlFor="skills" hint="Comma-separated — e.g. react, typescript, go">
            <Input
              id="skills"
              value={skillsRaw}
              placeholder="react, typescript, go"
              onChange={(e) => setSkillsRaw(e.target.value)}
            />
          </Field>

          <GateModeToggle value={v.gateMode} onChange={(g) => set("gateMode", g)} />

          <Button
            type="submit"
            className="self-start"
            loading={submitting}
            disabled={!v.title.trim() || submitting}
          >
            {submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
