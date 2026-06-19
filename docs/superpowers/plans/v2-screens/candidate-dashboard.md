# Screen: Candidate dashboard / tracker (enhance) — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 1, marketplace block).
> **Route:** `frontend/apps/candidate/app/page.tsx` (authed branch) → `frontend/apps/candidate/components/dashboard.tsx` (enhance) · **Mockup:** dashboard with funnel-progress `ApplicationCard`s + `RecommendedRoles` · **Pillar:** candidate app (existing) + [recommendation] + [job-marketplace](../../v2/2026-06-19-job-marketplace.md)
> **Goal:** Enhance the signed-in candidate dashboard: each application becomes an **`ApplicationCard`** showing its **funnel progress** (applied → aptitude → interview → decision) with the right stage actions, alongside the existing **`RecommendedRoles`** — **keeping the existing 10s conditional poll** (`refetchInterval` gated on non-terminal states via `TERMINAL_STATES`).

The dashboard already exists (`components/dashboard.tsx`, rendered by `app/page.tsx` for an authed candidate) and works: it lists `ListMyApplications`, has an apply form, withdraw with confirm, the assistant chat, and `RecommendedRoles`. This is an **enhancement** of the application rendering — extract an `ApplicationCard` that draws the funnel as a stepper/progress and surfaces the stage CTA — **reusing the existing query, mutations, poll, and status map verbatim**. **No new backend RPC** (optionally an EXTEND for richer per-stage detail; the funnel renders from the existing `state` today).

---

## A. Backend contract (hand this to a backend session)

**Status:** EXISTING (funnel renders from the existing `state`) · **Service:** `admin` `ApplicationService` + `RecommendationService` (gRPC-web). The dashboard consumes exactly these (unchanged):

- **`api.applications.listMyApplications({})`** → `{ applications: Application[] }`. Each `Application` the card renders:
  - `applicationId: string`
  - `jobId: string`
  - `state: string` — the funnel state. The full state vocabulary (from `@ip/ui` `applicationStatus`, code-verified): `applied`, `aptitude_pending`, `gated_out`, `interview_pending`, `interview_in_progress`, `interviewed`, `scored`, `shortlisted`, `hired`, `rejected`, `withdrawn`, `expired`, `abandoned`. The card maps `state` → label+tone via the **existing** `applicationStatus(state)` and → funnel position via a new pure `funnelStage(state)` (Task 1).
  - *(optional EXTEND, render-if-present)* `jobTitle: string` + `companyName: string` — so the card shows the role name instead of `Job {jobId}`. Today the page renders `Job {a.jobId}`; if `ListMyApplications` is EXTENDED to embed the title/company (a small join), the card uses them. **Not required** for this screen — gate the FE on presence.
- **`api.applications.apply({ jobId, consent })`** → submits an application (existing apply form; success toasts + invalidates `["applications"]` and `["recommendations"]`).
- **`api.applications.withdrawApplication({ applicationId })`** → withdraws (existing `ConfirmDialog`; success invalidates `["applications"]` + `["recommendations"]`).
- **`api.recommendations.getCandidateRecommendations({})`** → `{ matches: { jobId: string; score: number; reasons: string[] }[] }` (consumed by the existing `RecommendedRoles` component, unchanged).

- **Auth/scope:** bearer required (candidate role); applications + recommendations are the caller's own (subject from token).
- **Backed by:** the existing `ApplicationService`/`RecommendationService` resources + collections (built). The funnel **needs no new field** — it's a pure function of the existing `state`.
- **Proto delta:** **none required.** Optional EXTEND: embed `job_title` + `company_name` on the `Application` returned by `ListMyApplications` (a join the card uses if present). Optional future EXTEND for a richer timeline (per-stage timestamps) is **out of scope** here.
- **FE mock shape:** none new — binds to the **existing** `api.applications.*` / `api.recommendations.*`.

