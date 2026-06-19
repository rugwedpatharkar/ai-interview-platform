# Screen: Onboarding / first-run — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 1, first-run layer).
> **Routes:** candidate dashboard card (`frontend/apps/candidate/components/dashboard.tsx`) + employer wizard (`frontend/apps/company/app/onboarding/page.tsx`, NEW) · **Mockup:** first-run checklist + post-first-job wizard · **Pillar:** [onboarding](../../v2/2026-06-19-onboarding.md) (full task plan) + [onboarding-design](../../v2/2026-06-19-onboarding-design.md) (spec)
> **Goal:** Get new users to value fast and fill the flagged empty states: a **candidate** profile-completeness checklist + "find jobs" / "try practice" nudges; an **employer** post-first-job wizard + team-invite + **gate-mode default** (advisory recommended) + consent default. **Mostly empty-states + guided steps that orchestrate existing pillar flows** — onboarding builds none of them. It is **skippable, resumable, idempotent, and never gates real usage**.

This screen is the **first-session layer** over the pillars. The frontend is mostly composition: a `CandidateOnboardingCard` on the dashboard and an `EmployerOnboardingWizard` route, each step **embedding or linking an existing flow** (résumé parse, `JobForm`, JD assist, `InviteRecruiter`, `gate_mode`, `company_profiles`, `/practice`) and calling `completeStep` on that flow's existing success signal. Plus the four `EmptyState`s the build plan flagged. It rides a **thin** new `OnboardingService` (the only new backend — a `{steps, dismissed}` progress doc, fully specced in [onboarding](../../v2/2026-06-19-onboarding.md) TIER A).

---

## A. Backend contract (hand this to a backend session)

**Status:** NEW (thin) — the **only** new backend; everything else the screens use is EXISTING · **Service:** new **`OnboardingService`** (admin gRPC-web, existing transport). **Full backend plan:** [onboarding](../../v2/2026-06-19-onboarding.md) TIER A (Tasks 1–4, 7) + the design's §4. This section is the screen-scoped contract slice.

**gRPC** — `OnboardingService` (3 idempotent RPCs; the **subject id is resolved server-side from the JWT** — candidate→`user_id`, company→`comp_id` — **never** a request field):
```proto
// service: admin.onboarding.v1 — NEW
service OnboardingService {
  rpc GetOnboarding(GetOnboardingRequest) returns (OnboardingProgress);       // read; constructs a fresh all-pending doc if absent, never writes on read
  rpc CompleteStep(CompleteStepRequest) returns (OnboardingProgress);          // idempotent $set; INVALID_ARGUMENT if step ∉ the scope's set
  rpc DismissOnboarding(DismissOnboardingRequest) returns (OnboardingProgress);// idempotent
}
message GetOnboardingRequest      { string kind = 1; }     // "candidate" | "company"
message CompleteStepRequest       { string kind = 1; string step = 2; }
message DismissOnboardingRequest  { string kind = 1; }
message OnboardingProgress {
  string kind = 1;                       // "candidate" | "company"
  map<string, bool> steps = 2;           // {step_id: done}; absent == not done
  bool   dismissed = 3;
  string completed_at = 4;               // ISO; set only when all REQUIRED steps done (else "")
}
```
- **Step vocabulary** (canonical, from [onboarding-design §4.1](../../v2/2026-06-19-onboarding-design.md)):
  - **candidate** steps: `upload_resume`, `review_profile`, `set_preferences` (**required**) · `explore_jobs`, `try_practice` (**optional nudges**).
  - **company** steps: `post_first_job`, `set_gate_default`, `set_consent_default` (**required**) · `invite_team`, `setup_branding` (**optional**).
  - `completed_at` is set only when every **required** step for the scope is done — so the checklist hits 100% without forcing a skippable step.
