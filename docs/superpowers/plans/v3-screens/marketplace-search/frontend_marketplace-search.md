# Marketplace search — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Public, crawlable, SSR job search at `/jobs`. Anonymous candidates explore Aptura's published
catalog with text + location search, facet filters (work mode / employment type / experience
level), single-select chip toggles, and a paginated card grid. Replace every byte of the old
v2 marketplace UI (which used the `.app` shell + Midnight cyan reskin) with a brand-new
**public, marketing-style** surface built from Aperture Pro primitives — same blurred mega-nav as
the landing, same wide editorial container, same bento-leaning rhythm — applied to a real
list-view with live data. Behavior, querystring, query keys, SSR seed, and the `discovery`
contract are all unchanged. Only the UI is new. Pre-launch posture throughout: every empty-state
sample is labelled `Sample`, no fake company logos, no fake employer outcomes.

## Route + role

`/jobs` (`frontend/apps/candidate/app/jobs/page.tsx`) · **public** (token-free initial SSR;
filters/pagination island is `"use client"`). No `.app` shell — this is a **public marketing-style**
surface (mega-nav + utility rule, the same shell as landing) with a content area that hosts the
search experience.

## Approved mockup (build to this exactly)

- **Interactive demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — this is the design-language reference. The marketplace is a new public surface inside the
  same shell; build the layout grammar from the demo's nav + container + bento + section rhythm.
- **Light-theme full page:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-full.jpeg`
- **Light-theme hero:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-light-hero.jpeg`
- **Dark-theme full page:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-full.jpeg`
- **Dark-theme hero:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-dark-hero.jpeg`

No per-screen mockup exists yet; this plan is the spec until one is added. Side-by-side screenshot
proof against the design language is part of the acceptance criteria — see "Acceptance" below.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope (assume these files are re-written from scratch by the new plan; do not
port markup, Tailwind classes, or component composition):

- `frontend/apps/candidate/app/jobs/page.tsx` — SSR server component (previously wrapped `AppShell`)
- `frontend/apps/candidate/app/jobs/marketplace.tsx` — `"use client"` filter/pagination island
- `frontend/apps/candidate/components/job-card.tsx` — list card
- `frontend/apps/candidate/components/filter-sidebar.tsx` — facet rail
- `frontend/apps/candidate/components/job-search-bar.tsx` — keyword + location search

**Untouched (data seam — FROZEN):**

- `frontend/apps/candidate/app/jobs/search-client.ts` — `query = USE_MOCK ? makeMockSearchClient() : searchJobs`
- `frontend/apps/candidate/app/jobs/types.ts` — `JobCardDTO`, `SearchJobsParams`, `SearchJobsResult`, `FacetBucket`
- `toQuery(params)` snake_case serializer and the `["public-jobs", params]` query key
- SSR seed shape (`initial` passed from page → island via `initialData` when `sameParams(...)`)

## Layout & components — map to `@ip/ui` primitives and tokens

This is a public marketing-style surface. Use the **landing shell** (mega-nav + utility rule)
already moved into `@ip/ui` by the landing plan's Task 1. Below the shell sits a wide
container (`.wrap`) with a hero-lite header, a results bento, and a footer.

