# Job edit — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Build a **dedicated job-edit surface** at `/company/jobs/[id]/edit`. Today the recruiter flow
has a hole: `/company/jobs/new` creates jobs, `/company/jobs/[id]` is the pipeline / kanban
view, but **there is no dedicated route to edit a posted job's spec** — title, JD, marketplace
fields, rubric, interview config, decision policy. The pipeline view shows the job head but
deliberately does NOT inline the edit form (separation: pipeline = managing applicants,
edit = changing the role spec). This screen fills that gap.

The page **reuses the same cell composition as `/company/jobs/new`** (post-a-job) so a
recruiter who learned the post-a-job form recognises every section here. The only differences:

1. Title shows `Edit role · <Job title>` (not "Create a job").
2. The form is seeded from `Job.GetJob`; fields are pre-populated.
3. Submit calls `Job.UpdateJob` (not `Job.CreateJob`) — same shape minus `job_id`.
4. After save, route back to `/company/jobs/[id]` (the pipeline view), **not** the new job's
   detail.
5. A **Publish/Unpublish** chip is exposed on the page head (delegates to `PublishJob` /
   `UpdateJob({ status })` per the backend contract) — drafts can be published from here
   without leaving.
6. A **Discard changes** affordance is visible when the form is dirty.

The screen is brand-new — there is no existing route at `/company/jobs/[id]/edit` today; the
old pipeline view tried to shoe-horn editing inline, which we are removing in the v3 rebuild.

## Route + role

`/company/jobs/[id]/edit` (`apps/company/app/jobs/[id]/edit/page.tsx`) · **company** — guarded
by `useRequireRole(["recruiter", "company_admin"])` (enforced inside `CompanyShell`). Non-
managers are redirected by the shell before this page renders.

Server-side scoping is enforced too — `Job.GetJob` / `Job.UpdateJob` return `NOT_FOUND` on a
job that belongs to another company. The FE handles `NOT_FOUND` by rendering a calm `.cell`
"Job unavailable" with a Link back to `/company/jobs`.

## Approved mockup (build to this exactly)

- **Live demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — `.cell` cards, `.btn-primary` + `.btn-ghost`, `.pill-teal` chips, `.cell-visual` mono
  preview, `.tag` mono kickers, `.cell.anchor` for selected gate-mode tile.
- **Sibling reference:** the post-a-job plan
  ([`../post-a-job/frontend_post-a-job.md`](../post-a-job/frontend_post-a-job.md)) — the
  cell composition (Role / Requirements / Rubric / Interview config / Decision policy) is the
  same shape used here.
- **Screenshots:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.

No per-screen mockup yet — Task 0 builds it (an edit-mode variant of the post-a-job HTML).

## Existing code being REPLACED (not modified)

**NEW screen — no existing code is being replaced.** The route does not exist today; v2
attempted to merge the edit form into the pipeline view at `/company/jobs/[id]`, which we are
removing in the v3 rebuild (the pipeline view is now purely the kanban — see
[`../job-pipeline/frontend_job-pipeline.md`](../job-pipeline/frontend_job-pipeline.md)).

What is **NOT** touched: `CompanyShell` (existing `.app` shell + role gate),
`apps/company/app/jobs/job-form-types.ts` (`JobFormValues`, `EMPTY_JOB_FORM`, `RemoteMode`,
`EmploymentType`, `GateMode` — pure types, unchanged), `parseSkills` (its tests still pass),
`toCreateRequest` (its tests still pass — though the edit page uses an additional adapter,
`toUpdateRequest`, that mirrors the same shape with `jobId` included). The post-a-job cell
components under `frontend/apps/company/components/jobs/{role-cell, requirements-cell,
rubric-cell, interview-config-cell, gate-mode-tiles}.tsx` are **reused as-is** — they are
already controlled components driven by `JobFormValues`.

## Section spine — 8 regions, in order

Build only the new pieces — the cell bodies are reused from post-a-job.

