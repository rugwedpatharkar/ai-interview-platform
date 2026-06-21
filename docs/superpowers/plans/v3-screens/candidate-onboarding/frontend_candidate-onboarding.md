# Candidate onboarding — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

First-run candidate onboarding wizard — collected right after `/register` so the candidate lands on
`/` with a usable profile + the recommendation engine has enough signal to fire on first paint.
Four short, low-friction steps inside the **Aperture Pro** `.app` candidate shell, rendered as a
single anchor `.cell` with a progress strip at the top of the page and a per-step inner form.
Reuses the existing `ProfileService` (`getMyProfile` / `updateMyProfile`) verbatim — no new RPC,
no new collection. The candidate can skip-for-now from any step; "Continue later" lands on `/` and
the dashboard's empty branches do their normal thing.

## Route + role

`/onboarding` · **candidate** (`useRequireAuth` + `useRequireRole(["candidate"])`).

Entry: the post-register router push lands on `/onboarding` (instead of straight to `/`) when
`getMyProfile()` returns the still-default profile. On completion of step 4 (or on
"Continue later"), the page calls `router.push("/")`. The dashboard's existing empty branches own
the post-onboarding follow-up — this screen does not re-render the dashboard.

## Approved mockup (build to this exactly)

- **Design language (canonical):** [`../_design-language.md`](../_design-language.md) — see the
  `.app` candidate shell, `.cell.anchor`, `.bar` (used for the progress strip), and the
  primary/ghost button treatment. The wizard is a single anchor cell with a step-bar across the
  top; the wizard body switches per-step.
- **Reference demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — pull tokens, type scale, `.bar` shape, button treatment, mono labels.
- **Sibling reference (shell + primitives):**
  [`../candidate-dashboard/frontend_candidate-dashboard.md`](../candidate-dashboard/frontend_candidate-dashboard.md)
  — same `.app` shell, same nav primitives, same KPI/cell vocabulary.

No per-screen mockup file yet. Build to the design language + the candidate-dashboard sibling and
verify side-by-side with the dashboard at task end (so the two surfaces read as the same product).

## Existing code being REPLACED (not modified)

**This is a NEW screen — there is no existing code per screen.** The previous product flow routed
post-register users straight to `/` and left them to discover the empty profile via the dashboard's
"Profile" link. The new flow inserts this screen between `/register` and `/`.

Files that will be **created** by this plan (no replacements):

- `frontend/apps/candidate/app/onboarding/page.tsx` — new route file, mounts `<Onboarding />`.
- `frontend/apps/candidate/components/onboarding.tsx` — new wizard component (4 steps + step
  controller).
- `frontend/apps/candidate/components/onboarding/step-role-prefs.tsx`
- `frontend/apps/candidate/components/onboarding/step-location-work-pref.tsx`
- `frontend/apps/candidate/components/onboarding/step-resume-upload.tsx`
- `frontend/apps/candidate/components/onboarding/step-consent-done.tsx`

Files **adjusted** (one-line redirect only — listed for completeness; not a UI rebuild):

- `frontend/apps/candidate/lib/auth.tsx` — the post-register `router.push("/")` becomes
  `router.push("/onboarding")` **only when** `getMyProfile()` returns the default-empty profile
  (no role prefs, no work pref, no résumé URL). Returning candidates skip the wizard.

The candidate-shell sidebar + topbar live in `@ip/ui` (introduced by the landing rebuild's
design-system task) and are consumed here unchanged.

## Layout & components

**Shell:** `.app` sidebar + topbar (candidate audience), identical to the dashboard. Sidebar shows
`Profile` as `aria-current="page"` for the duration of the wizard (the wizard is a one-off profile
flow); on completion / skip the active item flips back to `Dashboard` once the route changes.