> **Contract seam:** nothing to mock. The funnel-progress rendering is derived **client-side** from the `state` already returned; the conditional poll already exists.

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `frontend/apps/candidate/components/application-card.tsx` (the funnel-progress card + stage CTA, extracted from the inline `list.map`)
- Create: `frontend/apps/candidate/lib/funnel.ts` (pure `funnelStage(state)` → step index + a `FUNNEL_STEPS` labels array)
- Create: `frontend/apps/candidate/lib/funnel.test.ts` (state → stage mapping, incl. terminal/branch states)
- Modify: `frontend/apps/candidate/components/dashboard.tsx` (render `ApplicationCard` in place of the inline card; **keep** the query/poll/mutations)

**Components:** new `ApplicationCard`; **reuse** the existing `RecommendedRoles` (unchanged), `@ip/ui` `Card`/`CardContent`, `Badge`, `Button`, `ConfirmDialog`, `Progress`, `EmptyState`, `LoadingState`, `ErrorState`, `applicationStatus`; `@ip/shared` `TERMINAL_STATES`, `errorMessage`. Icons: `lucide-react` (`Briefcase`, `FileText`, `CheckCircle2`, `Circle`) — in the app.
**Query keys:** `["applications"]` + `["recommendations"]` (existing — unchanged).