| # | Region | Component | Notes |
|---|---|---|---|
| 0 | App shell | `<CompanyShell>` (existing) | `.app` sidebar + topbar. **Jobs & applicants** `aria-current`. Topbar crumb = `<Company> / Jobs / <Title> / Edit`. |
| 1 | Page head | `<EditJobHead />` | h1.display "Edit role" + `.sub` subline showing the job title (links back to `/company/jobs/[id]`). On the right: a `<JobStatusChip />` (status pill — `.pill-good` "Published" / `.pill-warn` "Draft" / `.pill-danger` "Archived") + a `<JobActionsMenu />` (`.btn.btn-ghost.btn-sm` with a kebab icon → menu: **Publish** / **Unpublish** / **Archive**). |
| 2 | `.cell` — Role | `<RoleCell />` (reused from post-a-job) | Title `.input` + JD `<textarea>` `.input` + **Improve with AI** affordance. Pre-seeded from `GetJob.title` + `GetJob.jdText`. |
| 3 | `.cell` — Requirements | `<RequirementsCell />` (reused) | Location 3-up + mode/type 2-up + salary 3-up + skills `.input` → `.pill-teal` chips. Pre-seeded from the additive fields on `GetJob`. |
| 4 | `.cell` — Rubric | `<RubricCell />` (reused) | Read-only `.cell-visual` mono preview of the **Aptura Core 6** rubric + a Customise rubric Link → `/company/rubrics`. No editing here. |
| 5 | `.cell` — Interview config | `<InterviewConfigCell />` (reused) | Duration mono select + focus-area `.pill-teal` chips + language select. Pre-seeded from `GetJob.aptitudeConfig` (when present; falls back to defaults). |
| 6 | `.cell` — Decision policy (`gate_mode`) | `<GateModeTiles />` (reused) | Two selectable `.cell` tiles (Advisory / Auto). Selected tile = `.cell.anchor` styling. Pre-seeded from `GetJob.gateMode`. |
| 7 | Sticky save bar | `<EditSaveBar />` | Sticky bottom row. Left = `.sub` showing dirty state ("Unsaved changes" with a mono `.dot` `--warn` when `isDirty`, else "All changes saved" with `--good`). Right = `.btn.btn-ghost` **Discard** (visible only when `isDirty`; opens a `ConfirmDialog`) + `.btn.btn-primary` **Save changes** (disabled until `isDirty` AND validation passes; spinner on pending; double-submit latch via existing `useRef`). |

## Layout & components — map to `@ip/ui` and tokens

| Region | Primitive | Tokens |
|---|---|---|
| Shell | `CompanyShell` (existing) | already on the new tokens |
| Page head | `h1.display` + `.sub` + status pill + kebab menu | typography + button + pill tokens |
| Status pill | `.pill-good` / `.pill-warn` / `.pill-danger` | semantic tokens (never raw `bg-emerald-*`) |
| Actions menu | `.btn.btn-ghost.btn-sm` trigger + dropdown panel (uses the same `Menu` primitive in `@ip/ui` as the topbar avatar) | button + dropdown tokens |
| Form cells | `.cell` (reused from post-a-job; 22px radius, 1.4rem padding, `.tag` mono kicker top-right) | `--surface`, `--line` |
| Inputs | `.input` (12px radius; teal focus ring via `--teal-glow`) | `--surface-2`, `--ink-deep`, `--teal-glow` focus |
| Sticky save bar | bottom-positioned `.cell.tight` with `box-shadow: 0 -8px 24px var(--ink-deep)/.04`; left dirty-state caption + right buttons | shadow tokens |
| Discard / publish dialogs | `ConfirmDialog` from `@ip/ui` | dialog tokens |
| NOT-FOUND state | full-width `.cell` (`--surface`) with `building` icon + h2 "Job unavailable" + Link to `/company/jobs` | semantic-token only — no scary red |

**Anti-slop ban** — no side-stripe borders on the save bar or cells, no glassmorphism, no SaaS
hero-metric template, no numbered-section markers (the cells are not a 5-act narrative). The
mono `.tag` kicker on each `.cell` is the only "label above the title" the page allows.

## Data wiring / seam

**Identical contract to post-a-job + one additional RPC for status flips.** No new client, no
new query key.

| Action | Hook | Query key | Source |
|---|---|---|---|
| Seed | `useAuthedQuery(token, ["job", jobId], () => api.jobs.getJob({ jobId }))` (same key the pipeline view uses) | `["job", jobId]` | `Job.GetJob` |
| Save | `useMutation((vals) => api.jobs.updateJob(toUpdateRequest(jobId, vals)))` → on success: invalidate `["job", jobId]` + `["jobs","recent"]` + `["jobs","list"]`, toast `.success("Saved")`, route to `/company/jobs/[id]` | — | `Job.UpdateJob` |
| Publish (status="draft" → "published") | `useMutation(() => api.jobs.publishJob({ jobId }))` → on success: invalidate same keys, toast `.success("Published")`, status pill flips | — | `Job.PublishJob` (stamps `posted_at`) |
| Unpublish / archive | `useMutation((status) => api.jobs.updateJob({ jobId, status }))` → on success: invalidate same keys, toast | — | `Job.UpdateJob` (status flip) |
| Improve JD | `useMutation((jdText) => jd.improveJd(jdText))` (same hook post-a-job uses) | — | `jd.improveJd` (ai-agents REST) |