- **Auth/scope:** bearer required; the subject is JWT-derived (candidate `user_id` / company `comp_id`); **no client-supplied subject id** (the cross-tenant guarantee). `CompleteStep` validates `step ∈ scope set` → `INVALID_ARGUMENT` otherwise (the one boundary check). No auth → `UNAUTHENTICATED`.
- **Backed by:** `resources/onboarding.py` + `infra/repositories/onboarding.py` over one `onboarding` collection keyed by `(_id = {kind, subject_id})` (per-tenant by construction); `IndexSpec("onboarding","subject_id")` backs erasure. The **candidate** doc joins the `CandidateEraser` cascade (`delete_by_user`); the **company** doc does not (it's org config). **Never gates:** no route guard, no funnel state, no RabbitMQ event — a test asserts the dashboard/marketplace render identically with the doc absent vs `dismissed=True`.
- **Proto/new files:** `src/admin/app/routes/pb/onboarding.proto` (NEW) + servicer + resource + repo + model + index + eraser entry — all in [onboarding](../../v2/2026-06-19-onboarding.md) TIER A.

**Everything else the screens touch is EXISTING and unchanged** (onboarding **orchestrates**, never rebuilds):
- candidate: `api.profile.*` (résumé/parse/completeness — see [candidate-profile.md](./candidate-profile.md)), `api.applications.listMyApplications` (the no-applications empty state lives on the dashboard — [candidate-dashboard.md](./candidate-dashboard.md)), the saved-jobs list (no-saved-jobs empty state — [saved-jobs.md](./saved-jobs.md)), `/jobs` (marketplace), `/practice` (Candidate Growth).
- company: the extended `JobForm` + the JD-assist client (post-first-job), `InviteRecruiter` (team), `AptitudeConfig.gate_mode` + `company_defaults.gate_mode` (gate default — the **first UI** for it), the notifications `_MESSAGES` seam + the `automated_evaluation` consent posture (consent default — a default string, **not** a template engine), the `company_profiles` editor / `/branding` (optional branding), `/jobs/[id]` applicants (no-applicants empty state).

**FE mock shape** (`@ip/shared` types + a mock client until `pnpm gen` exposes `api.onboarding`):
```ts
export type OnboardingKind = "candidate" | "company";
export interface OnboardingProgress {
  kind: OnboardingKind;
  steps: Record<string, boolean>;   // {step_id: done}
  dismissed: boolean;
  completedAt: string;              // ISO; "" until all required done
}
export interface OnboardingClient {
  get(kind: OnboardingKind): Promise<OnboardingProgress>;
  completeStep(kind: OnboardingKind, step: string): Promise<OnboardingProgress>;
  dismiss(kind: OnboardingKind): Promise<OnboardingProgress>;
}
```
> **Contract seam:** the FE codes against `OnboardingClient`. Today it's `makeMockOnboardingClient()` (an in-memory `{steps,dismissed}` per kind); after `pnpm gen`, the binding adapts `api.onboarding.getOnboarding/completeStep/dismissOnboarding` — the `CandidateOnboardingCard` / `EmployerOnboardingWizard` / empty-state code is unchanged. **No `subject_id`/`user_id`/`comp_id` in any client signature** — the detached-identity property reaches the FE surface.

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `frontend/packages/shared/src/onboarding.ts` (`makeOnboardingClient(adminUrl, store)` mirroring the existing gRPC-web/REST client wiring; `makeMockOnboardingClient()`) + export from `frontend/packages/shared/src/index.ts`
- Create: `frontend/apps/candidate/lib/onboarding-steps.ts` (candidate step ordering/copy/route map — FE owns the flow)
- Modify: `frontend/apps/candidate/lib/auth.tsx` (`export const onboarding = makeOnboardingClient(ADMIN_URL, store)`)
- Create: `frontend/apps/candidate/components/candidate-onboarding-card.tsx` (checklist + 3 nudges + `Progress` + Dismiss)
- Modify: `frontend/apps/candidate/components/dashboard.tsx` (render the card **above** the tracker; the no-applications `EmptyState` already exists there)
- Modify: the candidate saved-jobs list (no-saved-jobs `EmptyState` — coordinate with [saved-jobs.md](./saved-jobs.md), which already specs it)
- Create: `frontend/apps/company/lib/auth.tsx` export (`onboarding = makeOnboardingClient(ADMIN_URL, store)`)
- Create: `frontend/apps/company/app/onboarding/page.tsx` (the wizard route under `CompanyShell`)
- Create: `frontend/apps/company/components/employer-onboarding-wizard.tsx` + one thin component per step (`onboarding-step-job.tsx`, `-invite.tsx`, `-gate.tsx`, `-consent.tsx`, `-branding.tsx`)
- Modify: company recruiter home (`app/page.tsx` / `app/jobs/page.tsx`) — a "Finish setting up" card + no-jobs `EmptyState`
- Modify: company `app/jobs/[id]/page.tsx` applicants tab — no-applicants `EmptyState`
- Create: `frontend/packages/shared/src/onboarding.test.ts` (mock client: complete→get reflects; dismiss; idempotent)

**Components:** new `CandidateOnboardingCard`, `EmployerOnboardingWizard` + 5 step shells; **reuse** `@ip/ui` `Card`/`CardContent`/`CardHeader`/`CardTitle`, `Progress`, `Button`, `Badge`, `Alert`, `EmptyState`/`LoadingState`/`ErrorState`, `RadioGroup`/`RadioGroupItem` (gate choice), `Field`/`Textarea` (consent default); the existing `JobForm`, JD-assist panel, `InviteRecruiter`, `company_profiles` editor (linked/embedded, not rebuilt). Icons via `lucide-react` (`CheckCircle2`, `Circle`, `Search`, `Sparkles`, `Briefcase`, `Users`, `ShieldCheck`) — in the app.
**Query keys:** `["onboarding"]` (both apps, invalidated on `completeStep`/`dismiss`).

> **The four invariants are structural, not optional** (from [onboarding-design §4.5](../../v2/2026-06-19-onboarding-design.md)): **skippable** (a persistent Dismiss/Skip everywhere), **resumable** (each `completeStep` persists before the FE advances; resumption = "render steps whose `steps[id]` is falsy", no cursor), **idempotent** (re-completing/re-dismissing is a no-op; the FE may freely re-call), **never-gates** (a *card on* / *route beside* the real surfaces, never *in front of* — **no route guard, no blocking modal, no "finish to continue"**). If you ever feel the urge to redirect a new user into onboarding, **stop** — that breaks the invariant.

### Task 1: Shared `OnboardingClient` + mock (testable seam)

- [ ] **Step 1: Write the failing test** — `frontend/packages/shared/src/onboarding.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { makeMockOnboardingClient } from "./onboarding.js";

describe("makeMockOnboardingClient", () => {
  it("get on a fresh kind is all-pending, not dismissed", async () => {
    const c = makeMockOnboardingClient();
    const p = await c.get("candidate");
    expect(p.dismissed).toBe(false);
    expect(p.completedAt).toBe("");
  });
  it("completeStep reflects on the next get; idempotent", async () => {
    const c = makeMockOnboardingClient();
    await c.completeStep("candidate", "upload_resume");
    await c.completeStep("candidate", "upload_resume");   // no-op
    expect((await c.get("candidate")).steps.upload_resume).toBe(true);
  });
  it("completed_at sets only when all required candidate steps done", async () => {
    const c = makeMockOnboardingClient();
    for (const s of ["upload_resume", "review_profile"]) await c.completeStep("candidate", s);
    expect((await c.get("candidate")).completedAt).toBe("");       // set_preferences still pending
    await c.completeStep("candidate", "set_preferences");
    expect((await c.get("candidate")).completedAt).not.toBe("");
  });
  it("dismiss is idempotent", async () => {
    const c = makeMockOnboardingClient();
    await c.dismiss("company");
    await c.dismiss("company");
    expect((await c.get("company")).dismissed).toBe(true);
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/shared test onboarding` → FAIL.
- [ ] **Step 3: Implement** `frontend/packages/shared/src/onboarding.ts`. The real client mirrors the existing gRPC-web/REST client wiring (`restAuthFor(store)` → `authedFetch`, silent 401-refresh, `post<T>`/`get<T>` parsing `{detail}` → `HttpError`); the mock is in-memory. **No subject id in any signature.**
```ts
import { restAuthFor, type TokenStore } from "./index.js";   // wire to the same helpers existing clients use

export type OnboardingKind = "candidate" | "company";
export interface OnboardingProgress {
  kind: OnboardingKind;
  steps: Record<string, boolean>;
  dismissed: boolean;
  completedAt: string;
}
export interface OnboardingClient {
  get(kind: OnboardingKind): Promise<OnboardingProgress>;
  completeStep(kind: OnboardingKind, step: string): Promise<OnboardingProgress>;
  dismiss(kind: OnboardingKind): Promise<OnboardingProgress>;
}

const REQUIRED: Record<OnboardingKind, string[]> = {
  candidate: ["upload_resume", "review_profile", "set_preferences"],
  company: ["post_first_job", "set_gate_default", "set_consent_default"],
};

/** In-memory onboarding client for building first-run UI before api.onboarding lands. */
export function makeMockOnboardingClient(): OnboardingClient {
  const docs: Record<OnboardingKind, OnboardingProgress> = {
    candidate: { kind: "candidate", steps: {}, dismissed: false, completedAt: "" },
    company: { kind: "company", steps: {}, dismissed: false, completedAt: "" },
  };
  const recompute = (k: OnboardingKind) => {
    const d = docs[k];
    const done = REQUIRED[k].every((s) => d.steps[s]);
    if (done && !d.completedAt) d.completedAt = new Date().toISOString();
  };
  return {
    get: async (k) => ({ ...docs[k], steps: { ...docs[k].steps } }),
    completeStep: async (k, step) => { docs[k].steps[step] = true; recompute(k); return docs[k]; },
    dismiss: async (k) => { docs[k].dismissed = true; return docs[k]; },
  };
}

// Real client — wired after pnpm gen exposes api.onboarding (or the gRPC-web REST shape the
// other @ip/shared clients use). Subject is JWT-derived server-side; kind is the only arg.
export function makeOnboardingClient(_adminUrl: string, _store: TokenStore): OnboardingClient {
  // mirror interview.ts/jd.ts: restAuthFor(store) → post<OnboardingProgress>(`${adminUrl}/…`, {kind, step})
  // returns the same OnboardingClient shape. Swap makeMockOnboardingClient() → this post-gen.
  return makeMockOnboardingClient();   // placeholder until the endpoint/gen lands
}
```
- [ ] **Step 4: Run test, verify it passes** — `npx pnpm@9.15.0 --filter @ip/shared test onboarding` → PASS.
- [ ] **Step 5: Export** — add `makeOnboardingClient`, `makeMockOnboardingClient`, `type OnboardingProgress`, `type OnboardingKind`, `type OnboardingClient` to `packages/shared/src/index.ts`.
- [ ] **Step 6: Commit** — `git commit -am "feat(onboarding): OnboardingClient seam + in-memory mock"`.

### Task 2: Candidate step map + `auth.tsx` wiring

- [ ] **Step 1:** Create `frontend/apps/candidate/lib/onboarding-steps.ts` — the FE-owned ordering/copy/route (the backend only stores done-ness):
```ts
import type { LucideIcon } from "lucide-react";
import { FileUp, ClipboardCheck, SlidersHorizontal, Search, Sparkles } from "lucide-react";

export interface StepDef { id: string; title: string; hint: string; href: string; icon: LucideIcon; optional: boolean; }

export const CANDIDATE_STEPS: StepDef[] = [
  { id: "upload_resume",  title: "Upload your résumé", hint: "We extract your experience & skills.", href: "/profile", icon: FileUp, optional: false },
  { id: "review_profile", title: "Review your details", hint: "Confirm what we parsed.",            href: "/profile", icon: ClipboardCheck, optional: false },
  { id: "set_preferences",title: "Set your preferences", hint: "Role, location, remote.",           href: "/profile", icon: SlidersHorizontal, optional: false },
];
export const CANDIDATE_NUDGES: StepDef[] = [
  { id: "explore_jobs", title: "Find jobs", hint: "Search open roles — your match score is on every card.", href: "/jobs", icon: Search, optional: true },
  { id: "try_practice", title: "Try a practice interview", hint: "Practice a real AI interview, just for you — never shared with any employer.", href: "/practice", icon: Sparkles, optional: true },
];
```
- [ ] **Step 2:** In `frontend/apps/candidate/lib/auth.tsx`, add under the existing client exports: `import { makeOnboardingClient } from "@ip/shared";` then `export const onboarding = makeOnboardingClient(ADMIN_URL, store);` (reuses the candidate token store).
- [ ] **Step 3: Verify** — `--filter @ip/candidate typecheck` clean.
- [ ] **Step 4: Commit** — `git commit -am "feat(onboarding): candidate step map + auth wiring"`.

### Task 3: `CandidateOnboardingCard` (checklist + 3 nudges; states: loading / active / dismissed / complete / error)

- [ ] **Step 1:** Create `frontend/apps/candidate/components/candidate-onboarding-card.tsx`:
```tsx
"use client";
import { Button, Card, CardContent, CardHeader, CardTitle, Progress, buttonVariants, cn } from "@ip/ui";
import { errorMessage } from "@ip/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, X } from "lucide-react";
import Link from "next/link";

import { useAuth } from "../lib/auth";
import { onboarding } from "../lib/auth";
import { CANDIDATE_NUDGES, CANDIDATE_STEPS } from "../lib/onboarding-steps";

/** First-run checklist + nudges on the dashboard. Renders ONLY when not dismissed and not
 * complete; never blocks the dashboard (the tracker renders regardless). */
export function CandidateOnboardingCard() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["onboarding"], queryFn: () => onboarding.get("candidate"), enabled: !!token });

  const dismiss = useMutation({
    mutationFn: () => onboarding.dismiss("candidate"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding"] }),
  });
  const mark = useMutation({
    mutationFn: (step: string) => onboarding.completeStep("candidate", step),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["onboarding"] }),
  });

  if (!token || !q.data) return null;                 // loading → render nothing (never a blocking spinner)
  if (q.data.dismissed || q.data.completedAt) return null;

  const steps = q.data.steps;
  const doneCount = CANDIDATE_STEPS.filter((s) => steps[s.id]).length;
  const pct = (doneCount / CANDIDATE_STEPS.length) * 100;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Finish setting up your profile</CardTitle>
        <Button variant="ghost" size="sm" leadingIcon={X} onClick={() => dismiss.mutate()}>Dismiss</Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span className="text-muted-foreground">{doneCount} of {CANDIDATE_STEPS.length} done</span>
            <span className="font-display font-semibold text-brand-600">{Math.round(pct)}%</span>
          </div>
          <Progress value={pct} aria-label="Profile setup progress" />
        </div>
        <ul className="flex flex-col gap-2">
          {CANDIDATE_STEPS.map((s) => {
            const done = !!steps[s.id];
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                <span className="flex items-center gap-2.5">
                  {done ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <Circle className="size-4 text-muted-foreground/50" aria-hidden />}
                  <span className="flex flex-col">
                    <span className={cn("text-sm font-medium", done ? "text-muted-foreground line-through" : "text-foreground")}>{s.title}</span>
                    <span className="text-xs text-muted-foreground">{s.hint}</span>
                  </span>
                </span>
                {!done && <Link href={s.href} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Start</Link>}
              </li>
            );
          })}
        </ul>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CANDIDATE_NUDGES.map((n) => (
            <Link key={n.id} href={n.href} onClick={() => mark.mutate(n.id)}
              className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 hover:border-border-strong">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground"><n.icon className="size-4 text-brand-500" aria-hidden />{n.title}</span>
              <span className="text-xs text-muted-foreground">{n.hint}</span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```
> The card calls `mark.mutate("review_profile")` etc. — but the **authoritative** completion of `upload_resume`/`review_profile`/`set_preferences` happens on the **profile save** (the profile page fires `completeStep` on its existing save success). Because `completeStep` is **idempotent**, the card and the profile page can both call it safely. (Don't duplicate the profile flow here — the rows **link** to `/profile`.)
- [ ] **Step 2:** In `components/dashboard.tsx`, render `<CandidateOnboardingCard />` **above** the application tracker (and above/below the apply form per the mockup — above the tracker). The existing no-applications `EmptyState` ([candidate-dashboard.md](./candidate-dashboard.md)) stays; the card renders **in addition**, never replacing it.
- [ ] **Step 3:** Wire the profile save to mark steps: in `app/profile/page.tsx`'s `save` mutation `onSuccess`, add `onboarding.completeStep("candidate", "review_profile")` (and `set_preferences` if prefs changed; `upload_resume` is marked on a successful `uploadResume`). Best-effort — wrap so a failed mark never breaks the save (it's guidance, not a gate). *(Import the candidate `onboarding` client.)*
- [ ] **Step 4: Verify** — `--filter @ip/candidate build` clean; preview: a fresh candidate sees the checklist + nudges; a profile save flips a row + advances the meter; clicking a nudge navigates + marks it; Dismiss makes the card vanish and the dashboard still works; once all required steps are done the card disappears (completed). Screenshot.
- [ ] **Step 5: Commit** — `git commit -am "feat(onboarding): CandidateOnboardingCard + profile-save step marking"`.

### Task 4: Candidate empty states (no-applications confirmed, no-saved-jobs)

- [ ] **Step 1:** **No-applications** — already present on the dashboard (`EmptyState title="No applications yet"` → apply form / `/jobs`). Confirm it renders below the onboarding card (both visible for a brand-new user). No new code unless the mockup wants the CTA pointing at `/jobs` — if so, add a `Button`→`/jobs` to its `action`.
- [ ] **Step 2:** **No-saved-jobs** — coordinate with [saved-jobs.md](./saved-jobs.md) (its Task 4 already specs the `/saved` `EmptyState` "No saved jobs yet" → `/jobs`). If `/saved` exists, ensure the empty state matches the first-run copy; if onboarding lands first, this is owned by saved-jobs. **Don't duplicate.**
- [ ] **Step 3: Verify** — `--filter @ip/candidate build` clean; preview both empty states with their CTAs. Screenshot.
- [ ] **Step 4: Commit** — `git commit -am "feat(onboarding): candidate first-run empty states"`.

### Task 5: Employer wizard route + stepper + `auth.tsx` wiring

- [ ] **Step 1:** In `frontend/apps/company/lib/auth.tsx`, add `export const onboarding = makeOnboardingClient(ADMIN_URL, store);` (reuses the company token store).
- [ ] **Step 2:** Create `frontend/apps/company/app/onboarding/page.tsx`:
```tsx
"use client";
import { CompanyShell } from "../../components/company-shell";
import { EmployerOnboardingWizard } from "../../components/employer-onboarding-wizard";

// CompanyShell already runs useRequireAuth + useRequireRole(MANAGER_ROLES). No extra guard —
// and crucially NO guard forces a user INTO this route (never-gates).
export default function OnboardingPage() {
  return (
    <CompanyShell>
      <EmployerOnboardingWizard />
    </CompanyShell>
  );
}
```
- [ ] **Step 3:** Create `frontend/apps/company/components/employer-onboarding-wizard.tsx` — `useQuery(["onboarding"], () => onboarding.get("company"))`; render the **first unfinished required step** (resumption = "render steps whose `steps[id]` is falsy"; a stepper header shows progress over the 3 required steps); a persistent **"Skip / Finish later"** `Button` → `router.push("/jobs")` (progress is already saved step-by-step). On error, an inline `Alert` + retry — **never a blocking modal**. When all required steps are done, show a "You're set up" summary with links to ranked applicants + analytics. Each step is one of the thin components below; each calls `onboarding.completeStep("company", <id>)` on its existing success signal then advances.
- [ ] **Step 4: Verify** — `--filter @ip/company typecheck` clean (the wizard can render placeholder step bodies first; Task 6 fills them).
- [ ] **Step 5: Commit** — `git commit -am "feat(onboarding): employer wizard route + resumable stepper"`.

### Task 6: The 5 employer step shells (reuse existing flows)

- [ ] **Step 1 — `onboarding-step-job.tsx` (Post your first job, required):** embed the **existing extended `<JobForm>`** + the existing JD-assist panel (the same component `/jobs/new` uses — **do not duplicate**). On a successful `createJob`, `completeStep("company","post_first_job")` then advance. Reuse the form's own loading/error + the `inFlight` latch. *(If `JobForm` isn't extracted as a shared component yet, the step **links** to `/jobs/new` and marks `post_first_job` on the existing create-success signal — never reimplement the form.)*
- [ ] **Step 2 — `onboarding-step-invite.tsx` (Invite your team, optional):** reuse the existing `InviteRecruiter` (email + temp password). On ≥1 successful invite, `completeStep("company","invite_team")`; a **"Skip for now"** advances without marking. A solo recruiter is never stuck.
- [ ] **Step 3 — `onboarding-step-gate.tsx` (Set your gate-mode default, required — the first UI for `gate_mode`):** a `RadioGroup` for `AptitudeConfig.gate_mode` (`advisory | auto`) with **advisory pre-selected and badged "Recommended"** (copy: "AI recommends, you decide — no candidate is ever auto-rejected"; `auto` = "Auto-advance on pass" with a plain note). On confirm, persist as the company default (`company_defaults.gate_mode`, read by `JobForm` to pre-fill new jobs) and `completeStep("company","set_gate_default")`. Ground truth: `auto` = demo default, `advisory` = recommended production default ([compliance-advisory-gate-design](../../v2/2026-06-19-compliance-advisory-gate-design.md)).
```tsx
"use client";
import { Badge, Button, RadioGroup, RadioGroupItem } from "@ip/ui";
import { useState } from "react";

export function OnboardingStepGate({ onDone }: { onDone: (mode: "advisory" | "auto") => void }) {
  const [mode, setMode] = useState<"advisory" | "auto">("advisory");   // advisory pre-selected
  return (
    <div className="flex flex-col gap-4">
      <RadioGroup value={mode} onValueChange={(v) => setMode(v as "advisory" | "auto")}>
        <label className="flex items-start gap-3 rounded-lg border border-border p-3">
          <RadioGroupItem value="advisory" className="mt-0.5" />
          <span className="flex flex-col">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">Advisory <Badge tone="success" variant="subtle">Recommended</Badge></span>
            <span className="text-xs text-muted-foreground">AI recommends, you decide — no candidate is ever auto-rejected.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-border p-3">
          <RadioGroupItem value="auto" className="mt-0.5" />
          <span className="flex flex-col">
            <span className="text-sm font-medium text-foreground">Auto-advance on pass</span>
            <span className="text-xs text-muted-foreground">Candidates who pass the gate advance automatically.</span>
          </span>
        </label>
      </RadioGroup>
      <Button className="self-start" onClick={() => onDone(mode)}>Save default</Button>
    </div>
  );
}
```
- [ ] **Step 4 — `onboarding-step-consent.tsx` (Candidate-notification + consent default, required):** a thin step that sets a **default candidate-notification message** over the notifications center's existing static `_MESSAGES` seam (a single editable default string via a `Textarea` — **not** a template engine) and confirms the `automated_evaluation` consent posture. Copy: "Candidates always hear back — here's your default update message." On save, `completeStep("company","set_consent_default")`.
- [ ] **Step 5 — `onboarding-step-branding.tsx` (Optional branding, optional):** link to the existing `company_profiles` editor (`/branding`: logo, display name, "actively reviewing" badge). "Add later" skips. On a save round-trip (or a "done" return), `completeStep("company","setup_branding")`. **Do not** reimplement the editor.
- [ ] **Step 6: Verify** — `--filter @ip/company build` clean; preview the full wizard: post a job (the **real** `JobForm` + JD assist) → invite (or skip) → set **advisory** as the gate default → set the notification/consent default → (optional) branding → "You're set up"; **reloading mid-wizard resumes at the first unfinished step**; "Skip / Finish later" always works. Screenshot.
- [ ] **Step 7: Commit** — `git commit -am "feat(onboarding): 5 employer step shells (reuse JobForm/invite/gate/consent/branding)"`.

