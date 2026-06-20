# Frontend — Job marketplace / search (`/jobs`) · Midnight redesign

> **Screen & goal.** Public, SSR, crawlable job search. Anonymous candidates search/filter the published catalog;
> clicking a card opens the public detail. Reskin to the Midnight `.app` shell + cyan accent. **Zero behavior
> change** — same SSR-seeded TanStack query, same facet toggles, same querystring.
> **Route(s) + role.** `/jobs` · **public** (token-free initial SSR; client island for filters/pagination).
> **Mockup.** ✓ `docs/brand/redesign-v2/marketplace.html` (sidebar shell · topbar search · filter rail · job cards).
> **Existing code it reskins (exact paths):**
> - `frontend/apps/candidate/app/jobs/page.tsx` (SSR server component; wraps `AppShell`)
> - `frontend/apps/candidate/app/jobs/marketplace.tsx` (`"use client"` filter/pagination island)
> - `frontend/apps/candidate/app/jobs/search-client.ts` + `types.ts` (real `/public/jobs` + mock; **do not touch logic**)
> - `frontend/apps/candidate/components/{job-card,filter-sidebar,job-search-bar}.tsx`

---

## Layout & components

The mockup uses the signed-in product **`.app` shell** (sidebar + topbar) — note it is still token-free/public.
Today the FE wraps `AppShell` (from `@ip/ui`); the redesign maps `AppShell` onto the Midnight `.app`/`.side`/
`.topbar`/`.content` classes. The page body is the two-column `market` grid (filter rail + results).

| Region (mockup) | Component | Midnight classes / tokens |
|---|---|---|
| Shell | `AppShell` | `.app` grid (248px rail + `1fr`); `.side` sidebar (`.brand`, `.navlabel`, `.navitem[aria-current]`); `.topbar` sticky blur bar |
| Topbar search | `JobSearchBar` (hoisted into topbar) | `.searchbox` (keyword) + `.searchbox` (location) + `.btn.btn-primary.btn-sm` |
| Page head | `page.tsx` header | `.page-head` h2 in `--font-display`; `.sub` in `--ink-2` |
| Filter rail | `FilterSidebar` | `.rail` (sticky) → `.facet` groups; `.facet-h` mono uppercase label; facet rows as `.chip-toggle[aria-pressed]` chips (count suffix) |
| Result count | `marketplace.tsx` | `--ink-2`, `aria-live="polite"` (unchanged) |
| Job card | `JobCard` | `.card`/`.jobcard`; title in `--font-display` `.title`; company row `--ink-2`; meta as `.pill`/`Badge` tone chips (work mode = `pill-accent`/info, salary = `pill-good`); skills as `.badge`; `.posted` mono timestamp |
| Loading | `Skeleton` | `--surface-2` shimmer |
| Empty/error | `EmptyState` | token card with `SearchX` icon |

**New vs reused.** No new components. Reskin only. Reuse `@ip/ui` `AppShell`, `Card`/`CardContent`, `Badge`,
`Checkbox`, `Button`, `EmptyState`, `Skeleton`, `Input`.

## Data wiring / seam

- **Seam unchanged.** `search-client.ts` exports `query = USE_MOCK ? makeMockSearchClient() : searchJobs` against
  `GET /public/jobs` (snake_case wire → camelCase DTO). The mock is behind `NEXT_PUBLIC_MOCK`.
- **Query key:** `["public-jobs", params]` (TanStack Query), seeded by the SSR `initial` result via `initialData`
  when `sameParams(params, initialParams)`. **Keep identical.**
- Fields consumed (per `backend_marketplace-search.md`): `JobCardDTO { jobId, title, companyName, companyId,
  location, remoteMode, employmentType, salaryMin, salaryMax, salaryCurrency, skills, postedAt, snippet }` +
  `facets { remoteMode, employmentType, experienceLevel }[] { value, count }` + `total, page, pageSize`.
- `SaveJobButton` (mounted in each card's `action` slot) reads/writes `["saved-jobs","ids"]` — renders **null**
  when signed out (cards stay public). Unchanged.

## Tasks (Task 0 skipped — mockup ✓)

> Reskin only; keep the SSR fetch, the querystring builder (`toQuery`), facet single-select, and `["public-jobs"]`
> query untouched. Per task: build (`NEXT_PUBLIC_MOCK=1 … build`) + browser-verify + explicit-path commit.

- **Task 1 — Shell + topbar search.** Map `AppShell` to the Midnight `.app` shell; hoist `JobSearchBar` into the
  `.topbar` (two `.searchbox` + primary `Search`). Keep `onSearch(setParams)`. Commit `app/jobs/page.tsx`,
  `components/job-search-bar.tsx`.
- **Task 2 — Filter rail.** Reskin `FilterSidebar` to the `.rail`/`.facet`/`.facet-h` layout; render each facet
  bucket as a `.chip-toggle[aria-pressed]` chip with its count. Keep single-select toggle + "Clear filters".
  Commit `components/filter-sidebar.tsx`.
- **Task 3 — Job card.** Reskin `JobCard` to `.jobcard` (Fraunces title, accent meta pills, mono `.posted`). Keep
  the whole-card `<Link href="/jobs/{id}">` + `action` slot stop-propagation. Commit `components/job-card.tsx`.
- **Task 4 — Result column states.** Reskin the count line, `Skeleton`, and `EmptyState` (loading/empty/error) in
  `marketplace.tsx` to tokens. Keep the query + `placeholderData`. Commit `app/jobs/marketplace.tsx`.
- **Task 5 — Verify.** `NEXT_PUBLIC_MOCK=1 --filter @ip/candidate build` clean; preview `/jobs`: SSR list renders,
  topbar search re-queries, facet chips narrow results, empty state shows on no-match, dark+light correct, mobile
  collapses the rail under results. Screenshot. Commit.

## States & a11y

- **States (named).** loading (`Skeleton` ×3), empty (`EmptyState` "No matching jobs"), error (`EmptyState`
  "Couldn't load jobs"), success (cards + count). Filter/search changes re-query; URL reflects `?q=&…` (shareable).
- **Responsive.** `.market` grid → single column on mobile; `.rail` becomes static (un-sticky); topbar search
  stacks; cards single-column.
- **Dark + light.** Tokens only — automatic. No hardcoded colors.
- **A11y.** Search is a labelled `<form>`; facet chips are `aria-pressed` toggles; cards are links; count line is
  `aria-live="polite"`; cyan `:focus-visible` ring; contrast ≥4.5:1.

## Acceptance

- Matches `redesign-v2/marketplace.html` (sidebar shell, topbar search, filter rail, Midnight job cards).
- SSR HTML crawlable (job titles in initial HTML, token-free).
- `--filter @ip/candidate build` + `typecheck` green.
- **Zero functional diff** — same `toQuery` serialization, same `["public-jobs", params]` query, same facet
  single-select, same SSR seed. Mock→real flips via `NEXT_PUBLIC_MOCK` exactly as today.