**Adapters:**

- `parseSkills(input: string): string[]` — **unchanged**, reused from post-a-job.
- `toUpdateRequest(jobId, JobFormValues): UpdateJobRequest` — **new pure helper** at
  `frontend/apps/company/app/jobs/job-form-adapters.ts`. Mirrors `toCreateRequest` exactly
  (string → bigint salary, drop-empty, pass `gateMode`) but prepends `jobId`. The helper sits
  next to `toCreateRequest`; the unit test extends the existing post-a-job adapter test
  (`toUpdateRequest` ↔ `toCreateRequest` roundtrip).

**Form-state seeding.** On `GetJob` success, the FE maps the response into a `JobFormValues`
seed (the inverse of `toUpdateRequest`):

```ts
function toFormValues(job: JobResponse): JobFormValues {
  return {
    title: job.title,
    jdText: job.jdText,
    city: job.city ?? "",
    region: job.region ?? "",
    country: job.country ?? "",
    remoteMode: (job.remoteMode as RemoteMode) || "",
    employmentType: (job.employmentType as EmploymentType) || "",
    salaryMin: job.salaryMin ? String(job.salaryMin) : "",
    salaryMax: job.salaryMax ? String(job.salaryMax) : "",
    salaryCurrency: job.salaryCurrency ?? "",
    skills: job.skills ?? [],
    gateMode: (job.gateMode as GateMode) || "advisory",
  };
}
```

**Dirty tracking.** `isDirty = !deepEqual(formValues, seed)`. Reset on successful save. The
"Unsaved changes" caption + the Discard / Save buttons follow this single flag.

**Browser-leave warn.** When `isDirty`, the page registers a `beforeunload` listener that
shows the native "Are you sure you want to leave?" dialog. Cleared on unmount.

**Anti-fiction guard.** The form never invents a value the user didn't type. If `GetJob`
returns an empty field, that field is empty in the form (not auto-populated with a
"placeholder"). The Rubric cell shows the real Aptura Core 6 rubric — no fake "industry
average" callouts. The AI Improve button surfaces only the real `jd.improveJd` response. If
the AI is unavailable, the form is still saveable; a toast explains "AI suggestions
unavailable right now — your draft is fine." The Publish / Unpublish actions never lie about
visibility: an unpublished job's marketplace presence is removed within the `jobs` index
window (typically seconds), and the toast says truthfully "Published — your role will appear
in the marketplace within a minute."

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Build the per-screen mockup.** Create
> `docs/brand/redesign-v3/screens/job-edit.html` linking
> `@ip/ui/src/{tokens.css,app.css}` and the sprite. Embed the `.app` shell. Body =
> page head (with "Sample" job title + a `.pill-good` "Published" + a kebab menu) + 5 `.cell`
> sections (pre-filled with sample data, labelled "Sample") + a `.cell.anchor` selected
> gate-mode tile (Advisory) + a sticky save bar showing "Unsaved changes" (an `--warn` dot).
> Verify in both themes at 1440×900 and 390×844 against
> `D-aperture-pro-{light,dark}-full.jpeg` and the post-a-job mockup. Commit the new HTML file
> only.

- **Task 1 — Route + shell + page head + seed.** Mount `EditJobPage` under `CompanyShell` at
  `apps/company/app/jobs/[id]/edit/page.tsx`. Read `jobId` from `useParams()`. Wire the
  `["job", jobId]` query via `useAuthedQuery`. Handle `NOT_FOUND` → render the calm "Job
  unavailable" `.cell` + Link. Handle `LoadingState` (skeleton page head + 5 skeleton cells +
  skeleton save bar). On success, render `<EditJobHead />` with the status chip + actions menu;
  initialise the form seed via `toFormValues(job)`. Commit
  `apps/company/app/jobs/[id]/edit/page.tsx`,
  `apps/company/components/jobs/edit/{edit-job-head,job-status-chip,job-actions-menu}.tsx`.