| Region | Component (new) | Tokens / primitives |
|---|---|---|
| Top utility rule | reused `<UtilityRule />` from `@ip/ui` | pre-launch coral pill + meta + right link |
| Sticky mega-nav | reused `<MegaNav />` from `@ip/ui` | brand + 6 nav links + audience switch + `Sign in` + primary CTA |
| Page hero-lite | `<SearchHero />` (new, marketplace-only) | `.wrap` container; section padding `clamp(4rem,7vh,6rem) 0`; `h1.display` headline ("Open roles, evidence-first") at `--step-4`; one-line lead at `--step-1` in `--ink-2`; a wide `SearchBar` directly under the lead spanning two `.searchbox` inputs + primary `.btn.btn-primary` |
| Search bar | `<SearchBar />` (new) | one Flex row at ≥760px (keyword input · location input · primary button) collapsing to stacked at <760px; inputs use `.input` style from `@ip/ui` (1px border `--line`, 12px radius, 46px height); submit is `.btn.btn-primary.btn-lg`; `<form>` with `onSubmit={onSearch}` |
| Status strip | `<StatusStrip />` (new) | thin row under hero with a `.status` (leading dot, "Live · public catalog · pre-launch") on the left and a mono `.posted`-style result count on the right; mono = Geist Mono `--step--1`; status pulses (reduced-motion-safe) |
| Layout grid | `.market-grid` (new class in `@ip/ui/src/app.css`) | CSS grid `260px 1fr` ≥1100px; single column <1100px; gap 1.5rem; rail un-sticks on mobile |
| Filter rail | `<FilterRail />` (new) | sticky at top-32 within the grid; container is a `.cell` (22px radius, 1px border `--line`, 1.4rem padding); each facet group is a stack with a `Geist Mono` `--step--1` label (`Work mode`, `Employment type`, `Experience level`) and a `flex-wrap` row of `.chip-toggle[aria-pressed]` chips (label + mono count suffix); a small `.btn.btn-ghost.btn-sm "Clear all"` at the bottom |
| Chip toggle | `.chip-toggle` (new class) | inline pill, 999px radius, 1px border `--line`, mono count chip after label; `aria-pressed="true"` swaps to teal-soft fill + `--teal` border + `--teal-strong` text; reduced-motion-safe hover |
| Results column | `<ResultsColumn />` (new) | header row with `<h2 class="display">` and result count + sort select; below, a vertical stack of `<JobCard />`; pagination footer |
| Job card | `<JobCard />` (new) | bento-style `.cell` (22px radius, 1.4rem padding, hover lifts 1px); structure: top row = Avatar (32px, company logo) + company name `--ink-2` + posted-at `.posted` mono right-aligned; title at `--step-2` in Schibsted Grotesk wght 600; meta pill row (`.pill` work mode + `.pill-good` salary + employment type) wrapping; snippet at `--step-0` `--ink-2`, capped 2 lines; skills row as `.badge` mono chips capped at 6 visible; whole card is a `<Link href="/jobs/{id}">`; right-edge has a `SaveJobButton` slot that `stopPropagation`s |
| Sort select | `<SortSelect />` (inline) | native `<select>` styled to the design language (1px border, teal focus ring, Geist Mono labels); options `Relevance` / `Recent`; reuses `setParams({sort})` |
| Pagination | `<Pagination />` (new) | centered row of `.btn.btn-ghost.btn-sm` for prev/next + a mono page indicator (`page X of Y`); disabled state on bounds |
| Loading | `<JobCardSkeleton />` (new) | 3 stacked shimmer cells using `--surface-2`; respects reduced-motion (static fallback) |
| Empty | `<EmptyState />` (new) | a single `.cell` with a centered `eye` icon (lucide-style stroke), mono micro-label `Empty result`, h3 `No matching jobs`, body lead `Try a broader search or clear filters.`, and a primary `.btn.btn-ghost` "Clear filters" |
| Error | `<EmptyState />` variant | same shape, danger pill + `Couldn't load jobs`, "Try again" button re-runs the query |
| Footer | reused `<MegaFooter />` from `@ip/ui` | 6-col sitemap + truthful badges + legal row |

All new classes (`.market-grid`, `.chip-toggle`, `.input`, `.searchbox` variants) live in
`@ip/ui/src/app.css` (one shared file for all screens). The aperture mark + lucide-style icons
come from the existing `@ip/ui/src/sprite.tsx` mounted once in the root layout. No icons imported
per page.

## Data wiring / seam (FROZEN — preserve verbatim)

- **SSR fetch.** `page.tsx` reads `searchParams` → builds `SearchJobsParams` → calls
  `query(params)` (the `search-client.ts` seam). On `UNAVAILABLE` / network error the SSR
  catches and renders the island with `initial = null` (island falls back to client fetch).
- **Client seam unchanged.** `search-client.ts` still exports
  `query = USE_MOCK ? makeMockSearchClient() : searchJobs` against `GET /public/jobs`
  (snake_case wire → camelCase DTO). `NEXT_PUBLIC_MOCK=1` flips to the fixture; no other code
  changes. `toQuery(params)` serializer keeps the snake_case mapping (`page_size`, `,`-joined
  `skills`) byte-for-byte.
- **Query key.** `["public-jobs", params]` (TanStack Query), seeded by the SSR `initial` via
  `initialData` when `sameParams(params, initialParams)`. Keep identical. `placeholderData` on
  re-query keeps cards visible during refetch.
