"use client";

import { Badge, Field, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, toast } from "@ip/ui";
import { errorMessage, useRequireRole } from "@ip/shared";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { CompanyShell } from "../../../../components/company-shell";
import { useAuth } from "../../../../lib/auth";
import { useDraftForm } from "../../../../lib/use-draft-form";
import {
  EMPTY_JOB_FORM,
  type GateMode,
  type JobFormValues,
  parseSkills,
} from "../job-form-types";

/* ============================================================
   APTURA · v3 — Post a job (`/company/jobs/new`)
   Multi-section form, each section in an .ap-cell--anchor. AI
   JD assist via `jd.improveJd`. Submit → CreateJob → router.push
   to the pipeline.
   ============================================================ */

const REMOTE: ReadonlyArray<[JobFormValues["remoteMode"], string]> = [
  ["remote", "Remote"],
  ["hybrid", "Hybrid"],
  ["onsite", "On-site"],
];
const EMPLOYMENT: ReadonlyArray<[JobFormValues["employmentType"], string]> = [
  ["full_time", "Full-time"],
  ["contract", "Contract"],
  ["internship", "Internship"],
];

export default function PostJobPage() {
  const { api, token, identity, ready } = useAuth();
  useRequireRole(identity?.role, ["recruiter", "company_admin"], ready);
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Draft persistence — a stray refresh mid-post no longer discards 20 minutes
  // of role writing. Keyed by identity so a shared browser doesn't cross-leak
  // drafts between recruiters on the same machine.
  const draftKey = `job:new:${identity?.id ?? "anon"}`;
  const draft = useDraftForm(draftKey, {
    v: EMPTY_JOB_FORM,
    skillsRaw: "",
  });
  const v = draft.values.v;
  const skillsRaw = draft.values.skillsRaw;
  const setV = (updater: JobFormValues | ((prev: JobFormValues) => JobFormValues)) =>
    draft.setValues((s) => ({
      ...s,
      v: typeof updater === "function" ? (updater as (p: JobFormValues) => JobFormValues)(s.v) : updater,
    }));
  const setSkillsRaw = (next: string) => draft.setValues((s) => ({ ...s, skillsRaw: next }));
  // Parse once per skillsRaw change — was being recomputed on every render in
  // three JSX sites AND on submit; memoising here keeps them in sync and drops
  // the redundant work on unrelated re-renders.
  const skills = useMemo(() => parseSkills(skillsRaw), [skillsRaw]);
  // Snapshot of pre-improve JD so the AI's edit can be reverted in one click.
  const previousJdText = useRef<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [titleError, setTitleError] = useState<string | null>(null);
  // Sync latch: a form can fire submit twice (Enter + click) before React rerenders the
  // pending state; guard the handler itself, not just the button.
  const latch = useRef(false);
  const set = <K extends keyof JobFormValues>(k: K, val: JobFormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  const create = useMutation({
    mutationFn: () => {
      // Salary inputs are text ("120000" or "") so we can distinguish empty from
      // zero — the proto is int64/bigint so guard the empty case and coerce.
      const toBig = (s: string): bigint => {
        const n = Number(s);
        return Number.isFinite(n) && n > 0 ? BigInt(Math.trunc(n)) : 0n;
      };
      return api.jobs.createJob({
        title: v.title.trim(),
        jdText: v.jdText,
        city: v.city.trim(),
        region: v.region.trim(),
        country: v.country.trim(),
        remoteMode: v.remoteMode || "",
        employmentType: v.employmentType || "",
        salaryMin: toBig(v.salaryMin),
        salaryMax: toBig(v.salaryMax),
        salaryCurrency: v.salaryCurrency || "",
        skills,
        gateMode: v.gateMode,
      });
    },
    onSuccess: (res) => {
      // Clear the persisted draft — a saved job shouldn't rehydrate next visit.
      draft.clear();
      toast.success("Job created");
      router.push(`/company/jobs/${res.jobId}`);
    },
    onError: (err) => {
      latch.current = false;
      toast.error(errorMessage(err));
    },
  });

  const improve = useMutation({
    mutationFn: () => {
      // Snapshot BEFORE the mutation so we always have something to revert to
      // even if the user clicks Improve twice in a row without reading the diff.
      previousJdText.current = v.jdText;
      return api.jd.improveJd({ brief: v.jdText });
    },
    onSuccess: (draft) => {
      set("jdText", draft.jdText);
      setSuggestions(draft.suggestions);
      toast.success("Draft improved · Revert available");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const canRevertJd = previousJdText.current !== null;
  const revertJd = () => {
    if (previousJdText.current === null) return;
    set("jdText", previousJdText.current);
    previousJdText.current = null;
    setSuggestions([]);
    toast.info("Reverted to your original draft");
  };

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!v.title.trim()) {
      setTitleError("Job title is required.");
      return;
    }
    setTitleError(null);
    if (latch.current) return;
    latch.current = true;
    create.mutate();
  }

  if (!mounted) return null;
  if (!token || (identity?.role !== "recruiter" && identity?.role !== "company_admin")) {
    return null;
  }

  return (
    <CompanyShell>
      <div className="ap-section-head">
        <span className="ap-eyebrow">New role</span>
        <h1 className="ap-h2">Post a job</h1>
        <p className="ap-lead">
          What you write here drives the aptitude test, the interview, and the
          competency rubric. Be specific about the role and the constraints — the
          system uses your words as the ground truth.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
        {/* SECTION 1 — Role */}
        <section className="ap-cell ap-cell--anchor">
          <span className="ap-cell-tag">Section 1 · Role</span>
          <h2 className="ap-h3 mb-1">What are you hiring for?</h2>
          <p className="text-sm text-ink-2">The title candidates see on the role page.</p>
          <div className="mt-5 grid gap-4">
            <Field label="Job title" htmlFor="title" error={titleError}>
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
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="City" htmlFor="city">
                <Input id="city" value={v.city} onChange={(e) => set("city", e.target.value)} />
              </Field>
              <Field label="Region" htmlFor="region">
                <Input id="region" value={v.region} onChange={(e) => set("region", e.target.value)} />
              </Field>
              <Field label="Country" htmlFor="country">
                <Input id="country" value={v.country} onChange={(e) => set("country", e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Work mode">
                <Select value={v.remoteMode || undefined} onValueChange={(val) => set("remoteMode", val as JobFormValues["remoteMode"])}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {REMOTE.map(([val, label]) => (
                      <SelectItem key={val} value={val as string}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Employment type">
                <Select value={v.employmentType || undefined} onValueChange={(val) => set("employmentType", val as JobFormValues["employmentType"])}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT.map(([val, label]) => (
                      <SelectItem key={val} value={val as string}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Salary min" htmlFor="smin">
                <Input id="smin" type="number" inputMode="numeric" value={v.salaryMin} onChange={(e) => set("salaryMin", e.target.value)} />
              </Field>
              <Field label="Salary max" htmlFor="smax">
                <Input id="smax" type="number" inputMode="numeric" value={v.salaryMax} onChange={(e) => set("salaryMax", e.target.value)} />
              </Field>
              <Field label="Currency" htmlFor="cur">
                <Input id="cur" value={v.salaryCurrency} maxLength={3} onChange={(e) => set("salaryCurrency", e.target.value.toUpperCase())} />
              </Field>
            </div>
          </div>
        </section>

        {/* SECTION 2 — Requirements (JD + AI assist) */}
        <section className="ap-cell ap-cell--anchor">
          <span className="ap-cell-tag">Section 2 · Requirements</span>
          <h2 className="ap-h3 mb-1">Describe the role</h2>
          <p className="text-sm text-ink-2">
            Responsibilities, must-haves, and the constraints that matter. The AI reads
            this to build the aptitude test and interview.
          </p>
          <div className="mt-5 grid gap-4">
            <Field label="Job description" htmlFor="jd">
              <Textarea
                id="jd"
                rows={10}
                value={v.jdText}
                placeholder="Role, responsibilities, and requirements — the AI uses this to build the aptitude test and interview."
                onChange={(e) => set("jdText", e.target.value)}
              />
            </Field>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => improve.mutate()}
                  disabled={!v.jdText.trim() || improve.isPending}
                  className="ap-btn ap-btn-ghost ap-btn-sm"
                >
                  <Sparkles className="size-4" aria-hidden />
                  {improve.isPending ? "Improving…" : "Improve with AI"}
                </button>
                {canRevertJd && (
                  <button
                    type="button"
                    onClick={revertJd}
                    className="ap-btn ap-btn-ghost ap-btn-sm"
                  >
                    Revert to my draft
                  </button>
                )}
              </div>
              <span className="text-xs text-ink-3">
                Polish the description with AI before posting.
                {canRevertJd && " Your original is one click away."}
              </span>
            </div>
            {suggestions.length > 0 && (
              <div className="rounded-lg border border-line bg-surface-2 p-3 text-sm">
                <p className="font-semibold text-ink-deep">Suggestions</p>
                <ul className="mt-1 list-disc pl-5 text-ink-2">
                  {suggestions.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </div>
            )}
            <Field label="Skills" htmlFor="skills" hint="Comma-separated — e.g. react, typescript, go">
              <Input
                id="skills"
                value={skillsRaw}
                placeholder="react, typescript, go"
                onChange={(e) => setSkillsRaw(e.target.value)}
              />
              {skills.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {skills.map((s) => (
                    <Badge key={s} tone="neutral">{s}</Badge>
                  ))}
                </div>
              )}
            </Field>
          </div>
        </section>

        {/* SECTION 3 — Rubric */}
        <section className="ap-cell ap-cell--anchor">
          <span className="ap-cell-tag">Section 3 · Rubric</span>
          <h2 className="ap-h3 mb-1">How the interview is scored</h2>
          <p className="text-sm text-ink-2">
            Aptura&apos;s Core 6 rubric (Problem framing · Communication · Domain knowledge ·
            Tradeoff reasoning · Decision quality · Integrity) runs by default. Add any
            role-specific notes the system should weight.
          </p>
          <div className="mt-5 grid gap-4">
            <Field label="Rubric notes (optional)" htmlFor="rubric" hint="Quoted in the report context — appears verbatim to the scorer.">
              <Textarea
                id="rubric"
                rows={4}
                value={v.rubricNotes}
                placeholder='e.g. "For this role, weight Tradeoff reasoning higher than Domain knowledge."'
                onChange={(e) => set("rubricNotes", e.target.value)}
              />
            </Field>
          </div>
        </section>

        {/* SECTION 4 — Interview config */}
        <section className="ap-cell ap-cell--anchor">
          <span className="ap-cell-tag">Section 4 · Interview config</span>
          <h2 className="ap-h3 mb-1">Interview length</h2>
          <p className="text-sm text-ink-2">
            Aptura&apos;s proctored AI interview runs for a set duration with a fullscreen
            lock; the candidate gets one attempt.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Target duration (min)" htmlFor="dur" hint="30 is the default — calibrated for 6 Core 6 dimensions.">
              <Input
                id="dur"
                type="number"
                inputMode="numeric"
                min={10}
                max={90}
                value={v.interviewDurationMins}
                onChange={(e) => set("interviewDurationMins", e.target.value)}
              />
            </Field>
          </div>
        </section>

        {/* SECTION 5 — Decision policy */}
        <section className="ap-cell ap-cell--anchor">
          <span className="ap-cell-tag">Section 5 · Decision policy</span>
          <h2 className="ap-h3 mb-1">Who decides who advances?</h2>
          <p className="text-sm text-ink-2">
            Pick how the gate behaves between the aptitude test and the interview.
          </p>
          <fieldset className="mt-5 grid gap-3" aria-label="Gate mode">
            <GateRadio
              value="auto"
              current={v.gateMode}
              onChange={(g) => set("gateMode", g)}
              title="Auto"
              description="The system passes candidates whose aptitude score meets the threshold. Use when you want to scale."
            />
            <GateRadio
              value="advisory"
              current={v.gateMode}
              onChange={(g) => set("gateMode", g)}
              title="Advisory"
              description="The AI recommends — you sign every advance. Use when human review matters before interview."
            />
          </fieldset>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-3">
            Aptura never auto-rejects. Every applicant gets an outcome.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.push("/company/jobs")}
              className="ap-btn ap-btn-ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!v.title.trim() || create.isPending}
              className="ap-btn ap-btn-primary"
            >
              {create.isPending ? "Creating…" : "Create job"}
            </button>
          </div>
        </div>
      </form>
    </CompanyShell>
  );
}

function GateRadio({
  value,
  current,
  onChange,
  title,
  description,
}: {
  value: GateMode;
  current: GateMode;
  onChange: (v: GateMode) => void;
  title: string;
  description: string;
}) {
  const active = current === value;
  return (
    <label
      className={
        active
          ? "flex cursor-pointer items-start gap-3 rounded-xl border-2 border-brand bg-brand-soft p-3"
          : "flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-3 hover:bg-surface-2"
      }
    >
      <input
        type="radio"
        name="gate"
        value={value}
        checked={active}
        onChange={() => onChange(value)}
        className="mt-1 size-4 accent-teal"
      />
      <div>
        <div className="font-semibold text-ink-deep">{title}</div>
        <p className="text-sm text-ink-2">{description}</p>
      </div>
    </label>
  );
}
