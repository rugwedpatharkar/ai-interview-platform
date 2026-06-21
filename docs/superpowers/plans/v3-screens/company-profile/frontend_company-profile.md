# Company profile — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Public, crawlable, SSR company profile at `/companies/[id]`. SSR streams branding (logo, name,
about, website, locations) plus **funnel-derived trust signals** (`activelyReviewing`,
`respondsInDays`, `openJobs`) and the company's published roles (reusing the **same** `JobCard`
as `/jobs`). Replace every byte of the old v2 company UI (which used the `.app` shell + Midnight
reskin) with a brand-new **public marketing-style** surface built from Aperture Pro primitives —
same mega-nav + utility rule as the landing, a wide editorial container, a branding `.cell.anchor`
with the company avatar + trust-chip row, and a separate "Open roles" section that grids the same
new `<JobCard />` produced by the marketplace plan. Behavior, the SSR fetch seam, `notFound()`
handling, `trustChips()` semantics, and the `JobCardDTO` consumer contract are all unchanged. Only
the UI is new. Pre-launch posture throughout — trust signals are funnel-derived (never self-
reported), no fake employer reviews, no fake testimonials, no claimed integrations.

## Route + role

`/companies/[id]` (`frontend/apps/candidate/app/companies/[id]/page.tsx`) · **public** (token-
free SSR; `SaveJobButton` islands gate on auth). No `.app` shell — this is the same **public
marketing-style** shell as the landing, `/jobs`, and `/jobs/[id]`.

## Approved mockup (build to this exactly)

- **Interactive demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — design-language reference. The company profile is a new public surface inside the same
  shell; build the branding header from the `.cell.anchor` vocabulary in the demo, and the
  open-roles grid from the same `<JobCard />` produced by the marketplace plan.
- **Light-theme full page:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-full.jpeg`
- **Light-theme hero:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-hero.jpeg`
- **Dark-theme full page:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-full.jpeg`
- **Dark-theme hero:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-hero.jpeg`

No per-screen mockup file exists yet; this plan is the spec until one is added. Side-by-side
screenshot proof against the design language is part of the acceptance criteria — see
"Acceptance" below.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope (assume these files are re-written from scratch; do not port markup
or Tailwind classes):

- `frontend/apps/candidate/app/companies/[id]/page.tsx` — SSR server component
- `frontend/apps/candidate/app/companies/[id]/not-found.tsx` — not-found surface
- `frontend/apps/candidate/app/companies/[id]/error.tsx` — error boundary surface (if present)
- `frontend/apps/candidate/components/trust-badges.tsx` — markup rebuilt; `trustChips()` import unchanged

**Untouched (data + behavior seam — FROZEN):**

- `frontend/apps/candidate/app/companies/[id]/company-client.ts` — `companyProfile = USE_MOCK ? mock.profile : getCompanyProfile`; `companyJobs = USE_MOCK ? mock.jobs : getCompanyJobs`
- `frontend/apps/candidate/app/companies/[id]/types.ts` — `CompanyProfileDTO`, `TrustSignals`, `CompanyJobsResult` (and the imported `JobCardDTO` from `../../jobs/types`)
- `trustChips(trust)` helper (ordered chip array; hides responsiveness chip at `respondsInDays === 0`; pluralizes "open role(s)") — unit-tested; **do not change semantics**
- SSR revalidate windows: `revalidate: 300` for profile, `revalidate: 120` for jobs; profile 404 → `notFound()`; jobs error → `{ jobs: [] }`
- `generateMetadata({params})` (title + description) and `notFound()` on 404
- The reused `<JobCard />` from the marketplace plan and its `["saved-jobs","ids"]` save-button wiring

## Layout & components — map to `@ip/ui` primitives and tokens

Public marketing-style surface. Use the **landing shell** (mega-nav + utility rule + mega-footer)
already moved into `@ip/ui` by the landing plan's Task 1. Below the shell sits a wide
container (`.wrap`) with a breadcrumb, a branding header, and an open-roles section.

