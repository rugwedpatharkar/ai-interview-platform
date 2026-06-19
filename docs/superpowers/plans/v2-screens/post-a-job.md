# Screen: Post a job (extended) — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 1).
> **Route:** `frontend/apps/company/app/jobs/new/page.tsx` (extend the existing inline form) · **Mockup:** `aptura_post_a_job` · **Pillar:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md) (TIER 5, Task 11) + [proctored-integrity](../../v2/2026-06-20-proctored-integrity.md) (gate_mode)
> **Goal:** A recruiter posts a marketplace-grade role — location/remote/employment/salary/skills + an integrity **gate mode** toggle (auto-gate vs advisory) — with the existing AI-assist (`jd.improve`) kept verbatim, factored into a shared `JobForm` that `/jobs/[id]` edit reuses.

Today's screen is a two-field inline form (`title` + `jdText`) calling `api.jobs.createJob({ title, jdText })`. This plan **extends** it: add the marketplace display fields + a `gate_mode` control, and **factor the fields into a reusable `JobForm`** so the create page and the (existing) `/jobs/[id]` edit page share one component. The `Job` model today has only `title` + `jd_text` + `status`; every new field is **additive and optional** (back-compat with legacy jobs).

---

## A. Backend contract (hand this to a backend session)

**Status:** EXTEND · **Service:** `admin.job.v1` (`JobService`) — additive proto fields + a new `UpdateJob` RPC. Keep `/jd/improve` (ai-agents REST) untouched.

**RPCs (existing + new):**
```proto
// service: admin.job.v1 — JobService (existing; ADD fields + UpdateJob)
rpc CreateJob(CreateJobRequest) returns (JobResponse);     // EXTEND request
rpc UpdateJob(UpdateJobRequest) returns (JobResponse);     // NEW (manager + comp-scoped)
rpc PublishJob(PublishJobRequest) returns (JobResponse);   // EXISTING — now stamps posted_at = now
rpc GetJob(GetJobRequest) returns (JobResponse);           // EXISTING — returns the new fields
```

**Additive fields (preserve existing field numbers; new numbers only):**
```proto
message CreateJobRequest {
  string title = 1;                 // EXISTING
  string jd_text = 2;               // EXISTING
  string city = 3;                  // NEW (all additive, all optional)
  string region = 4;
  string country = 5;
  string remote_mode = 6;           // "remote" | "hybrid" | "onsite"
  string employment_type = 7;       // "full_time" | "contract" | "internship"
  int64  salary_min = 8;
  int64  salary_max = 9;
  string salary_currency = 10;      // ISO 4217, e.g. "USD"
  repeated string skills = 11;      // lowercased on write
  string gate_mode = 12;            // "auto" | "advisory"  (aptitude_config.gate_mode)
}
message UpdateJobRequest { string job_id = 1; /* …same additive fields 2..N… */ }
message JobResponse {
  string job_id = 1; string title = 2; string jd_text = 3; string status = 4;   // EXISTING
  string city = 5; string region = 6; string country = 7;                        // NEW echoes
  string remote_mode = 8; string employment_type = 9;
  int64 salary_min = 10; int64 salary_max = 11; string salary_currency = 12;
  repeated string skills = 13; string gate_mode = 14; string posted_at = 15;     // ISO; empty for drafts
}
```
- **Auth/scope:** bearer; `CreateJob`/`UpdateJob` **manager-scoped** (`company_admin`/`recruiter`) and **comp-scoped** — `comp_id` from the **token, never the request**. `UpdateJob` asserts the job belongs to the caller's `comp_id` (404 otherwise; never leak another tenant's job).
- **Validation (boundary):** `remote_mode` ∈ {remote,hybrid,onsite}; `employment_type` ∈ {full_time,contract,internship}; `gate_mode` ∈ {auto,advisory} (default `auto` when empty — proctored platform); `salary_min ≤ salary_max` when both present; `skills` lowercased + de-duped; empty strings normalise to null. Reject off-enum values (`INVALID_ARGUMENT`).
- **`gate_mode` semantics:** `auto` → HIGH-severity proctoring signals auto-terminate the interview (the proctored default); `advisory` → integrity is **surfaced to the recruiter** but never auto-gates. Persisted on `aptitude_config.gate_mode` (the interview/aptitude pipeline reads it). Cross-ref [proctored-integrity](../../v2/2026-06-20-proctored-integrity.md).
- **`posted_at`:** stamped `= now` at the `status → published` flip in `publish_job` (drafts have none). Legacy published jobs get it via the **blocking backfill** ([job-marketplace](../../v2/2026-06-19-job-marketplace.md) Task 2.5).
- **Backed by:** `resources/job.py` (`create_job`/`update_job`/`publish_job`/`get_job` — extend; lowercase skills on write, validate enums, stamp `posted_at` on publish) → `infra/repositories/jobs.py` (CRUD; no new aggregation) → Mongo `jobs` collection (additive document fields; indexes `(status,posted_at)`, `(status,remote_mode,employment_type)`, `(status,city)` from `infra/db.py`).
- **Proto delta / files:** modify `src/admin/app/routes/pb/job.proto` (additive fields + `UpdateJob`), `src/admin/app/routes/job.py` (servicer — add `UpdateJob`, thread fields), `src/admin/app/model/job.py` (additive model fields), `src/admin/app/resources/job.py`. Register `UpdateJob` in the existing `JobService` (no new service → **no api-client quad**; `pnpm gen` just widens `job_pb.ts`).
- **Pillar cross-ref:** [job-marketplace](../../v2/2026-06-19-job-marketplace.md) Task 11 (extend `JobService`) + Task 2.5 (`posted_at` backfill).