- **Task 2 — Reuse post-a-job cells inside the edit page.** Render `<RoleCell />`,
  `<RequirementsCell />`, `<RubricCell />`, `<InterviewConfigCell />`, `<GateModeTiles />`
  (all imported from `apps/company/components/jobs/*`), each bound to the shared
  `JobFormValues` state via the same controlled `value` / `onChange` props they already
  accept. Confirm pre-population works for every field (title, JD, city/region/country,
  remote_mode, employment_type, salary_*, skills as chips, gate_mode tile selected). Commit
  `apps/company/app/jobs/[id]/edit/page.tsx` (composition only — no new cell components).

- **Task 3 — Sticky save bar + dirty tracking + Discard.** Build `<EditSaveBar />` reading
  `isDirty` from the form state vs the seed. Wire **Save changes** to a
  `useMutation((vals) => api.jobs.updateJob(toUpdateRequest(jobId, vals)))` with the existing
  `useRef` double-submit latch + an inline `errorMessage(err)` `.pill-danger` row on failure.
  On success: invalidate `["job", jobId]` + `["jobs","recent"]` + `["jobs","list"]`, toast,
  `router.push("/company/jobs/[id]")`. Build the **Discard** affordance: opens a
  `ConfirmDialog` ("Discard changes? Your edits will be lost."), on confirm resets the form to
  the seed (no fetch). Register the `beforeunload` listener while `isDirty`. Commit
  `apps/company/components/jobs/edit/edit-save-bar.tsx`,
  `apps/company/app/jobs/job-form-adapters.ts` (the new `toUpdateRequest` helper + its unit
  test).