### Task 7: Company recruiter-home entry + empty states + gate-mode default in `JobForm`

- [ ] **Step 1:** On the recruiter home (`app/page.tsx` → `/jobs`), render a prominent **"Finish setting up your account"** `Card` → `/onboarding` **only** when `!progress.dismissed && !progress.completedAt` (a `useQuery(["onboarding"], () => onboarding.get("company"))`). It **invites**, never blocks — `/jobs`/`/talent`/`/analytics` are reachable without it.
- [ ] **Step 2:** **No-jobs** (recruiter home): `EmptyState` (icon + "No jobs posted yet" + "Post your first role to start receiving applicants" + `Button` → `/onboarding` or `/jobs/new`).
- [ ] **Step 3:** **No-applicants** (`app/jobs/[id]/page.tsx` ranked/applicants tab): `EmptyState` (icon + "No applicants yet" + "Share this job or wait for matches — you'll be notified" + optionally a copy-link affordance).
- [ ] **Step 4:** **`JobForm` pre-fill:** ensure `job-form.tsx` reads `company_defaults.gate_mode` for a new job's initial `gate_mode` (only if not already wired by Part A #2). One field, not a new collection.
- [ ] **Step 5: Verify** — `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck` green; preview: a fresh company lands on the recruiter home → "Finish setting up" + no-jobs empty state → enters `/onboarding` → completes the wizard → the card disappears; a job with no applicants shows the no-applicants empty state. **No route guard forces onboarding.** Screenshot.
- [ ] **Step 6: Commit** — `git commit -am "feat(onboarding): recruiter-home entry + company empty states + gate-default pre-fill"`.