- **Fields consumed** (per `backend_marketplace-search.md`):
  `JobCardDTO { jobId, title, companyName, companyId, location, remoteMode, employmentType,
  salaryMin, salaryMax, salaryCurrency, skills, postedAt, snippet }` + `facets { remoteMode,
  employmentType, experienceLevel }[] { value, count }` + `total, page, pageSize`.
- **`SaveJobButton`** (mounted in each card's `action` slot) reads/writes
  `["saved-jobs","ids"]` — renders **null** when signed out (cards stay public). Unchanged.
- **Querystring is the source of truth.** Every filter / sort / page change calls
  `router.replace(?…)` so URLs are shareable. Unchanged.

## Tasks (build → screenshot-verify → commit per task)

> **Task 0 — Design language is the mockup.** Aperture Pro is approved
> ([`_design-language.md`](../_design-language.md) + the demo). No per-screen mockup file is
> required. Treat the demo's nav + container + bento + section rhythm + the `.cell` / `.pill` /
> `.badge` / mono-meta vocabulary as the spec for this screen.
>
> **Task 1 — Design system primitives** already live in `@ip/ui` from the **landing plan's
> Task 1** (tokens, app.css, sprite, fonts). This screen REUSES them — do not duplicate. Any
> brand-new primitive this screen needs (`.market-grid`, `.chip-toggle`, marketplace `.input`)
> is added to the shared `@ip/ui/src/app.css` in Task 1 below.

- **Task 1 — Public shell + hero-lite + status strip.** Mount the shared `<UtilityRule />` +
  `<MegaNav />` + `<MegaFooter />` from `@ip/ui` on this route. Build `<SearchHero />`
  (display headline + lead + `<SearchBar />`) and `<StatusStrip />` below it. Add the new
  `.input`, `.market-grid`, and `.chip-toggle` classes to `@ip/ui/src/app.css`. Screenshot
  the empty hero at 1440×900 and 390×844 in dark + light. Commit
  `frontend/apps/candidate/app/jobs/page.tsx`, `frontend/apps/candidate/app/jobs/marketplace.tsx`
  (shell scaffold only — no list yet), and the shared `frontend/packages/ui/src/app.css`
  additions.
- **Task 2 — Filter rail.** Build `<FilterRail />` consuming `result.facets` from the SSR
  seed; render each bucket as a `.chip-toggle[aria-pressed]` with `label + mono count`. Keep
  single-select toggle (clicking the active chip clears it) + a `Clear all` ghost button at
  the bottom. Verify chips wrap cleanly, the active chip's teal-soft fill resolves in both
  themes, the rail is sticky at `top: 96px` ≥1100px and un-sticky <1100px. Screenshot. Commit
  `frontend/apps/candidate/components/filter-sidebar.tsx`.
- **Task 3 — Job card.** Build `<JobCard />` as a `.cell` bento variant per the table above
  (Avatar + company + mono `.posted` · display title · meta pill row · 2-line snippet · skills
  badges · save slot · whole card is `<Link>`). The `action` slot wraps `SaveJobButton` with
  `e.stopPropagation()` on click to keep the card link clean. Verify in both themes; verify
  the meta pills use the correct tones (work mode = neutral `.pill`, salary = `.pill-good`,
  employment type = `.pill-teal`); verify a long title balances cleanly (`text-wrap: balance`)
  and does not overflow at 360px. Screenshot. Commit
  `frontend/apps/candidate/components/job-card.tsx`.
- **Task 4 — Results column + sort + pagination + states.** Wire `<ResultsColumn />` to render
  the SSR-seeded list via the unchanged `["public-jobs", params]` query. Add `<SortSelect />`
  and `<Pagination />`. Build `<JobCardSkeleton />` (3 shimmer cells) + `<EmptyState />`
  (no-match) + `<EmptyState />` (error) variants. Verify: a fresh load shows SSR cards
  immediately, changing a chip refetches without unmounting the list (placeholder cards),
  pagination respects `total / pageSize`, the count line is `aria-live="polite"`. Screenshot
  each state. Commit `frontend/apps/candidate/app/jobs/marketplace.tsx`.
- **Task 5 — Full page assembly + verify.**
  1. Confirm `page.tsx` SSR-renders the shell + hero + first page of results (token-free,
     view-source contains real job titles).
  2. `NEXT_PUBLIC_MOCK=1 --filter @ip/candidate build` is green; `--filter @ip/candidate exec
     tsc --noEmit` is green.
  3. Run dev (`NEXT_PUBLIC_MOCK=1 pnpm --filter @ip/candidate dev`), navigate to `/jobs`,
     screenshot in both themes at 1440×900 and 390×844.
  4. **Side-by-side fidelity check** against the design-language demo (compare nav, container
     width, type scale, card radius, chip styling, section rhythm) — iterate until 1:1.
  5. Flip `NEXT_PUBLIC_MOCK` off in a local `.env.local` and confirm the real
     `GET /public/jobs` response renders identically (same `JobCardDTO` fields, same
     querystring, same SSR seed). No code change required for the flip.
  6. Confirm querystring round-trip: paste a URL with `?q=eng&remote=remote&page=2` into a
     fresh tab → SSR renders that exact result set with the chips pre-selected.

## States & a11y

- **States (named).**
  - `loading` — `<JobCardSkeleton />` ×3 in the results column (only on cold client navigation
    — SSR always seeds the first render).
  - `empty` — `<EmptyState />` "No matching jobs", "Clear filters" CTA.
  - `error` — `<EmptyState />` "Couldn't load jobs", "Try again" re-runs the query.
  - `success` — card stack + result count + pagination.
  - `placeholder` — during a refetch caused by a chip / sort / page change, the previous result
    set stays visible (TanStack `placeholderData`); the count line announces "Updating…" via
    `aria-live`.
- **Responsive.** Hero stacks at <760px (headline → lead → search inputs stacked → submit
  full-width); status strip wraps; `.market-grid` collapses to a single column at <1100px (rail
  becomes static, scrolling with the page); cards stay single-column on mobile; pagination
  shrinks to icon-only at <420px. No horizontal scroll at 320px.
- **Dark + light.** Every color via tokens. The hero backdrop uses `--teal-glow` and resolves
  cleanly in both themes. Card `.cell` background = `--surface`; rail `.cell` background =
  `--surface-2` for subtle separation. No hard-coded hex.
- **A11y.** One `<h1>` (`Open roles, evidence-first`). Landmarks:
  `<header><nav><main><section><article><footer>`. Aperture mark is `aria-hidden`; brand text
  is the readable label. Search bar is a labelled `<form role="search">` with `aria-label`s on
  both inputs. Chip toggles are `<button aria-pressed>` inside a `<fieldset>` with a
  `Geist Mono` legend (one per facet group). Result count line is `aria-live="polite"`. Cards
  are `<a>` links (whole-card click); the inner `SaveJobButton` is a real `<button>` with
  `aria-label` and `e.stopPropagation()` to avoid double-nav. Sort `<select>` is labelled.
  Pagination buttons have `aria-label="Previous page" / "Next page"`. Touch targets ≥44×44.
  Contrast ≥4.5:1 (body uses `--ink-2` on `--bg`; chip-active uses `--teal-strong` on
  `--teal-soft` which resolves ≥4.5:1 in both themes). `:focus-visible` rings use `--teal` 2px
  / 4px halo. All animations honor `prefers-reduced-motion` (status pulse pauses, card
  hover-lift becomes a static border tint, skeleton shimmer becomes a flat surface).

## Acceptance

- Looks 1:1 like [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  for shared shell + container + type + motion vocabulary, applied to a real list-view with
  bento `.cell` cards, mono meta, and the teal-accented chip toggles described above.
  Side-by-side screenshot proof committed under
  `docs/brand/redesign-v3/verify/marketplace-search-{light,dark}.jpeg`.
- `--filter @ip/candidate build` is green (with `NEXT_PUBLIC_MOCK=1`); `tsc --noEmit` is green;
  no console errors / warnings on the rendered page; `prefers-reduced-motion` honored.
- **Zero functional diff** — `toQuery` serialization, `["public-jobs", params]` query key,
  facet single-select semantics, SSR seed via `initialData`, querystring round-trip, and the
  `NEXT_PUBLIC_MOCK` flip all behave identically to before.
- SSR HTML crawlable: view-source on `/jobs` (and `/jobs?q=eng`) contains real job titles,
  company names, and meta, token-free.
- **Pre-launch posture enforced.** No fake company names or logos in the empty-state
  illustrations or in any decorative graphic. The status strip says "Live · public catalog ·
  pre-launch" (truthful). No claimed integrations or unearned certifications anywhere on the
  page.
- Signed-out behavior unchanged: `SaveJobButton` renders `null`, cards still link to
  `/jobs/{id}`, no auth prompt appears until the user clicks Save or Apply on a detail page.