| Region | Component (new) | Tokens / primitives |
|---|---|---|
| Top utility rule | reused `<UtilityRule />` from `@ip/ui` | pre-launch coral pill + meta + right link |
| Sticky mega-nav | reused `<MegaNav />` from `@ip/ui` | brand + 6 nav links + audience switch + `Sign in` + primary CTA |
| Breadcrumb | `<CompanyBreadcrumb />` (new) | thin row inside `.wrap`: `← Companies` link in Geist Mono `--step--1`, hover-underline `--ink-2`; trailing segment shows company name with `aria-current="page"` |
| Branding header | `<CompanyHero />` (new) | `.cell.anchor` (large gradient-tinted teal-soft cell, 24px radius, 1.6rem padding); 2-column at ≥760px: left = Avatar (96px logo) over name `.display` (Schibsted 700, `--step-4`) + website ghost link with `ExternalLink` icon + a wrapping locations row with `MapPin` icon and Geist Mono `--step--1` locations; right = `<TrustStrip />` |
| Trust strip | `<TrustStrip />` (new) | a column of three chips: first ("Actively reviewing") is `.pill-good` (success); second ("Responds in ~X days") is `.pill-teal` and is **hidden when `respondsInDays === 0`**; third ("N open role(s)") is neutral `.pill` (pluralized; "1 open role" vs "N open roles"); below the chips, a tiny mono footnote in `--ink-3` reads "Signals derived from real applicant funnel — never self-reported." |
| About section | `<AboutBlock />` (new) | a supporting `.cell` (22px radius) under the hero; small Geist Mono micro-label "About"; body text from `profile.about` at `--step-1` `--ink-2`, capped at 65–75ch; collapses to nothing (returns `null`) when `about` is empty |
| Open roles section | `<OpenRolesSection />` (new) | section padding `clamp(4rem,7vh,6rem) 0`; section head with `<h2 class="display">Open roles</h2>` + a Geist Mono mono-count badge to the right (`Showing N · page X of Y`); below, a vertical stack of the **same** `<JobCard />` produced by the marketplace plan |
| Job card | reused `<JobCard />` from marketplace plan | identical bento `.cell` structure; `companyName` / `Avatar` redundant on this page is OK (the marketplace card is the shared component — do not fork) |
| Empty | `<EmptyState />` (new) | a single `.cell` with `briefcase` icon, h3 "No open roles right now", body lead "This company isn't currently hiring through Aptura. Check back soon, or browse other open roles.", and a primary `.btn.btn-ghost` "Browse open roles" → `/jobs` |
| Pagination | `<Pagination />` (new) | shared with marketplace; centered row of `.btn.btn-ghost.btn-sm` + Geist Mono page indicator; only rendered when `companyJobs.total > pageSize` |
| Not-found | `<NotFoundCard />` (in `not-found.tsx`) | centered `.cell` with `building` icon, h2 "Company unavailable", body "This company has no public presence on Aptura.", primary `.btn.btn-primary` "Browse open roles" → `/jobs` |
| Error | `<ErrorCard />` (in `error.tsx`) | centered `.cell` with `danger` pill, h2 "Couldn't load this company", `Try again` ghost button → `reset()` |
| Footer | reused `<MegaFooter />` from `@ip/ui` | 6-col sitemap + truthful badges + legal row |

All new classes (`.cell.anchor` consumer styles, `<CompanyHero />` 2-col layout) live in
`@ip/ui/src/app.css` (shared file). Icons (`MapPin`, `ExternalLink`, `briefcase`, `building`,
`danger`) come from the existing `@ip/ui/src/sprite.tsx` — extend the sprite once, do not
import per page.

## Data wiring / seam (FROZEN — preserve verbatim)

- **SSR fetch.** `page.tsx` runs the two reads in parallel inside `Promise.all`:
  - `companyProfile = USE_MOCK ? mock.profile(id) : getCompanyProfile(id)` →
    `GET /public/companies/{id}` (`next: { revalidate: 300 }`); 404 → `notFound()`;
    `UNAVAILABLE` rethrows → `error.tsx`.
  - `companyJobs = USE_MOCK ? mock.jobs(id, page) : getCompanyJobs(id, page)` →
    `GET /public/companies/{id}/jobs` (`next: { revalidate: 120 }`); error caught →
    `{ jobs: [], total: 0, page: 1, pageSize: 24 }` → empty grid.
- **Client seam unchanged.** `company-client.ts` still exports both functions; the
  `NEXT_PUBLIC_MOCK=1` flag flips them in lockstep with marketplace + job-detail. The mock's
  `id === "404"` still throws `not_found`.
- **No query key on the page** — server fetch only. If a future "Load more roles" island is
  added, it would use `["company-jobs", id, page]` (not implemented in this plan).
- **`trustChips(trust)`** — pure, unit-tested. Returns ordered chips:
  `["Actively reviewing", "Responds in ~{N} days", "{N} open role(s)"]`. Hides the
  responsiveness chip when `respondsInDays === 0`. Pluralizes correctly ("1 open role" vs
  "N open roles"). Reuse as-is.
- **`SaveJobButton`** (per-card `action` slot, inherited from `<JobCard />`) reads/writes
  `["saved-jobs","ids"]`; renders `null` when signed out.
