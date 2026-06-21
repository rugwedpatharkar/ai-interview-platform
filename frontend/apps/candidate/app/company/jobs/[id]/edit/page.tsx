"use client";

import {
  Badge,
  ConfirmDialog,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from "@ip/ui";
import { errorMessage, useAuthedQuery, useRequireRole } from "@ip/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { CompanyShell } from "../../../../../components/company-shell";
import { useAuth } from "../../../../../lib/auth";
import {
  EMPTY_JOB_FORM,
  type GateMode,
  type JobFormValues,
  jobToFormValues,
  parseSkills,
} from "../../job-form-types";

/* ============================================================
   APTURA · v3 — Job edit (`/company/jobs/[id]/edit`)
   Same sections as post-a-job. Loads via GetJob; calls
   UpdateJob on save (cast seam — UpdateJob isn't in the
   proto yet). Publish button on draft state.
   ============================================================ */

const MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

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

export default function JobEditPage() {
  const { api, token, identity, ready } = useAuth();
  useRequireRole(identity?.role, ["recruiter", "company_admin"], ready);
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const job = useAuthedQuery(token, {
    queryKey: ["job", id],
    queryFn: () => api.jobs.getJob({ jobId: id }),
    enabled: Boolean(token && id),
  });

  const [v, setV] = useState<JobFormValues>(EMPTY_JOB_FORM);
  const [skillsRaw, setSkillsRaw] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const set = <K extends keyof JobFormValues>(k: K, val: JobFormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  // One-shot hydrate when the GetJob response lands. Refetches don't re-overwrite
  // (so the recruiter doesn't lose in-flight edits if the cache refreshes).
  useEffect(() => {
    if (!job.data || hydrated) return;
    const next = jobToFormValues(job.data as Record<string, unknown>);
    setV(next);
    setSkillsRaw(next.skills.join(", "));
    setHydrated(true);
  }, [job.data, hydrated]);

  const save = useMutation({
    mutationFn: async () => {
      // UpdateJob isn't in the proto yet — keep the recruiter-app pattern: cast through
      // an unknown seam so the screen builds before `pnpm gen` widens the type. In mock
      // mode the call is a no-op; otherwise the runtime gRPC client emits the request
      // and the server (which has the field) acknowledges or rejects.
      if (MOCK) return;
      await (
        api.jobs as unknown as {
          updateJob(req: {
            jobId: string;
            title: string;
            jdText: string;
            city: string;
            region: string;
            country: string;
            remoteMode: string;
            employmentType: string;
            salaryMin: bigint;
            salaryMax: bigint;
            salaryCurrency: string;
            skills: string[];
            gateMode: GateMode;
          }): Promise<unknown>;
        }
      ).updateJob({
        jobId: id,
        title: v.title.trim(),
        jdText: v.jdText,
        city: v.city.trim(),
        region: v.region.trim(),
        country: v.country.trim(),
        remoteMode: v.remoteMode || "",
        employmentType: v.employmentType || "",
        salaryMin: v.salaryMin ? BigInt(v.salaryMin) : 0n,
        salaryMax: v.salaryMax ? BigInt(v.salaryMax) : 0n,
        salaryCurrency: v.salaryCurrency.trim(),
        skills: parseSkills(skillsRaw),
        gateMode: v.gateMode,
      });
    },
    onSuccess: () => {
      toast.success("Job updated");
      qc.invalidateQueries({ queryKey: ["job", id] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const publish = useMutation({
    mutationFn: () => api.jobs.publishJob({ jobId: id }),
    onSuccess: () => {
      toast.success("Job published");
      qc.invalidateQueries({ queryKey: ["job", id] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!v.title.trim()) {
      toast.error("Job title is required.");
      return;
    }
    save.mutate();
  }

  if (!mounted) return null;
  if (!token || (identity?.role !== "recruiter" && identity?.role !== "company_admin")) {
    return null;
  }

  const status = (job.data?.status as string | undefined) ?? "draft";
  const isDraft = status === "draft";

  return (
    <CompanyShell>
      {job.isLoading && <LoadingState />}
      {job.isError && (
        <ErrorState message={errorMessage(job.error)} retry={() => job.refetch()} />
      )}
      {job.data && (
        <>
          <div className="ap-section-head ap-section-head--two">
            <div>
              <span className="ap-eyebrow">Edit job</span>
              <h1 className="ap-h2">{v.title || job.data.title || "Untitled role"}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={statusPill(status)}>{status}</span>
                {v.gateMode === "advisory" && (
                  <span className="ap-pill ap-pill--warn">Advisory gate</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2 justify-self-end">
              {isDraft && (
                <ConfirmDialog
                  trigger={
                    <button type="button" className="ap-btn ap-btn-primary">
                      Publish
                    </button>
                  }
                  title="Publish this job?"
                  description="Candidates can apply once it's published."
                  confirmLabel="Publish"
                  busy={publish.isPending}
                  onConfirm={() => publish.mutate()}
                />
              )}
              <button
                type="button"
                onClick={() => router.push(`/company/jobs/${id}`)}
                className="ap-btn ap-btn-ghost"
              >
                View pipeline
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-5" noValidate>
            {/* Role */}
            <section className="ap-cell ap-cell--anchor">
              <span className="ap-cell-tag">Section 1 · Role</span>
              <h2 className="ap-h3 mb-1">Role basics</h2>
              <div className="mt-5 grid gap-4">
                <Field label="Job title" htmlFor="title">
                  <Input id="title" required value={v.title} onChange={(e) => set("title", e.target.value)} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="City"><Input value={v.city} onChange={(e) => set("city", e.target.value)} /></Field>
                  <Field label="Region"><Input value={v.region} onChange={(e) => set("region", e.target.value)} /></Field>
                  <Field label="Country"><Input value={v.country} onChange={(e) => set("country", e.target.value)} /></Field>
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
                  <Field label="Salary min"><Input type="number" value={v.salaryMin} onChange={(e) => set("salaryMin", e.target.value)} /></Field>
                  <Field label="Salary max"><Input type="number" value={v.salaryMax} onChange={(e) => set("salaryMax", e.target.value)} /></Field>
                  <Field label="Currency"><Input value={v.salaryCurrency} maxLength={3} onChange={(e) => set("salaryCurrency", e.target.value.toUpperCase())} /></Field>
                </div>
              </div>
            </section>

            {/* Requirements */}
            <section className="ap-cell ap-cell--anchor">
              <span className="ap-cell-tag">Section 2 · Requirements</span>
              <h2 className="ap-h3 mb-1">Description &amp; skills</h2>
              <div className="mt-5 grid gap-4">
                <Field label="Job description" htmlFor="jd">
                  <Textarea id="jd" rows={10} value={v.jdText} onChange={(e) => set("jdText", e.target.value)} />
                </Field>
                <Field label="Skills" htmlFor="skills" hint="Comma-separated.">
                  <Input
                    id="skills"
                    value={skillsRaw}
                    onChange={(e) => setSkillsRaw(e.target.value)}
                  />
                  {parseSkills(skillsRaw).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {parseSkills(skillsRaw).map((s) => (
                        <Badge key={s} tone="neutral">{s}</Badge>
                      ))}
                    </div>
                  )}
                </Field>
              </div>
            </section>

            {/* Rubric */}
            <section className="ap-cell ap-cell--anchor">
              <span className="ap-cell-tag">Section 3 · Rubric</span>
              <h2 className="ap-h3 mb-1">Scoring notes</h2>
              <div className="mt-5">
                <Field label="Rubric notes (optional)">
                  <Textarea rows={4} value={v.rubricNotes} onChange={(e) => set("rubricNotes", e.target.value)} />
                </Field>
              </div>
            </section>

            {/* Interview config */}
            <section className="ap-cell ap-cell--anchor">
              <span className="ap-cell-tag">Section 4 · Interview config</span>
              <h2 className="ap-h3 mb-1">Interview length</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label="Target duration (min)">
                  <Input
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

            {/* Decision policy */}
            <section className="ap-cell ap-cell--anchor">
              <span className="ap-cell-tag">Section 5 · Decision policy</span>
              <h2 className="ap-h3 mb-1">Gate mode</h2>
              <fieldset className="mt-5 grid gap-3">
                <GateRadio value="auto" current={v.gateMode} onChange={(g) => set("gateMode", g)} title="Auto" description="The system passes candidates whose aptitude score meets the threshold." />
                <GateRadio value="advisory" current={v.gateMode} onChange={(g) => set("gateMode", g)} title="Advisory" description="The AI recommends — you sign every advance." />
              </fieldset>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink-3">
                Changes apply immediately. Audit log records every edit.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/company/jobs/${id}`)}
                  className="ap-btn ap-btn-ghost"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!v.title.trim() || save.isPending}
                  className="ap-btn ap-btn-primary"
                >
                  {save.isPending ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </form>
        </>
      )}
    </CompanyShell>
  );
}

function statusPill(status: string): string {
  if (status === "published") return "ap-pill ap-pill--good";
  if (status === "paused") return "ap-pill ap-pill--warn";
  if (status === "closed") return "ap-pill ap-pill--danger";
  return "ap-pill";
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
          ? "flex cursor-pointer items-start gap-3 rounded-xl border-2 border-teal bg-teal-soft p-3"
          : "flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-3 hover:bg-surface-2"
      }
    >
      <input
        type="radio"
        name="gate-edit"
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
