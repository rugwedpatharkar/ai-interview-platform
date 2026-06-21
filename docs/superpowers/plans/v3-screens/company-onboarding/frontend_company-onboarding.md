# Company onboarding — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Build the **first-run wizard** a recruiter lands on right after `/company/register`. The
register screen creates the tenant + the admin's account; this screen turns "I just signed up"
into "we have a workspace ready to interview candidates". A 4-step linear wizard inside the `.app`
company shell:

1. **Company profile** — name (seeded), about, website, locations, logo upload.
2. **First role draft** — a minimal `Job` (title + JD only; full posting happens later on
   `/company/jobs/new`).
3. **Invite team** — invite 0..N teammates (`recruiter` / `hiring_manager`); skippable.
4. **Billing link** — confirm "Pilot — no billing required" copy + a deep-link to
   `/company/billing`; primary CTA is **Finish** (the actual billing surface is admin-only and
   lives at its own route).

On completion → `router.push("/company")` with a "Workspace ready" toast. The wizard is
**resumable on this device only** (progress kept in `localStorage` under
`aptura.onboarding.progress.v1`); refreshing mid-wizard rehydrates the step + filled fields, and
a `?step=` query string drives deep-linking. All four steps reuse **frozen, already-existing**
RPCs — the wizard is purely a composition layer, no new backend surface.

The screen is brand-new — there is no existing UI to delete; this is the first time onboarding
exists as its own route.

## Route + role

`/company/onboarding` (`apps/company/app/onboarding/page.tsx`) · **company** — guarded by
`useRequireRole(["recruiter", "company_admin"])` (enforced inside `CompanyShell`). A signed-in
non-manager hitting the route is redirected to `/company` by the shell. The Billing-link step
deep-links to `/company/billing`, which is admin-only — the link is rendered for everyone but
explains "Billing is managed by your company admin" when the caller is a recruiter (truthful
copy, no fake "loading…" placeholder).

## Approved mockup (build to this exactly)

- **Live demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — pull the wizard composition from the demo's `.cell.anchor` (the gradient-tinted anchor cell)
  for the **active step body**, the `.acts > .act` numbered scaffold for the **step strip**
  (the 5-act walkthrough uses the same `.act-num` mono step label this wizard needs), the
  `.input` + `.btn` + `.pill-teal` primitives for fields and chips, and the `.match > .card`
  rows for the invite-team list.
- **Screenshots:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.

There is no per-screen mockup yet — Task 0 builds it.

## Existing code being REPLACED (not modified)

**NEW screen — no existing code is being replaced.** This route does not exist today; the
post-register flow drops users directly on `/company` (the dashboard). The wizard is additive:
it composes existing services (`CompanyProfileService.UpsertCompanyProfile`, `Job.CreateJob`,
`TeamService.InviteMember`) into a guided first-run experience.