> **Enhancement discipline:** do **not** change the `useAuthedQuery(["applications"])` config — especially the `refetchInterval: (query) => apps.some((a) => !TERMINAL_STATES.has(a.state)) ? 10_000 : false` conditional poll (it's the live tracker), the `inFlight` apply latch, the apply/withdraw mutations, or the `["recommendations"]` invalidations. The `ApplicationCard` is a presentational shell fed the existing `Application` + the withdraw handler. (Behavior preservation — extraction + funnel viz, not a rewrite.)

### Task 1: `funnelStage` — the pure state→funnel mapping (TDD)

The funnel is **derived** from the existing `state`. Define the canonical stages and a pure mapping, with the branch/terminal states handled explicitly so the card never renders a nonsensical progress bar.

- [ ] **Step 1: Write the failing test** — `frontend/apps/candidate/lib/funnel.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { funnelStage, FUNNEL_STEPS } from "./funnel";

describe("funnelStage", () => {
  it("has four canonical steps", () => {
    expect(FUNNEL_STEPS).toEqual(["Applied", "Aptitude", "Interview", "Decision"]);
  });
  it("maps progress states to a step index", () => {
    expect(funnelStage("applied").index).toBe(0);
    expect(funnelStage("aptitude_pending").index).toBe(1);
    expect(funnelStage("interview_pending").index).toBe(2);
    expect(funnelStage("interview_in_progress").index).toBe(2);
    expect(funnelStage("interviewed").index).toBe(3);
    expect(funnelStage("scored").index).toBe(3);
    expect(funnelStage("shortlisted").index).toBe(3);
    expect(funnelStage("hired").index).toBe(3);
  });
  it("flags ended states (terminal / gated / rejected) so the card can de-emphasise the bar", () => {
    expect(funnelStage("hired").ended).toBe(true);
    expect(funnelStage("rejected").ended).toBe(true);
    expect(funnelStage("gated_out").ended).toBe(true);
    expect(funnelStage("withdrawn").ended).toBe(true);
    expect(funnelStage("applied").ended).toBe(false);
  });
  it("marks negative outcomes so the bar isn't drawn as success", () => {
    expect(funnelStage("rejected").negative).toBe(true);
    expect(funnelStage("gated_out").negative).toBe(true);
    expect(funnelStage("hired").negative).toBe(false);
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/candidate test funnel` → FAIL. *(Wire vitest into `apps/candidate` if absent — fold in.)*
- [ ] **Step 3: Implement** `frontend/apps/candidate/lib/funnel.ts`:
```ts
import { TERMINAL_STATES } from "@ip/shared";

export const FUNNEL_STEPS = ["Applied", "Aptitude", "Interview", "Decision"] as const;

// Which funnel step a state sits at. Branch states (gated_out/rejected) snap to the
// step where they ended; the flags let the card render them as "stopped", not "in progress".
const STEP_INDEX: Record<string, number> = {
  applied: 0,
  aptitude_pending: 1,
  gated_out: 1,                 // ended at aptitude
  interview_pending: 2,
  interview_in_progress: 2,
  interviewed: 3,
  scored: 3,
  shortlisted: 3,
  hired: 3,
  rejected: 3,
  withdrawn: 0,
  expired: 0,
  abandoned: 0,
};
const NEGATIVE = new Set(["gated_out", "rejected", "expired", "abandoned"]);

export interface Stage { index: number; ended: boolean; negative: boolean; }

export function funnelStage(state: string): Stage {
  return {
    index: STEP_INDEX[state] ?? 0,
    ended: TERMINAL_STATES.has(state) || state === "gated_out",
    negative: NEGATIVE.has(state),
  };
}
```
> Note `TERMINAL_STATES` (code-verified) = `{withdrawn, hired, rejected, expired, abandoned}`; `gated_out` is a stop but **not** in that set, so the funnel adds it explicitly to `ended`. This keeps the poll's terminal logic (in the page) and the card's "ended" logic consistent without duplicating the set.
- [ ] **Step 4: Run test, verify it passes** — `npx pnpm@9.15.0 --filter @ip/candidate test funnel` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(dashboard): pure funnelStage state→step mapping"`.

### Task 2: `ApplicationCard` (funnel progress + stage CTA)

- [ ] **Step 1:** Create `frontend/apps/candidate/components/application-card.tsx`:
```tsx
"use client";
import { Badge, Button, Card, CardContent, ConfirmDialog, Progress, applicationStatus } from "@ip/ui";
import { TERMINAL_STATES } from "@ip/shared";
import { CheckCircle2, Circle, FileText } from "lucide-react";
import Link from "next/link";

import { FUNNEL_STEPS, funnelStage } from "../lib/funnel";

export interface AppItem {
  applicationId: string;
  jobId: string;
  state: string;
  jobTitle?: string;        // optional EXTEND
  companyName?: string;     // optional EXTEND
}

/** One application as a funnel-progress card. Derives the stage from `state`; shows the
 * stage CTA (take test / start interview) and a withdraw confirm for non-terminal apps.
 * Pure presentational — the withdraw action + busy flag are passed in by the dashboard. */
export function ApplicationCard({
  app, onWithdraw, withdrawing,
}: { app: AppItem; onWithdraw: (id: string) => void; withdrawing: boolean }) {
  const status = applicationStatus(app.state);
  const stage = funnelStage(app.state);
  const title = app.jobTitle ?? `Job ${app.jobId}`;
  const pct = stage.negative ? 100 : ((stage.index + 1) / FUNNEL_STEPS.length) * 100;

  return (
    <Card hoverable>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              <FileText className="size-4" aria-hidden />
            </span>
            <div className="flex flex-col gap-1">
              <p className="font-medium text-foreground">{title}</p>
              {app.companyName && <p className="text-sm text-muted-foreground">{app.companyName}</p>}
              <Badge tone={status.tone} className="w-fit">{status.label}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {app.state === "aptitude_pending" && (
              <Link href={`/aptitude/${app.applicationId}`}><Button variant="secondary" size="sm">Take test</Button></Link>
            )}
            {app.state === "interview_pending" && (
              <Link href={`/interview/${app.applicationId}`}><Button size="sm">Start interview</Button></Link>
            )}
            {!TERMINAL_STATES.has(app.state) && (
              <ConfirmDialog
                trigger={<Button variant="ghost" size="sm">Withdraw</Button>}
                title="Withdraw application?"
                description="This can't be undone — you'd need to re-apply."
                confirmLabel="Withdraw" destructive busy={withdrawing}
                onConfirm={() => onWithdraw(app.applicationId)}
              />
            )}
          </div>
        </div>

        {/* Funnel: 4-step rail + a thin progress bar. Negative outcomes render the bar muted. */}
        <div>
          <ol className="flex items-center justify-between text-xs">
            {FUNNEL_STEPS.map((label, i) => {
              const done = !stage.negative && i <= stage.index;
              const current = !stage.ended && i === stage.index;
              return (
                <li key={label} className="flex flex-1 flex-col items-center gap-1">
                  {done ? <CheckCircle2 className="size-4 text-success" aria-hidden />
                        : <Circle className={current ? "size-4 text-brand-500" : "size-4 text-muted-foreground/40"} aria-hidden />}
                  <span className={done ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                </li>
              );
            })}
          </ol>
          <Progress value={pct} size="sm" className="mt-2"
            aria-label={`Application progress: ${status.label}`} />
        </div>
      </CardContent>
    </Card>
  );
}
```
- [ ] **Step 2:** In `components/dashboard.tsx`, replace the inline `{list.map((a) => { … <Card> … })}` block with `{list.map((a) => <ApplicationCard key={a.applicationId} app={a} withdrawing={withdraw.isPending} onWithdraw={(id) => withdraw.mutate(id)} />)}`. **Keep** the `applications` query (incl. the `refetchInterval` poll), the `withdraw` mutation, the `EmptyState`/`LoadingState`/`ErrorState` branches, the apply form, and `<RecommendedRoles/>` — all unchanged. Drop the now-unused inline `applicationStatus`/`status` local (it moved into the card) **only if** nothing else in the page uses it.
- [ ] **Step 3: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate build` clean (stop dev first); preview: each application renders as a funnel card with the correct stage highlighted; `aptitude_pending` shows "Take test", `interview_pending` shows "Start interview", non-terminal shows "Withdraw"; a `rejected`/`gated_out` app shows the muted/ended bar; the **10s poll** still refetches while any app is non-terminal (watch the network tab) and **stops** once all are terminal. Screenshot.
- [ ] **Step 4: Commit** — `git commit -am "feat(dashboard): ApplicationCard with funnel progress + stage CTA"`.

### Task 3: Section polish (keep `RecommendedRoles`, tidy headings)

- [ ] **Step 1:** Confirm `RecommendedRoles` is still rendered above the applications section (it is — `components/recommended-roles.tsx`, consuming `["recommendations"]`). **No change** to it. Optionally tighten the dashboard heading/empty-state copy to match the mockup (the existing `EmptyState title="No applications yet"` → keep, it points to the apply form). If onboarding ([onboarding.md](./onboarding.md)) is built, its `CandidateOnboardingCard` renders **above** the tracker — leave a slot; do not duplicate the empty state.
- [ ] **Step 2: Verify** — `--filter @ip/candidate build` + `--filter @ip/{ui,shared,api-client} typecheck` green. Preview the full dashboard: apply form → recommended grid → funnel-card tracker → assistant chat. Screenshot.
- [ ] **Step 3: Commit** — `git commit -am "feat(dashboard): keep RecommendedRoles + funnel-tracker layout"`.

---

## C. States & acceptance
- **States:** preserved + enhanced — **loading** (`LoadingState`, existing), **empty** (`EmptyState` "No applications yet" → apply form, existing), **error** (`ErrorState` + retry, existing), **success** (funnel `ApplicationCard`s). The **live poll** is unchanged: `refetchInterval` returns `10_000` while any app is non-terminal (`!TERMINAL_STATES.has(state)`), else `false` — the tracker updates without a manual refresh and idles once everything is terminal. Apply (busy + `inFlight` latch) and withdraw (confirm + busy) states are unchanged. `RecommendedRoles` keeps its own loading/empty/error.
- **Responsive:** cards stack; the card header goes `sm:flex-row`; the 4-step funnel rail stays horizontal (compact) and the actions wrap; the recommended grid is `sm:grid-cols-2`.
- **Dark mode:** tokens only → automatic (the brand-100/brand-500-15 icon swatch + `text-success`/`text-brand-500` funnel markers have dark-correct tokens).
- **A11y:** the funnel is an `<ol>` of steps with text labels (not icon-only); the `Progress` has an `aria-label` naming the current status; the stage CTAs are real `Link`/`Button`s; the withdraw `ConfirmDialog` is keyboard-accessible (existing).
- **Acceptance:** matches the dashboard mockup (funnel-progress cards + recommended roles); the funnel is derived purely from the existing `state` (no new field needed); **the 10s conditional poll, apply, and withdraw behave exactly as before** (same `Application.ListMyApplications`/`apply`/`withdrawApplication`, same `TERMINAL_STATES` gating, same `["recommendations"]` invalidations); `--filter @ip/candidate build` + `typecheck` green; the optional `job_title`/`company_name` EXTEND is the only backend nicety and the card degrades to `Job {jobId}` without it.