**FE mock shape** (`frontend/apps/company/app/jobs/job-form-types.ts`) — the form codes against this until `pnpm gen` regenerates `job_pb.ts`:
```ts
export type RemoteMode = "remote" | "hybrid" | "onsite";
export type EmploymentType = "full_time" | "contract" | "internship";
export type GateMode = "auto" | "advisory";

export interface JobFormValues {
  title: string;
  jdText: string;
  city: string;
  region: string;
  country: string;
  remoteMode: RemoteMode | "";        // "" = unset (renders as placeholder)
  employmentType: EmploymentType | "";
  salaryMin: string;                  // form state is string; coerced to int64 at submit
  salaryMax: string;
  salaryCurrency: string;
  skills: string[];                   // parsed from a comma-separated Input
  gateMode: GateMode;                 // never "" — defaults to "auto"
}

export const EMPTY_JOB_FORM: JobFormValues = {
  title: "", jdText: "", city: "", region: "", country: "",
  remoteMode: "", employmentType: "", salaryMin: "", salaryMax: "",
  salaryCurrency: "USD", skills: [], gateMode: "auto",
};
```

> **Integration seam:** the generated `CreateJobRequest`/`UpdateJobRequest` use `salaryMin: bigint` and `skills: string[]`. The submit adapter maps `JobFormValues` → request (`salaryMin: values.salaryMin ? BigInt(values.salaryMin) : 0n`, drop-empty strings). Only the adapter changes when the proto lands; the form component does not.

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `frontend/apps/company/app/jobs/job-form-types.ts` (the shape above)
- Create: `frontend/apps/company/components/job-form.tsx` (`"use client"` shared create/edit form)
- Create: `frontend/apps/company/components/gate-mode-toggle.tsx` (`"use client"` auto|advisory segmented control)
- Create: `frontend/apps/company/components/ai-suggest-panel.tsx` (`"use client"` "Improve with AI" affordance + suggestions list, lifted from today's inline JSX)
- Create: `frontend/apps/company/components/job-form.test.ts` (pure helpers: `parseSkills`, `toCreateRequest`)
- Modify: `frontend/apps/company/app/jobs/new/page.tsx` (render `<JobForm>` instead of the inline form)
- Modify (follow-up, same pattern): `frontend/apps/company/app/jobs/[id]/page.tsx` (mount `<JobForm initial=… onSubmit={update}>` — out of scope for this doc's acceptance but the component is built to fit)

**Components:** new `JobForm`, `GateModeToggle`, `AiSuggestPanel`; reuse `@ip/ui` `Field`, `Input`, `Textarea`, `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/`SelectItem`, `RadioGroup`/`RadioGroupItem`, `Button`, `Card`/`CardContent`/`CardHeader`/`CardTitle`/`CardDescription`, `Alert`, `PageHeader`, `toast`. (`@ip/ui` has **no `Switch`** — `GateModeToggle` is built from `RadioGroup` for an accessible two-option control.)
**Query keys:** none new (mutations only). Reuses the existing `jd.improve` REST client from `lib/auth`.

### Task 1: Pure helpers (skills parsing + request adapter) — testable, no React

- [ ] **Step 1: Write the failing test** — `frontend/apps/company/components/job-form.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { parseSkills, toCreateRequest } from "./job-form";
import { EMPTY_JOB_FORM } from "../app/jobs/job-form-types";

describe("parseSkills", () => {
  it("splits on commas, trims, lowercases, drops empties + dups", () => {
    expect(parseSkills("React, TypeScript ,react,, GO ")).toEqual(["react", "typescript", "go"]);
  });
});

describe("toCreateRequest", () => {
  it("coerces salary to bigint, drops empty strings, passes gate_mode", () => {
    const req = toCreateRequest({
      ...EMPTY_JOB_FORM, title: "  Senior FE  ", jdText: "Build things",
      remoteMode: "remote", employmentType: "full_time",
      salaryMin: "120000", salaryMax: "", salaryCurrency: "USD",
      skills: ["react"], gateMode: "advisory",
    });
    expect(req.title).toBe("Senior FE");
    expect(req.salaryMin).toBe(120000n);
    expect(req.salaryMax).toBe(0n);
    expect(req.remoteMode).toBe("remote");
    expect(req.gateMode).toBe("advisory");
    expect(req.skills).toEqual(["react"]);
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/company test job-form` → FAIL (`parseSkills`/`toCreateRequest` undefined). *(If the app has no test runner, add `vitest` to `frontend/apps/company` devDeps + a `test` script — fold into this task; mirror whatever the candidate app uses.)*
- [ ] **Step 3: Implement** `job-form-types.ts` (paste Part A shape) **and** the helpers at the top of `job-form.tsx`:
```ts
import type { JobFormValues } from "../app/jobs/job-form-types";

export function parseSkills(raw: string): string[] {
  const seen = new Set<string>();
  for (const s of raw.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)) seen.add(s);
  return [...seen];
}

/** Maps form state → the (generated) CreateJob/UpdateJob request shape. Only this adapter
 *  changes when `pnpm gen` lands the additive fields; the component below stays put. */
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
```
- [ ] **Step 4: Run test, verify it passes** — `npx pnpm@9.15.0 --filter @ip/company test job-form` → PASS
- [ ] **Step 5: Commit** — `git add frontend/apps/company && git commit -m "feat(post-a-job): JobForm helpers (parseSkills + request adapter)"`

### Task 2: `GateModeToggle` (auto | advisory) — accessible two-option control

- [ ] **Step 1:** Create `frontend/apps/company/components/gate-mode-toggle.tsx`:
```tsx
"use client";
import { Field, RadioGroup, RadioGroupItem } from "@ip/ui";
import type { GateMode } from "../app/jobs/job-form-types";

const OPTIONS: { value: GateMode; label: string; hint: string }[] = [
  { value: "auto", label: "Auto-gate", hint: "High-severity integrity signals end the interview automatically." },
  { value: "advisory", label: "Advisory", hint: "Integrity is surfaced to you — never auto-ends the interview." },
];

export function GateModeToggle({ value, onChange }: { value: GateMode; onChange: (v: GateMode) => void }) {
  return (
    <Field label="Integrity gate">
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as GateMode)}
        className="grid gap-2 sm:grid-cols-2"
      >
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-surface-muted p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
          >
            <RadioGroupItem value={o.value} className="mt-0.5" />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">{o.label}</span>
              <span className="text-xs text-muted-foreground">{o.hint}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </Field>
  );
}
```
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/company typecheck` clean (confirm `RadioGroup`'s `onValueChange`/`value` props against the real `@ip/ui` API; adjust `className` passthrough if the primitive doesn't forward it — wrap in a `div` if so).
- [ ] **Step 3: Commit** — `git commit -am "feat(post-a-job): GateModeToggle (auto|advisory)"`

### Task 3: `AiSuggestPanel` — lift the "Improve with AI" affordance verbatim

- [ ] **Step 1:** Create `frontend/apps/company/components/ai-suggest-panel.tsx` — extract today's inline Improve button + suggestions block (lines ~106–132 of the current page), **preserving** the `jd.improve` REST call:
```tsx
"use client";
import { Button } from "@ip/ui";
import { Sparkles } from "lucide-react";

export function AiSuggestPanel({
  improving, suggestions, disabled, onImprove,
}: { improving: boolean; suggestions: string[]; disabled: boolean; onImprove: () => void }) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Button
          type="button" variant="outline" size="sm" className="self-start"
          leadingIcon={Sparkles} loading={improving} disabled={disabled || improving}
          onClick={onImprove}
        >
          Improve with AI
        </Button>
        <span className="text-xs text-muted-foreground">
          Polish the description with AI before posting.
        </span>
      </div>
      {suggestions.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-muted p-3 text-sm">
          <p className="font-medium text-foreground">Suggestions</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            {suggestions.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </div>
      )}
    </>
  );
}
```
- [ ] **Step 2: Verify** — `--filter @ip/company typecheck` clean.
- [ ] **Step 3: Commit** — `git commit -am "feat(post-a-job): AiSuggestPanel (lifted Improve-with-AI)"`

### Task 4: `JobForm` — the shared create/edit form

- [ ] **Step 1:** Create `frontend/apps/company/components/job-form.tsx` (the helpers from Task 1 live at the top of this file). The form is **controlled by a single `JobFormValues` state**, takes `initial`/`submitting`/`onSubmit`, and keeps the existing `titleError` + double-submit `useRef` latch:
```tsx
"use client";
import {
  Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Textarea,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@ip/ui";
import { type FormEvent, useRef, useState } from "react";
import { EMPTY_JOB_FORM, type JobFormValues } from "../app/jobs/job-form-types";
import { GateModeToggle } from "./gate-mode-toggle";
import { AiSuggestPanel } from "./ai-suggest-panel";

// parseSkills + toCreateRequest from Task 1 are defined above this component.

const REMOTE = [["remote", "Remote"], ["hybrid", "Hybrid"], ["onsite", "On-site"]] as const;
const EMPLOYMENT = [["full_time", "Full-time"], ["contract", "Contract"], ["internship", "Internship"]] as const;

export function JobForm({
  initial = EMPTY_JOB_FORM, submitting, submitLabel = "Create job", onSubmit,
  improving, suggestions, onImprove,
}: {
  initial?: JobFormValues; submitting: boolean; submitLabel?: string;
  onSubmit: (values: JobFormValues) => void;
  improving: boolean; suggestions: string[]; onImprove: (jdText: string) => void;
}) {
  const [v, setV] = useState<JobFormValues>(initial);
  const [skillsRaw, setSkillsRaw] = useState(initial.skills.join(", "));
  const [titleError, setTitleError] = useState<string | null>(null);
  const latch = useRef(false);
  const set = <K extends keyof JobFormValues>(k: K, val: JobFormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!v.title.trim()) { setTitleError("Job title is required."); return; }
    setTitleError(null);
    if (latch.current) return;
    latch.current = true;
    onSubmit({ ...v, skills: parseSkills(skillsRaw) });
    latch.current = false; // caller flips it back on error via re-render; this guards the sync double-fire
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
            <Input id="title" required value={v.title}
              aria-invalid={Boolean(titleError) || undefined}
              onChange={(e) => { set("title", e.target.value); if (titleError) setTitleError(null); }} />
          </Field>

          <Field label="Job description" htmlFor="jd">
            <Textarea id="jd" rows={8} value={v.jdText}
              placeholder="Role, responsibilities, and requirements — the AI uses this to build the aptitude test and interview."
              onChange={(e) => set("jdText", e.target.value)} />
          </Field>
          <AiSuggestPanel improving={improving} suggestions={suggestions}
            disabled={!v.jdText.trim()} onImprove={() => onImprove(v.jdText)} />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City" htmlFor="city"><Input id="city" value={v.city} onChange={(e) => set("city", e.target.value)} /></Field>
            <Field label="Region" htmlFor="region"><Input id="region" value={v.region} onChange={(e) => set("region", e.target.value)} /></Field>
            <Field label="Country" htmlFor="country"><Input id="country" value={v.country} onChange={(e) => set("country", e.target.value)} /></Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Work mode">
              <Select value={v.remoteMode || undefined} onValueChange={(val) => set("remoteMode", val as JobFormValues["remoteMode"])}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{REMOTE.map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Employment type">
              <Select value={v.employmentType || undefined} onValueChange={(val) => set("employmentType", val as JobFormValues["employmentType"])}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{EMPLOYMENT.map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Salary min" htmlFor="smin"><Input id="smin" type="number" inputMode="numeric" value={v.salaryMin} onChange={(e) => set("salaryMin", e.target.value)} /></Field>
            <Field label="Salary max" htmlFor="smax"><Input id="smax" type="number" inputMode="numeric" value={v.salaryMax} onChange={(e) => set("salaryMax", e.target.value)} /></Field>
            <Field label="Currency" htmlFor="cur"><Input id="cur" value={v.salaryCurrency} maxLength={3} onChange={(e) => set("salaryCurrency", e.target.value.toUpperCase())} /></Field>
          </div>

          <Field label="Skills" htmlFor="skills" hint="Comma-separated — e.g. react, typescript, go">
            <Input id="skills" value={skillsRaw} placeholder="react, typescript, go" onChange={(e) => setSkillsRaw(e.target.value)} />
          </Field>

          <GateModeToggle value={v.gateMode} onChange={(g) => set("gateMode", g)} />

          <Button type="submit" className="self-start" loading={submitting}
            disabled={!v.title.trim() || submitting}>
            {submitLabel}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```
- [ ] **Step 2: Verify** — `--filter @ip/company typecheck` clean. Confirm `Field`'s `hint` prop exists (it's used on `new/page.tsx` patterns — if not, render the hint as a sibling `<span className="text-xs text-muted-foreground">`). Confirm `Select`'s controlled `value`/`onValueChange` against the Radix root export.
- [ ] **Step 3: Commit** — `git commit -am "feat(post-a-job): shared JobForm (location/remote/salary/skills/gate_mode)"`

### Task 5: Wire `jobs/new/page.tsx` to render `JobForm`

- [ ] **Step 1:** Rewrite `frontend/apps/company/app/jobs/new/page.tsx` to own the mutations + `jd.improve`, delegating all fields to `JobForm`:
```tsx
"use client";
import { PageHeader, toast } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CompanyShell } from "../../../components/company-shell";
import { JobForm } from "../../../components/job-form";
import { toCreateRequest } from "../../../components/job-form";
import type { JobFormValues } from "../job-form-types";
import { jd as jdClient, useAuth } from "../../../lib/auth";

export default function NewJobPage() {
  const { api } = useAuth();
  const router = useRouter();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [jdDraft, setJdDraft] = useState<string>("");

  const create = useMutation({
    mutationFn: (values: JobFormValues) => api.jobs.createJob(toCreateRequest(values)),
    onSuccess: (res) => { toast.success("Job created"); router.push(`/jobs/${res.jobId}`); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const improve = useMutation({
    mutationFn: (jdText: string) => jdClient.improve(jdText),
    onSuccess: (draft) => { setJdDraft(draft.jd_text); setSuggestions(draft.suggestions); toast.success("Draft improved"); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <CompanyShell>
      <PageHeader
        title="Create a job"
        description="Post a role — the AI uses the description to build the aptitude test and interview."
      />
      <JobForm
        submitting={create.isPending}
        onSubmit={(v) => create.mutate(v)}
        improving={improve.isPending}
        suggestions={suggestions}
        onImprove={(jdText) => improve.mutate(jdText)}
      />
    </CompanyShell>
  );
}
```
> **Note on the improved JD:** today the page mutates `jdText` directly into the textarea. With the field state now inside `JobForm`, surface the improved draft by either (a) lifting `jdText` into the page (pass `value`/`onChange` down) **or** (b) seeding `JobForm`'s `initial.jdText` from `jdDraft` via a `key` remount. Pick (a) for live two-way binding; keep `onImprove` returning the draft into the form's `jdText`. (The verify loop will confirm the improved text lands in the textarea.)
- [ ] **Step 2: Verify build + preview** — `npx pnpm@9.15.0 --filter @ip/company build` clean; then via the preview loop: load `/jobs/new`, fill title + JD, click **Improve with AI** (improved text replaces the JD, suggestions list shows), pick work-mode/employment, enter salary + skills, toggle **Auto-gate ↔ Advisory**, submit → toast + redirect to `/jobs/{id}`. Screenshot the full form + the gate toggle.
- [ ] **Step 3: Commit** — `git commit -am "feat(post-a-job): render JobForm on /jobs/new with create + improve"`

### Task 6 (follow-up, mirror — not in this doc's acceptance): reuse on `/jobs/[id]` edit

- [ ] After `UpdateJob` lands (`pnpm gen`), mount `<JobForm initial={mapJobToForm(job.data)} submitLabel="Save changes" onSubmit={(v) => update.mutate(v)} … />` on `/jobs/[id]` where `update` calls `api.jobs.updateJob({ jobId: id, ...toCreateRequest(v) })`; keep the existing publish/status controls intact. Build + commit.

---

## C. States & acceptance
- **States:** idle form; `improve` pending (button spinner); `create` pending (submit spinner, disabled); validation (empty title → inline `Field` error; off-range salary handled server-side → `toast` on the `INVALID_ARGUMENT`); success (toast + redirect). Double-submit guarded by the `useRef` latch.
- **Responsive:** location grid `sm:grid-cols-3`, mode/type `sm:grid-cols-2`, salary `sm:grid-cols-3`, gate toggle `sm:grid-cols-2` — all stack at ~375px.
- **Dark mode:** tokens only (`bg-surface-muted`, `border-border`, `text-foreground`, `has-[:checked]:border-primary`) — automatic.
- **A11y:** every field wrapped in `Field` with a label; `GateModeToggle` is a labelled `RadioGroup` (keyboard-navigable, single-select); salary inputs `inputMode="numeric"`; AI button `type="button"` so it never submits the form.
- **Acceptance:** matches `aptura_post_a_job`; the form is a single `JobForm` reused by create (and edit once `UpdateJob` lands); `jd.improve` works exactly as today; builds against the mock adapter now and against the regenerated `job_pb.ts` after `pnpm gen` (the only change is `toCreateRequest`'s field names if the proto camelCase differs); `--filter @ip/company build` + `typecheck` green.