- **Fields consumed** (per `backend_company-profile.md`):
  - `CompanyProfileDTO { id, name, about, website, logo, locations[], trust { activelyReviewing,
    respondsInDays, openJobs } }`
  - `CompanyJobsResult { jobs: JobCardDTO[], total, page, pageSize }` — `jobs` element is the
    **same** `JobCardDTO` as `/jobs`.
- **`generateMetadata({params})`** unchanged — sets `<title>` (company name) and
  `<meta description>` (about excerpt) from the fetched profile.

## Tasks (build → screenshot-verify → commit per task)

> **Task 0 — Design language is the mockup.** Aperture Pro is approved. No per-screen mockup
> file required. The branding header is a direct application of the `.cell.anchor` vocabulary
> in the demo, and the open-roles grid reuses the marketplace `<JobCard />` already produced
> by the marketplace plan.
>
> **Task 1 — Design system primitives** already live in `@ip/ui` from the **landing plan's
> Task 1** (tokens, app.css, sprite, fonts). The marketplace plan's `<JobCard />` lives in
> `frontend/apps/candidate/components/job-card.tsx` and MUST be reused as-is. Any new sprite
> icon this screen needs (`building`, `briefcase`, `ExternalLink`) is added to the shared
> sprite in Task 1 below.

- **Task 1 — Public shell + breadcrumb + branding hero + trust strip.** Mount the shared
  `<UtilityRule />` + `<MegaNav />` + `<MegaFooter />` on this route. Build
  `<CompanyBreadcrumb />` and `<CompanyHero />` (2-column `.cell.anchor`: avatar + display
  name + website link + locations row left; `<TrustStrip />` right). Wire the chip row
  through the unchanged `trustChips(trust)` helper. Extend `@ip/ui/src/sprite.tsx` with the
  missing icons (`building`, `briefcase`, `ExternalLink`). Verify the hero lays out cleanly
  at 1440 (split) and 390 (stacked), the website link opens in a new tab with
  `rel="noopener noreferrer"`, the responsiveness chip is hidden when `respondsInDays === 0`
  (test via `id === "c-nodata"` mock). Screenshot in both themes. Commit
  `frontend/apps/candidate/app/companies/[id]/page.tsx`,
  `frontend/apps/candidate/components/trust-badges.tsx`,
  `frontend/packages/ui/src/sprite.tsx`.
- **Task 2 — About block.** Build `<AboutBlock />` as a supporting `.cell` under the hero;
  body uses `--step-1` `--ink-2` capped at 75ch. Renders `null` when `profile.about` is empty
  (test via `id === "c-no-about"` mock). Verify long about text wraps cleanly without
  overflow. Screenshot. Commit.
- **Task 3 — Open roles section + reused `<JobCard />` + pagination + empty.** Build
  `<OpenRolesSection />` (section head + mono count + vertical stack of `<JobCard />`).
  Confirm the reused `<JobCard />` renders correctly here, including the inner
  `<SaveJobButton />` slot and `e.stopPropagation()` on click — **no card fork**. Add
  `<Pagination />` when `total > pageSize`. Build `<EmptyState />` for the
  `companyJobs.jobs.length === 0` case (after SSR caught `UNAVAILABLE` or genuinely no
  published roles). Verify: a multi-page company shows pagination, a no-jobs company shows
  the empty state, the save button signed-out renders null. Screenshot. Commit
  `frontend/apps/candidate/app/companies/[id]/page.tsx`.
- **Task 4 — Not-found + error surfaces.** Build `<NotFoundCard />` (in `not-found.tsx`) and
  `<ErrorCard />` (in `error.tsx`). Verify `/companies/404` (mock throws `not_found`) → not-
  found; an injected error → error card with a working `reset()`. Screenshot both. Commit.