- **Task 4 — Status actions (Publish / Unpublish / Archive).** Build `<JobActionsMenu />` —
  kebab `.btn.btn-ghost.btn-sm` opening a token-driven menu. Items vary by current status:
  - **draft** → **Publish** (fires `PublishJob` — stamps `posted_at` server-side).
  - **published** → **Unpublish** (fires `UpdateJob({ status: "draft" })`) + **Archive**
    (fires `UpdateJob({ status: "archived" })`).
  - **archived** → **Restore as draft** (fires `UpdateJob({ status: "draft" })`).
  Each item opens a `ConfirmDialog` with the truthful copy (e.g., for Publish: "Publish this
  role? It will appear in the marketplace within a minute."). On success, invalidate the
  same keys; the status pill flips automatically. Commit
  `apps/company/components/jobs/edit/job-actions-menu.tsx`.

- **Task 5 — Page assembly + fidelity verify.**
  1. `--filter @ip/company build` + `--filter @ip/company exec tsc --noEmit` green.
  2. Boot dev, sign in as a recruiter, navigate to `/company/jobs/[id]/edit` for an
     existing job. Screenshot in both themes at 1440×900 and 390×844 against the Task-0 HTML
     and the post-a-job HTML.
  3. Verify pre-population: every field carries the persisted value; the gate-mode tile
     reflects `gateMode`.
  4. Edit a field → save bar flips to "Unsaved changes" → **Save changes** → toast + route
     to `/company/jobs/[id]`; the pipeline view's `<JobHead />` reflects the new title.
  5. Hit **Publish** on a draft → confirm dialog → `PublishJob` → status pill flips to
     `.pill-good` "Published"; `posted_at` is stamped server-side.
  6. Hit **Discard** while dirty → confirm dialog → form resets to seed; **Save changes**
     disabled.
  7. Try to navigate away while dirty → native `beforeunload` warn fires.
  8. Try to load `/company/jobs/<other-tenant-job>/edit` → `NOT_FOUND` → calm "Job
     unavailable" `.cell` + Link.
  9. Confirm a non-manager (`candidate`) loading the route is redirected by `CompanyShell`.

  **Responsive verification** — sub-task (do not skip; quoted verbatim from the design-
  language `_design-language.md` Responsive section):

  1. **Screenshot at all 7 reference sizes:** 375 × 667 · 430 × 932 · 768 × 1024 portrait ·
     820 × 1180 portrait · 1024 × 1366 portrait · 1366 × 1024 landscape · 1440 × 900 ·
     1920 × 1080.
  2. **No horizontal scroll** at any width ≥ 320 px (test with
     `document.documentElement.scrollWidth`).
  3. **Every interactive element ≥ 44 × 44 px** when measured at the smallest breakpoint.
  4. **Keyboard does not cover form inputs** on iOS Safari (manual test or
     `visualViewport.height` check).
  5. **Orientation change** (portrait ↔ landscape) on iPad sizes — layout adapts gracefully,
     no clipped content.
  6. **`prefers-reduced-motion`** — every animation no-ops (test by enabling reduce-motion in
     DevTools).
  7. **Cross-browser:** iOS Safari, Chrome Android, Samsung Internet, desktop Safari /
     Chrome / Firefox / Edge — at minimum Safari + Chrome on every OS.
  8. **Save side-by-side proof** to
     `docs/brand/redesign-v3/verify/job-edit-{mobile,tablet,desktop}.jpeg`.

## States & a11y

- **States.**
  - **Loading** — page head + 5 cells + save bar all skeleton; the save bar shows "Loading…"
    in its caption with `aria-busy="true"`.
  - **Not-found** — calm "Job unavailable" `.cell` (no scary red) + Link to `/company/jobs`.
  - **Success / idle** — form populated from seed; save bar shows "All changes saved" with
    `--good` dot; **Save changes** disabled.
  - **Dirty** — save bar shows "Unsaved changes" with `--warn` dot; **Discard** + **Save
    changes** enabled.
  - **Validating** — Save disabled until required fields pass (title non-empty).
  - **Save pending** — Save button spinner + disabled; `useRef` double-submit latch prevents
    a second send.
  - **Save error** — inline `.pill-danger` error row at the top of the form +
    `toast.error(errorMessage)`; form values preserved.
  - **Save success** — toast `.success("Saved")` + `router.push("/company/jobs/[id]")`.
  - **Publish / Unpublish / Archive pending** — kebab item shows spinner; status pill stays
    in its old state until success.
  - **Status action success / error** — toast + status pill flip (success) or
    toast.error (error).
- **Responsive.** Sidebar collapses ≤1000px per the design language. Every sub-grid
  (location 3-up, mode/type 2-up, salary 3-up, gate-mode tiles 2-up) collapses to a single
  column ≤760px (inherited from the reused post-a-job cells). Sticky save bar stays at
  the bottom; on ≤540px the buttons stack vertically with **Save changes** full-width on top.
- **Dark + light.** All color via tokens (`.input` focus uses `--teal-glow`; gate-mode tile
  selected uses `.cell.anchor`'s teal-tinted gradient; status pills use semantic tokens). No
  raw hex.
- **A11y.** One `<h1>` per page (the edit head). `<main>` + `<section>` per cell. Every
  field is wrapped in a `<label>` (or `aria-labelledby`). The status pill is real text (not
  color-only); the kebab menu trigger is `aria-label="Job actions"` + `aria-haspopup="menu"`
  + `aria-expanded`. Menu items are real `<button>`s. The Save / Discard / Confirm dialogs
  are `role="dialog"` + `aria-modal="true"` + focus trap + ESC-to-close. Touch targets
  ≥44×44. Contrast ≥4.5:1. Focus rings via `:focus-visible` — `--teal` 2px / 4px halo.
  Reduced-motion: the save bar's dirty-state dot pulse no-ops under
  `prefers-reduced-motion: reduce`; the menu's open animation no-ops too.

## Acceptance

- Looks 1:1 like the per-screen Task 0 HTML AND the post-a-job HTML (same cell composition,
  same primitives) AND the relevant slices of
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Side-by-side
  screenshot proof committed under
  `docs/brand/redesign-v3/verify/job-edit-{light,dark}.jpeg`.
- `--filter @ip/company build` is green; `tsc --noEmit` is green; no console errors /
  warnings.
- **Zero new backend surface.** Same `Job.GetJob`, same `Job.UpdateJob`, same `Job.PublishJob`,
  same `jd.improveJd`. The `gate_mode` semantics are unchanged — the persisted value
  round-trips through `GetJob` → `toFormValues` → `<GateModeTiles />` → `toUpdateRequest` →
  `UpdateJob`.
- The reused post-a-job cell components (`RoleCell`, `RequirementsCell`, `RubricCell`,
  `InterviewConfigCell`, `GateModeTiles`) work in edit mode without modification — they are
  already controlled components. The new helpers (`toFormValues`, `toUpdateRequest`) live
  alongside `toCreateRequest`; their unit tests cover the round-trip.
- `Job.UpdateJob` server-side scoping (`NOT_FOUND` on cross-tenant `jobId`) is respected; the
  FE never leaks another tenant's job. The "Job unavailable" `.cell` is the only path a
  recruiter can hit for a cross-tenant ID.
- A non-manager loading `/company/jobs/[id]/edit` is still redirected by `CompanyShell`.
- Pipeline ↔ edit separation is enforced: the kanban page (`/company/jobs/[id]`) does NOT
  inline the form. Editing requires routing to `/company/jobs/[id]/edit`; saving routes back
  to `/company/jobs/[id]`.