What is **NOT** touched: `CompanyShell` (existing `.app` shell + role gate),
`apps/company/app/company-profile/*` (the standalone company-profile editor — same DTO, same
upsert RPC; this wizard's Step 1 reads/writes through the **same** client),
`apps/company/app/jobs/new/*` (the full post-a-job form — Step 2 only seeds a draft), or
`apps/company/app/team/*` (the team-permissions surface — Step 3 only fires `InviteMember`).

## Section spine — 5 regions, in order

Build each as its own component under `frontend/apps/company/components/onboarding/`.

| # | Region | Component | Notes |
|---|---|---|---|
| 0 | App shell | `<CompanyShell>` (existing) | `.app` sidebar + topbar. Sidebar has **no `aria-current`** during onboarding (the wizard is a takeover, not a regular page); render the sidebar in a muted state via `data-onboarding="true"`. Topbar crumb = `<Company> / Get started`. Topbar action = a `.btn.btn-ghost.btn-sm` **Skip setup** that opens a `ConfirmDialog` ("Skip setup? You can come back later from the dashboard") and on confirm `router.push("/company")` after writing `{ skipped: true }` to the progress key. |
| 1 | Page head | `<OnboardingHead />` | h1.display "Welcome, <company name>" (seeded from `useAuth().identity.companyName`) + `.sub` "Three quick steps to your first verified interview. Takes about 2 minutes." Truthful — no fake "join 500+ teams" social-proof line. |
| 2 | Step strip | `<StepStrip />` | A horizontal row of 4 `.cell.tight` step cards. Each carries a mono `.tag` "STEP <n>", an Schibsted h4 step title, a one-line `.sub` summary, and a leading state dot: `.pill-good` (✓ done), `.pill-teal` (● current), `.pill` (○ upcoming). Click a done/current step → jumps to it. The current step's card adopts `.cell.anchor` styling (teal-tinted background + teal border). Below the strip, a `.bar` progress meter shows `(completed / 4) * 100%`. |
| 3 | Active step body | `<StepBody>` | One large `.cell.anchor` (24px radius, gradient teal-soft background) hosting the step's fields + per-step **Next** / **Back** / **Skip** controls in a sticky inner footer. Body content swaps per `currentStep`. See per-step composition below. |
| 4 | Bottom nav | `<WizardNav />` | Inside the `.cell.anchor` footer (not a global toolbar — the wizard owns the chrome). Left = `.btn.btn-ghost` **Back** (disabled on step 1). Center = `.sub` "Your progress is saved on this device". Right = `.btn.btn-ghost` **Skip this step** (steps 3 and 4 only — profile + role drafts are required) + `.btn.btn-primary` **Next** (label flips to **Finish** on step 4). Pending = spinner; disabled until step validation passes. |

### Per-step composition

- **Step 1 — Company profile (`<StepCompanyProfile />`)**
  - `.input` Company name (seeded from the tenant; required) — `.sub` help: "How candidates will see you."
  - `.input` Website (optional; type="url"; `inputMode="url"`).
  - `.textarea.input` About (optional; rows=4; max 600 chars with mono `.tnum` counter).
  - Locations row — `.input` (comma-separated city / region / country) rendered below as
    `.pill-teal` chips (parsed identically to `parseSkills`, comma-split + trim + dedupe).
  - Logo `.input[type=file]` — drag-and-drop `.cell.tight` that uploads via the **existing**
    `CompanyProfileService.GetLogoUploadUrl` presign + `PUT` flow (do not reinvent — reuse the
    same hook the standalone company-profile editor uses).
  - **Submit on Next**: `useMutation((vals) => api.companyProfile.upsertCompanyProfile(vals))`
    → on success, write `{ step: 2, profile: true }` to the progress key, advance.
- **Step 2 — First role draft (`<StepFirstRole />`)**
  - h4 "Draft your first role" + `.sub` "Just a title and a description today — you'll finish
    posting it from the dashboard."
  - `.input` Job title (required).
  - `.textarea.input` JD (required; rows=8; `.btn.btn-ghost.btn-sm` "✦ Improve with AI" wired
    to the **existing** `jd.improveJd` mutation, same as post-a-job).
  - **Submit on Next**: `useMutation((vals) => api.jobs.createJob({ title, jdText, status:
    "draft" }))` → on success, write `{ step: 3, jobId: result.jobId }` to progress, advance.
    Server falls back to its proto3 defaults for the additive marketplace fields; the
    post-a-job form fills them out properly later.
- **Step 3 — Invite team (`<StepInviteTeam />`)**
  - h4 "Invite your team" + `.sub` "Optional — you can do this from Team & permissions later."
  - A growing list of invite rows (one `.match > .card`-style row per draft invite). Each row =
    `.input` email + `.input` role select (`recruiter` / `hiring_manager` — admins are promoted
    separately on `/company/team`) + `.btn.btn-ghost.btn-sm` **Remove**. `.btn.btn-ghost`
    **+ Add another** appends a row.
  - Skip is allowed and visible — the step is truly optional.
  - **Submit on Next**: `Promise.all(rows.map(r => api.team.inviteMember({ email: r.email, role:
    r.role, tempPassword: generateTempPassword() })))` (server generates the verify email;
    `tempPassword` is the truthful client-side seed, same as the team-permissions Invite modal).
    Best-effort — individual failures surface as toast errors but do not block the wizard. On
    success, write `{ step: 4, invitedCount: rows.length }` to progress, advance.
- **Step 4 — Billing link (`<StepBillingLink />`)**
  - h4 "You're on a pilot" + `.sub` "No billing during the pilot. When that changes, you'll set
    up payment from the Billing page."
  - Truthful copy block:
    - "**No active subscription** — talk to us about a pilot."
    - "**Where billing lives** — `/company/billing` (admins only)."
  - `.btn.btn-ghost` **Open Billing** Link → `/company/billing` (opens in a new tab; admins see
    the full surface, recruiters see the admin-only fallback there).
  - **Submit on Next**: writes `{ step: "complete", completedAt: ISO }` to progress,
    `router.push("/company")`, toast `.success("Workspace ready")`.

## Layout & components — map to `@ip/ui` and tokens

Pull every primitive from `@ip/ui` per [`_design-language.md`](../_design-language.md).

| Region | Primitive | Tokens |
|---|---|---|
| Shell | `CompanyShell` (existing) | already on the new tokens via the design-language Task 1 |
| Page head | `h1.display` + `.sub` | typography tokens |
| Step strip card | `.cell.tight` (current → `.cell.anchor` styling) + `.tag` mono + state dot pill | `--surface`, `--line`, `--teal`, `--teal-soft` |
| Step progress bar | `.bar > .t > i` | `--teal` fill, `--surface-3` track |
| Active step body | `.cell.anchor` (24px radius, gradient teal-soft) | `--teal-soft`, `--surface` |
| Inputs | `.input` (12px radius; teal focus ring via `--teal-glow`) | `--surface-2`, `--ink-deep`, `--teal-glow` |
| Textareas | `.textarea.input` (auto-grow; min-h 8rem) | as above |
| Skill / location chips | `.pill-teal` | teal pill tokens |
| Logo drop zone | `.cell.tight` (dashed `--line-2` border on idle; `--teal` border on drag-over) | `--surface-2` |
| Invite row | `.match > .card` (no avatar — just inputs + Remove) | as design language |
| AI improve button | `.btn.btn-ghost.btn-sm` with `#spark` icon | button tokens |
| Wizard nav buttons | `.btn.btn-primary` (Next/Finish), `.btn.btn-ghost` (Back/Skip) | button tokens |

All primitives live in `@ip/ui/src/app.css`. **No new tokens.** **Anti-slop ban** — no
side-stripe borders on the step strip cards (state is conveyed via the leading pill dot + the
anchor styling on the current step), no glassmorphism on the body cell, no progress bar
gradient fill (solid `--teal`).

## Data wiring / seam

**Every RPC the wizard calls is already live. No new query, no new mutation, no new client.**

| Step | Action | Hook | Source |
|---|---|---|---|
| 1 | Read seed | `useAuthedQuery(token, ["company-profile","me"], () => api.companyProfile.getCompanyProfile({ compId: tenantId }))` — same key as the standalone profile editor uses (so the wizard and the editor share cache; finishing the wizard pre-warms the editor) | `CompanyProfileService.GetCompanyProfile` |
| 1 | Logo presign | `useMutation(() => api.companyProfile.getLogoUploadUrl())` → presigned `PUT` | `CompanyProfileService.GetLogoUploadUrl` |
| 1 | Save profile | `useMutation((vals) => api.companyProfile.upsertCompanyProfile(vals))` → on success: invalidate `["company-profile","me"]` + advance | `CompanyProfileService.UpsertCompanyProfile` |
| 2 | Improve JD | `useMutation((jdText) => jd.improveJd(jdText))` (same hook post-a-job uses) | `jd.improveJd` (ai-agents REST) |
| 2 | Create draft | `useMutation((vals) => api.jobs.createJob({ title, jdText, status: "draft" }))` → invalidate `["jobs","recent"]` (so the dashboard's recent-jobs cell picks it up) | `Job.CreateJob` |
| 3 | Invite member | `useMutation((p) => api.team.inviteMember(p.email, p.role, p.tempPassword))` — same client the team-permissions screen uses; on success: invalidate `["team","members"]` | `TeamService.InviteMember` |
| — | Progress | `useOnboardingProgress()` → `localStorage` get/set with `aptura.onboarding.progress.v1` key (a tiny custom hook in `apps/company/lib/onboarding-progress.ts`; FE-only, never persisted server-side) | (FE-only) |

**New query keys this screen owns** — both are **client-side only** (no fetch):

- `["company-onboarding","progress"]` — the rehydrated `OnboardingProgress` snapshot
  (`{ step: 1|2|3|4|"complete", profile?: boolean, jobId?: string, invitedCount?: number,
  completedAt?: string, skipped?: boolean }`). Used to drive the `<StepStrip />` state.
  Invalidated by every step's `onSuccess`.
- `["company-onboarding","step"]` — the current step derived from `?step=` querystring +
  progress key (querystring wins). Pure derived state — no fetch.

**Anti-fiction guard.**

- The wizard does **not** invent invites, draft jobs, or company-profile fields. If a user
  hits **Skip** on step 3, no `InviteMember` call fires; the wizard advances clean.
- Step 4 says exactly "No active subscription — talk to us about a pilot." It does **not**
  show a fake trial countdown, a fake "$0 / month" badge, or a fake invoice. The real billing
  surface — also new — at `/company/billing` carries the same truthful empty state.
- A failed `UpsertCompanyProfile` / `CreateJob` / `InviteMember` mutation surfaces
  `toast.error(errorMessage(err))`. The step does not advance. The wizard is not "fake
  successful" — failures stay visible until resolved.
- The seeded company name is real (`useAuth().identity.companyName`); if it's empty for any
  reason (unusual but possible right after register), Step 1's company-name input renders blank
  with a `.pill-warn` "We didn't get your company name — please add it now" caption.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Build the per-screen mockup.** Create
> `docs/brand/redesign-v3/screens/company-onboarding.html` linking
> `@ip/ui/src/{tokens.css,app.css}` and the SVG sprite. Embed the `.app` shell verbatim from
> the design language; build the page head + a 4-card step strip (step 2 is the current step,
> styled as `.cell.anchor`) + a sample `.cell.anchor` body for the active step (here showing
> Step 2 "First role draft" with sample title / JD / `✦ Improve with AI` ghost button) +
> sticky bottom nav (Back / Skip / Next). Sample data is labelled "Sample" — placeholder
> company "Sample Co", placeholder JD "This is an example role…". Verify in both themes at
> 1440×900 and 390×844 against `D-aperture-pro-{light,dark}-full.jpeg`. Commit the new HTML
> file only.

- **Task 1 — Shell + page head + step strip + progress hook.** Mount the page under
  `CompanyShell`; render `<OnboardingHead />` and `<StepStrip />`. Build the
  `useOnboardingProgress()` hook (read / write `aptura.onboarding.progress.v1`; resolve the
  current step from `?step=` if present, else from the persisted key, else from `1`). Wire
  click-to-jump on already-done steps. Confirm the `.bar` progress meter reflects
  `completedSteps / 4`. Commit `apps/company/app/onboarding/page.tsx`,
  `apps/company/components/onboarding/{onboarding-head.tsx,step-strip.tsx}`,
  `apps/company/lib/onboarding-progress.ts`.

- **Task 2 — Step 1 (Company profile).** Build `<StepCompanyProfile />` over the existing
  `CompanyProfileService.GetCompanyProfile` seed + the existing `UpsertCompanyProfile`
  mutation + the existing logo presign + `PUT` flow (do **not** reinvent — reuse the same
  hooks the standalone editor uses, so the cache key `["company-profile","me"]` stays unified).
  Validate: name required + ≤ 200 chars; website is `https?://`; locations parse via the
  `parseSkills` pattern. On submit success, advance to Step 2. Commit
  `components/onboarding/step-company-profile.tsx`.

- **Task 3 — Step 2 (First role draft).** Build `<StepFirstRole />` with title + JD inputs +
  the **Improve with AI** affordance (`jd.improveJd`). On submit, fire
  `api.jobs.createJob({ title, jdText, status: "draft" })`; store the returned `jobId` in
  progress. Server applies its own proto3 defaults for the additive marketplace fields;
  the user finishes posting on `/company/jobs/new` (the dashboard surfaces a "Finish posting"
  CTA on draft jobs already). Validate: title + JD required. Commit
  `components/onboarding/step-first-role.tsx`.

- **Task 4 — Step 3 (Invite team).** Build `<StepInviteTeam />` with a growing list of invite
  rows (email + role select). **Skip** is fully supported and visible. On submit,
  `Promise.all(rows.map(r => api.team.inviteMember(...)))` — collect per-row results and
  surface `toast.error` for failures without blocking the step. Use the existing
  `EMAIL_RE` for client validation; role select is curated to `recruiter` /
  `hiring_manager` only. Verify a duplicate email returns `ALREADY_EXISTS` and surfaces a
  per-row error inline. Commit `components/onboarding/step-invite-team.tsx`.

- **Task 5 — Step 4 (Billing link).** Build `<StepBillingLink />` — truthful "No active
  subscription — talk to us about a pilot." copy block, `Open Billing` ghost Link, **Finish**
  primary CTA. On Finish, write `{ step: "complete", completedAt: ISO }` to progress, fire
  `toast.success("Workspace ready")`, `router.push("/company")`. Commit
  `components/onboarding/step-billing-link.tsx`.

- **Task 6 — Page assembly + fidelity verify.**
  1. `apps/company/app/onboarding/page.tsx` mounts `<CompanyOnboarding />` inside
     `<CompanyShell>`; the wizard hides the sidebar's `aria-current` via
     `data-onboarding="true"`.
  2. `--filter @ip/company build` + `--filter @ip/company exec tsc --noEmit` are green.
  3. Boot the dev server, sign in as a freshly-registered recruiter, navigate to
     `/company/onboarding`, walk the full 4-step flow in both themes. Screenshot each step at
     1440×900 and 390×844 against the Task-0 HTML.
  4. Refresh the page on Step 3 → the wizard rehydrates Step 3 with the already-saved profile +
     draft jobId in the progress key.
  5. Hit **Skip setup** in the topbar → confirm dialog → `router.push("/company")`; the
     dashboard renders normally and the progress key is marked `{ skipped: true }`.
  6. Hit **Finish** on Step 4 → toast + dashboard; confirm the recent-jobs cell on the
     dashboard now shows the draft role created in Step 2 (because the wizard invalidated
     `["jobs","recent"]`).
  7. Confirm a non-manager (`candidate`) loading `/company/onboarding` is redirected by
     `CompanyShell`'s `useRequireRole(["recruiter","company_admin"])`.

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
     `docs/brand/redesign-v3/verify/company-onboarding-{mobile,tablet,desktop}.jpeg`.

## States & a11y

- **States.**
  - **Step strip** — every step is one of `done` / `current` / `upcoming`; the leading dot pill +
    `.cell.anchor` styling on the current step convey state with text + color.
  - **Step body** — `idle` (form populated from progress + seed reads) · `validating` (Next
    disabled until required fields pass) · `pending` (Next button spinner + form `aria-busy`) ·
    `error` (per-mutation `toast.error(errorMessage)`; form stays mounted with values
    preserved) · `success` (advance to next step + write to progress).
  - **Logo upload** — `idle` / `selecting` / `uploading` (progress bar inside the drop-zone) /
    `done` (logo preview) / `error` (re-tryable, truthful copy "Upload failed — please try
    again").
  - **Skip setup** — `ConfirmDialog` ("Skip setup? You can come back later from the
    dashboard.") with **Skip** `.btn.btn-ghost` + **Keep going** `.btn.btn-primary`.
  - **Completion** — toast `.success("Workspace ready")` + redirect; the progress key flips to
    `step: "complete"` so re-visiting `/company/onboarding` shows a `.cell` "You've finished
    setup. Open the dashboard." with a Link back.
- **Responsive.** Sidebar collapses ≤1000px per the design language. The step strip is a 4-up
  row at ≥1100px, 2-up grid at ≤1100px, single-column stack at ≤760px (current step always
  rendered first when stacked). The active step body's inner footer goes from horizontal
  (Back / Skip / Next) to single-column stacked CTAs ≤540px with **Next** full-width on top.
  Invite-team rows go from horizontal (email + role + Remove) to vertical (label-above-input)
  stacking ≤540px.
- **Dark + light.** All color via tokens; the `.cell.anchor` step body uses
  `color-mix(in oklch, var(--teal) 8%, var(--surface))` so it resolves cleanly in both themes
  and inherits per-user Appearance accent overrides.
- **A11y.** One `<h1>` per page (the head). The step strip is `<ol aria-label="Onboarding
  steps">` with each step as `<li>` carrying `aria-current="step"` on the current one. The
  active step body is a labelled `<section aria-labelledby="step-<n>-title">`. Every input is
  wrapped in a `<label>` (or `aria-labelledby`). The drop-zone is `<button
  aria-label="Upload company logo">` with keyboard activation. The Next button is `type="submit"`
  inside a real `<form>`; the Back / Skip / Skip-setup buttons are `type="button"`. The
  progress bar is `<div role="progressbar" aria-valuemin="0" aria-valuemax="100"
  aria-valuenow="...">`. Touch targets ≥ 44 × 44 px. Contrast ≥ 4.5:1 body (`--ink-2` on
  `--bg`). Focus rings via `:focus-visible` — `--teal` 2px / 4px halo. Reduced-motion: the
  step transition (a soft fade between bodies) no-ops under `prefers-reduced-motion: reduce`.

## Acceptance

- Looks 1:1 like the per-screen Task 0 HTML AND the relevant slices of
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Side-by-side
  screenshot proof committed under
  `docs/brand/redesign-v3/verify/company-onboarding-{light,dark}.jpeg`.
- `--filter @ip/company build` is green; `tsc --noEmit` is green; no console errors / warnings.
- **Zero new backend surface.** Same `CompanyProfileService.UpsertCompanyProfile`, same
  `CompanyProfileService.GetLogoUploadUrl`, same `Job.CreateJob`, same
  `TeamService.InviteMember`, same `jd.improveJd`. The wizard is a pure composition; no new
  proto, no new RPC, no new collection. The contract that the post-a-job form uses (additive
  `gate_mode`, `posted_at`, etc.) is left as proto3 defaults on the draft created here.
- Progress is **device-local** (localStorage); no server-side onboarding state is created.
  Switching devices mid-wizard restarts at Step 1 with the already-saved profile / role /
  invites visible (because those went through their respective real RPCs and persisted
  server-side).
- The Step 1 cache key `["company-profile","me"]` is **shared** with the standalone profile
  editor on `/company/company-profile` — finishing the wizard pre-warms that page; editing
  the profile elsewhere invalidates the wizard's seed.
- A non-manager loading `/company/onboarding` is still redirected by `CompanyShell`'s
  `useRequireRole(["recruiter","company_admin"])`.
- Anti-fiction posture is enforced — no fake invoices, no fake invites, no fake "you saved
  N hours" callouts, no claimed integrations. Step 4 says truthfully "No active subscription
  — talk to us about a pilot."