| Region | Markup / class | Notes |
|---|---|---|
| Sidebar | `.app > .side` | Same nav as the dashboard. The wizard does not collapse the sidebar (so the candidate sees where they're going next). On mobile (≤ 760px), the sidebar collapses to a drawer — same as the dashboard. |
| Topbar | `.topbar` | Left: `.crumb` "Home / Onboarding". Right: `.toolbar` with the audience pill ("Candidate"), notification bell, avatar. The searchbox is hidden on this page — the wizard owns the user's attention. |
| Page head | `.page-head` | `<h1 class="display">Set up your profile</h1>` (Schibsted 700, `--step-3`) + `.sub` ("Four short steps. You can change anything later in **Profile**."). Right side: a `.btn.btn-ghost` "Continue later" → `router.push("/")`. |
| Progress strip | `.onboarding-progress` (new — composes `.bar` + mono step labels) | Top of the anchor cell. 4 segments of `.bar` (5px height, `--surface-3` track, `--teal` fill). Each segment has a mono `.bar-label` underneath (`01 · Role` · `02 · Location` · `03 · Résumé` · `04 · Done`); the **current** step's label is `--ink-deep`, completed steps are `--teal-strong`, upcoming steps are `--ink-3`. The strip is sticky to the top of the anchor cell. |
| Wizard body | `.cell.anchor` (full row, `grid-column: span 6` at ≥1100px; full bleed at ≤ 760px) | Inner form per step. The cell carries a `.tag` micro-label "`STEP {n}/4`" top-right. Body uses a single-column form grammar (`display: grid; gap: 1.25rem`) with labels above inputs (form pattern rule). |
| Footer controls | `.toolbar.onboarding-footer` (inside the anchor cell, sticky-bottom on the cell at ≤ 540px) | Two buttons: `.btn.btn-ghost` "Back" (disabled on step 1) + `.btn.btn-primary` "Continue" / "Finish" (label flips on step 4). Between them, a mono `.step-count` (`Step 2 of 4`). |

### Per-step bodies

| # | Step | Inputs | Output → profile field |
|---|---|---|---|
| 1 | **Role preferences** | `<MultiSelect>` of role families (Engineering, Design, Product, Data, Sales, Support, Operations, Other) + `<Input>` "Preferred role title" (free text, ≤ 80 chars) + `<MultiSelect>` seniority (Intern · Junior · Mid · Senior · Staff · Manager) | `desiredRoles[]`, `seniority` |
| 2 | **Location + work preference** | `<Input>` "Where are you based?" (free text, ≤ 80 chars) + `<RadioGroup>` "Work preference" (Remote · Hybrid · On-site · Flexible) + `<MultiSelect>` "Open to relocate to" (cities — free-text tag input) | `location`, `workPreference`, `relocateTo[]` |
| 3 | **Résumé** | `<FileUpload accept=".pdf,.doc,.docx" maxSize="10MB">` (drag-and-drop tile + click-to-upload) + a `.cell-sub` showing the parsed-preview line ("We'll pre-fill experience from this — you can edit later.") + a "Skip — I'll add this later" `.btn.btn-ghost.btn-sm` link directly below the tile | `resumeUrl`, `resumeUploadedAt` |
| 4 | **Review + consent** | `.cell-row`-style summary of the 3 prior steps (role / location / résumé filename) + a single `<label>` + checkbox ("I consent to Aptura using this profile to recommend roles and to share my answers + score with companies I apply to.") + a single primary CTA "Finish setup" | `consentedAt`, `onboardingCompletedAt` |

> **Primitives reference (do NOT redefine):** `.app · .side · .topbar · .crumb · .toolbar · .cell · .cell.anchor · .bar · .pill · .pill-teal · .btn · .btn-primary · .btn-ghost · .btn-sm · .badge · .tag · .tnum` — all defined in `@ip/ui/src/app.css` per the [design language](../_design-language.md). Form controls (`<Input>`, `<MultiSelect>`, `<RadioGroup>`, `<FileUpload>`) come from `@ip/ui` form primitives — reuse, do not roll fresh.

**New presentational pieces to build:** `.onboarding-progress` (the segmented step bar) and the per-step body sections. Both compose entirely from existing primitives — only the spacing wrapper is new.

## Data wiring / seam

- **Client/seam:** `useAuth().api.profile.*` over the existing protobuf-es gRPC-web client.
  - `getMyProfile({})` → `{ profile }` — read once on mount; pre-fills the form when the candidate
    returns mid-flow (e.g., closed the tab on step 2).
  - `updateMyProfile({ ...partial })` — single mutation; called once per step's "Continue" click
    (small upserts, not a single fat write at the end), so the candidate can leave + return
    without losing progress.
  - `uploadResume({ filename, contentBase64 })` (existing — the profile service already exposes
    a presigned upload path today) → `{ resumeUrl }`. The FE feeds the returned `resumeUrl` into
    the next `updateMyProfile` call.
- **Query keys (new, client-side only):**
  - `["profile","mine"]` — the existing key used by the profile screen; this page invalidates it
    on each step submit so a profile preview elsewhere (if any) stays fresh.
  - `["onboarding","progress"]` — **purely client-side** (TanStack `useState` wrapped in a hook;
    NOT a `useQuery`). Tracks `currentStep`, `dirty`, `lastSavedAt`. The hook hydrates from
    the latest `profile` on mount (e.g., if `resumeUrl` is set, jump to step 4) and persists
    nothing to the server beyond the per-step `updateMyProfile`.
- **Mutations:** `updateMyProfile` (per step) + `uploadResume` (step 3 only). Both invalidate
  `["profile","mine"]`. No optimistic UI — each step's "Continue" awaits the mutation and shows a
  loading state on the primary button.
- **Skip-for-now:** the "Continue later" topbar button calls `router.push("/")`. No partial-save
  semantics — every step's "Continue" already saved its slice. The dashboard's empty branches
  handle a half-filled profile gracefully (existing behavior).
- **Backend:** see [`backend_candidate-onboarding.md`](./backend_candidate-onboarding.md) — **no
  proto delta, no new RPC.**

## Tasks (build → screenshot-verify → commit per task)

> **Task 0 — Design language is the mockup.** No per-screen HTML mockup. Build to the design
> language + the candidate-dashboard sibling; verify side-by-side that the wizard reads as the same
> product as the dashboard.

- **Task 1 — `<Onboarding />` shell + progress strip.** Build the page route + the anchor `.cell`
  + the `.onboarding-progress` segmented bar (4 segments, `.bar` shape, mono labels). Wire the
  client-side `useOnboardingProgress()` hook (state machine over `currentStep` ∈ `1..4`). The body
  renders a placeholder per step. Verify the strip animates segment fills as `currentStep`
  advances; verify the back/continue buttons disable correctly on step 1 and step 4 respectively.
  Commit `apps/candidate/app/onboarding/page.tsx`,
  `apps/candidate/components/onboarding.tsx`, the new `.onboarding-progress` CSS in
  `frontend/packages/ui/src/app.css`.

- **Task 2 — Step 1 (role prefs) + Step 2 (location + work pref).** Build both step bodies.
  Each step's "Continue" calls `updateMyProfile` with that step's slice and advances
  `currentStep` only after success (button shows `loading` state). Field validation is inline
  (required: at least one role family in step 1; required: location + work pref in step 2).
  Verify: error from the mutation surfaces as an in-step `<Alert tone="danger">`; success
  invalidates `["profile","mine"]`. Commit the two step files +
  `apps/candidate/components/onboarding.tsx`.

- **Task 3 — Step 3 (résumé upload + parse).** Build the upload tile (drag-and-drop + click).
  On select, call `uploadResume` (streaming the file through the existing profile-service
  presigned path); on success, persist `resumeUrl` via `updateMyProfile`. Show upload progress
  (`.bar` indeterminate during the request). Render the "skip — I'll add this later" `.btn-ghost.btn-sm`
  link that advances to step 4 without uploading. Verify: file-size > 10 MB shows a friendly
  inline error and does not start the upload; non-pdf/doc/docx is rejected client-side; an
  upload error surfaces via `errorMessage(err)`; the parsed-preview helper line renders only
  after a successful upload. Commit.

- **Task 4 — Step 4 (review + consent + finish).** Render the 3-row summary of prior steps (role,
  location, résumé filename or "skipped"). The single `<label>` + checkbox gates the primary CTA
  ("Finish setup") — disabled until ticked. On click, call `updateMyProfile` with
  `consentedAt = new Date().toISOString()` + `onboardingCompletedAt = now`, then
  `router.push("/")`. Verify the post-finish dashboard renders with the wizard's data populated;
  verify a returning candidate who already finished onboarding gets redirected away from
  `/onboarding` to `/` on mount (defensive — see lib/auth.tsx note above). Commit.

- **Task 5 — Full assembly + fidelity verify + Responsive verification.**
  1. `--filter @ip/candidate build` is green; `--filter @ip/candidate exec tsc --noEmit` is green.
  2. Run the dev server, register a fresh candidate, walk through all 4 steps; verify each
     step's data lands in `getMyProfile()` after submit (DevTools network tab).
  3. Walk through with a partial flow: complete step 1, close tab, sign in again, navigate to
     `/onboarding` — the wizard hydrates to step 2 with step 1's data populated.
  4. Side-by-side fidelity check vs. the candidate dashboard (same shell, same tokens, same
     button treatment). Save proofs at
     `docs/brand/redesign-v3/verify/candidate-onboarding-{light,dark}.jpeg`.
  5. **Responsive verification** — execute the 8-step list from
     [`../_design-language.md`](../_design-language.md) §"Mandatory verification":
     1. **Screenshot at all 7 reference sizes:** 375 × 667 · 430 × 932 · 768 × 1024 portrait ·
        820 × 1180 portrait · 1024 × 1366 portrait · 1366 × 1024 landscape · 1440 × 900 ·
        1920 × 1080.
     2. **No horizontal scroll** at any width ≥ 320 px (test with
        `document.documentElement.scrollWidth`).
     3. **Every interactive element ≥ 44 × 44 px** when measured at the smallest breakpoint.
     4. **Keyboard does not cover form inputs** on iOS Safari (manual test or
        `visualViewport.height` check) — the form's sticky footer respects `safe-area-inset-bottom`.
     5. **Orientation change** (portrait ↔ landscape) on iPad sizes — layout adapts gracefully,
        no clipped content.
     6. **`prefers-reduced-motion`** — every animation no-ops (test by enabling reduce-motion in
        DevTools); the progress-strip fill transition becomes instant.
     7. **Cross-browser:** iOS Safari, Chrome Android, Samsung Internet, desktop Safari /
        Chrome / Firefox / Edge — at minimum Safari + Chrome on every OS.
     8. **Save side-by-side proof** to
        `docs/brand/redesign-v3/verify/candidate-onboarding-{mobile,tablet,desktop}.jpeg`.

## States & a11y

- **States.**
  - **Loading (initial profile fetch)** — `LoadingState` inside the anchor cell; the progress
    strip renders disabled.
  - **Empty profile (fresh candidate)** — wizard opens on step 1 with empty inputs.
  - **Partial profile (returning candidate)** — wizard opens on the first incomplete step,
    with prior steps' inputs pre-filled and marked complete in the progress strip.
  - **Per-step submitting** — primary button shows `loading` ("Saving…"), form inputs disabled.
  - **Per-step error** — `<Alert tone="danger">` inside the step body; form re-enables.
  - **Already complete** — defensive redirect to `/` on mount.
- **Responsive.**
  - ≥ 1100 px — anchor cell is `min(72rem, 100% - 2.5rem)` centered; form is single-column with
    comfortable gutters; footer buttons inline.
  - 760–1099 px — anchor cell full-width within the shell content area; progress strip stays
    sticky to the cell top.
  - ≤ 760 px — sidebar collapses to a drawer (same as the dashboard); anchor cell full-bleed;
    progress strip becomes a 2×2 grid of segments (each segment shorter; labels wrap underneath);
    footer buttons become **full-width sticky** to `safe-area-inset-bottom` (`position: sticky;
    bottom: env(safe-area-inset-bottom);`).
  - ≤ 540 px — form labels above inputs; primary CTA spans full width.
- **Dark + light:** all colors via tokens; the `.bar` fill is `--teal` (resolves to the per-user
  accent); the "step complete" segment uses `--teal-strong`; pills use the semantic token swatches.
- **Reduced motion:** `prefers-reduced-motion: reduce` disables the progress-segment fill
  transition (segments swap to the new state instantly) and any `.rise` reveal — content remains
  visible.
- **A11y.**
  - One `<h1>` per page (the wizard headline); each step body uses `<h2>` for the step title.
  - The `.onboarding-progress` is `role="progressbar"` with `aria-valuemin="1" aria-valuemax="4"
    aria-valuenow={currentStep}` and a text label ("Step 2 of 4: Location and work preference").
  - Step navigation buttons are real `<button>`s with disabled states and `aria-disabled`.
  - Inline field errors use `aria-describedby` and `--danger` color; never color-only.
  - `<FileUpload>` exposes a real `<input type="file">` (keyboard-accessible) under the
    drag-and-drop tile; drag-and-drop is an enhancement, not the only path.
  - The consent checkbox is a real `<input type="checkbox">` in a `<label>` (not a click-on-div).
  - Focus rings via tokens (`--teal` 2px outline + 4px halo); touch targets ≥ 44 × 44; body
    contrast ≥ 4.5:1.
  - **iOS auto-zoom suppression** — every `<input>` / `<select>` / `<textarea>` has
    `font-size ≥ 16px` per the design language responsive rules.

## Acceptance

- The wizard reads as the same product as the candidate dashboard — same tokens, same type
  scale, same shell, same button treatment. Side-by-side proof committed at
  `docs/brand/redesign-v3/verify/candidate-onboarding-{light,dark}.jpeg` and the responsive
  trio at `…-{mobile,tablet,desktop}.jpeg`.
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors / warnings;
  reduced-motion is honored.
- Each step's "Continue" successfully writes its slice via `updateMyProfile` and advances
  `currentStep` only on success; "Continue later" navigates to `/` without losing the slices
  already saved.
- A returning candidate with a complete profile is redirected away from `/onboarding` to `/` on
  mount; a returning candidate with a partial profile lands on the first incomplete step with
  prior steps pre-filled.
- The strict-proctored interview surface is **not** referenced from this screen — onboarding is
  pre-application; no proctoring controls appear here.
- Pre-launch anti-fiction posture preserved: copy uses "Sample" / generic phrasing for any helper
  / placeholder text (e.g., the parsed-preview helper says "We'll pre-fill experience from this"
  — not "**Sample employer** parsed your résumé"). No fake company names, no fake outcomes, no
  fake recommendations on this surface.