- **Task 5 — Full page assembly + verify.**
  1. `NEXT_PUBLIC_MOCK=1 --filter @ip/candidate build` is green; `--filter @ip/candidate exec
     tsc --noEmit` is green.
  2. Run dev (`NEXT_PUBLIC_MOCK=1 pnpm --filter @ip/candidate dev`), navigate to
     `/companies/c1`, screenshot in both themes at 1440×900 and 390×844.
  3. **Side-by-side fidelity check** against the design language: same nav, same wide
     container, same `.cell.anchor` rhythm, same teal-soft / mono accents, the reused
     `<JobCard />` matches the marketplace screen exactly — iterate any divergence until
     1:1.
  4. Verify SSR HTML (curl or view-source): company name, about, locations, and job titles
     all present, token-free. `generateMetadata` emits the company name in `<title>` and the
     about excerpt in `<meta description>`.
  5. Verify card behavior: clicking a card navigates to `/jobs/{id}` (handled by the reused
     `<JobCard />`'s outer `<Link>`); clicking the inner Save button does NOT trigger
     navigation (verified `e.stopPropagation()`).
  6. Verify trust degradation: `respondsInDays === 0` hides only the middle chip; the other
     two render unchanged.
  7. Flip `NEXT_PUBLIC_MOCK` off and confirm the real `GET /public/companies/{id}` +
     `GET /public/companies/{id}/jobs` responses render identically.

## States & a11y

- **States (named).**
  - `success` — SSR stream renders branding + about + open roles grid.
  - `not-found` — `notFound()` → `not-found.tsx` shows `<NotFoundCard />`.
  - `error` — SSR rethrow → `error.tsx` shows `<ErrorCard />` with `reset()`.
  - `jobs-empty` — profile loaded but `companyJobs.jobs.length === 0` (either no published
    roles or jobs fetch caught `UNAVAILABLE` and degraded to `{ jobs: [] }`) → `<EmptyState />`.
  - `about-absent` — `profile.about == null` → `<AboutBlock />` returns `null`.
  - `trust-degraded` — `respondsInDays === 0` → middle chip hidden; other two still render.
  - Save button per card: `null` (signed-out), `unsaved`, `saved`, `pending`.
- **Responsive.** Branding hero splits at ≥760px (avatar+name+website+locations on left,
  trust strip on right) and stacks at <760px (avatar above name above website above locations
  above trust chips, all left-aligned). Open-roles grid is single-column on all widths
  (cards are full-width inside `.wrap`); pagination is centered. About block stays within
  65–75ch. No horizontal scroll at 320px.
- **Dark + light.** Tokens only — automatic. Branding hero uses the `.cell.anchor` gradient
  (`--teal-soft` over `--surface`), which resolves cleanly in both themes. About cell uses
  `--surface`. Pill tones (`.pill-good`, `.pill-teal`, `.pill`) all resolve to ≥4.5:1
  contrast. No hardcoded hex.
- **A11y.** One `<h1>` (the company name). Landmarks:
  `<header><nav><main><section><footer>`. Breadcrumb is a real `<nav aria-label="Breadcrumb">`
  with an ordered list and `aria-current="page"` on the trailing segment. Avatar named with
  the company. Website link uses `rel="noopener noreferrer"` and an external-link icon with
  `aria-label` reading "Open {company} website in a new tab". Trust strip chips are inside a
  `<ul aria-label="Hiring activity">` with `<li>` items; their visual ordering is preserved.
  The "Open roles" `<h2>` is a real heading; the mono count badge has `aria-label="Result
  count"`. Reused `<JobCard />` retains its `<a>` link + inner `<button>` stop-propagation
  pattern. `:focus-visible` rings use `--teal` 2px / 4px halo. Touch targets ≥44×44. Contrast
  ≥4.5:1. All animations honor `prefers-reduced-motion`.

## Acceptance

- Looks 1:1 like [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  for shell + container + type + `.cell.anchor` branding rhythm + reused `<JobCard />`
  grid. Side-by-side screenshot proof committed under
  `docs/brand/redesign-v3/verify/company-profile-{light,dark}.jpeg`.
- `--filter @ip/candidate build` is green (with `NEXT_PUBLIC_MOCK=1`); `tsc --noEmit` is
  green; no console errors / warnings on the rendered page; `prefers-reduced-motion` honored.
- **Zero functional diff** — `JobCardDTO` and the reused `<JobCard />` are byte-for-byte
  identical to the marketplace plan; `trustChips()` unit tests still pass (responsiveness
  chip hidden at `0`, pluralization correct); SSR revalidate windows unchanged
  (`profile=300`, `jobs=120`); profile 404 → `notFound()`; jobs error → `{ jobs: [] }`;
  `NEXT_PUBLIC_MOCK` flips both endpoints in lockstep.
- SSR HTML crawlable: view-source on `/companies/c1` contains the company name, about, and
  job titles in initial HTML, token-free.
- **Pre-launch posture enforced.** Trust strip footnote states explicitly that signals are
  funnel-derived and never self-reported. No fake employer reviews, no fake testimonials, no
  claimed ATS integrations anywhere on the page.
- Cross-screen consistency: the open-roles `<JobCard />` matches the marketplace cards
  pixel-for-pixel (same `.cell`, same meta pills, same mono `.posted` timestamp, same Save
  slot). Clicking a card lands on the rebuilt `/jobs/[id]` surface.