---

## C. States & acceptance
- **States:** **candidate card** — loading (renders nothing, never a blocking spinner), active (checklist + nudges + `Progress`), dismissed (gone), complete (gone, `completedAt` set), error (the dashboard still renders; the card just doesn't). **Employer wizard** — loading (`LoadingState`), per-step (the embedded flow's own states), saving (`Button loading`), error (inline `Alert` + retry, never a blocking modal), complete ("You're set up" summary). **Empty states** — candidate no-applications / no-saved-jobs; company no-jobs / no-applicants — each `EmptyState` + a CTA back to the first-run path, plus `LoadingState`/`ErrorState`.
- **Responsive:** the candidate card's nudges go `sm:grid-cols-2`; the wizard is single-column on mobile; the gate `RadioGroup` cards stack; empty states center.
- **Dark mode:** tokens only → automatic (no gradient — onboarding is **product UI**, flat).
- **A11y:** the checklist is a semantic `<ul>/<li>` with text labels (icons `aria-hidden`); `Progress` has `aria-label`; the gate choice is a real `RadioGroup` with labelled items; Dismiss/Skip are real buttons; the wizard stepper exposes progress as text.
- **Acceptance:** matches the first-run mockups; **the four invariants hold** — skippable (Dismiss/Skip everywhere persists + never re-nags), resumable (step-by-step writes; reload resumes at the first unfinished step; no cursor), idempotent (re-completing/re-dismissing is a no-op; card + profile-save both safely call `completeStep`), **never-gates** (no route guard, no blocking modal; the dashboard/marketplace/`/jobs`/`/talent`/`/analytics` all render identically with the doc absent vs `dismissed=True` — locked by the backend never-gates test in [onboarding](../../v2/2026-06-19-onboarding.md) Task 8); **reuse, never reimplement** (the wizard embeds the existing `JobForm` + JD assist, reuses `InviteRecruiter`, links the `company_profiles` editor, writes only the existing `_MESSAGES`/consent seams; the gate step is the first UI for `gate_mode`, advisory default); `--filter @ip/candidate build` + `--filter @ip/company build` + `--filter @ip/{ui,shared,api-client} typecheck` green; works against the mock today and `api.onboarding` once `pnpm gen` lands (swap `makeMockOnboardingClient()` → the real `makeOnboardingClient` binding).
