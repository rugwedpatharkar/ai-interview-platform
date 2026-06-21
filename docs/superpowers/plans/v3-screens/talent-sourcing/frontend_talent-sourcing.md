# Talent sourcing — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Rebuild the talent-sourcing surface at `/company/talent` from scratch in the Aperture Pro design
language. This is the recruiter's **candidate-database search** over their own company's applicants:
a left filter rail, a ranked results grid built from `.match > .card` rows, and a right-side
candidate detail drawer that opens when a row is activated. The drawer carries the masked handle,
fit score (rendered as a `.ring`), funnel state, matched-skill `.badge` chips, and the two outreach
affordances. Backend stays frozen — every `SourcingService.SearchCandidates` field and the
`Talent.GetTalentPool` default view are reused verbatim, only the UI is new.

**Privacy invariant carried into the design.** Results render **only** the masked handle
(`slice(0,12)…`), the application count to this company, the fit score, the furthest funnel stage
reached, and the matched-skill chips — **no ID / background / biometric data, ever**. The search
universe is the company's **own applicants only**; there is no global candidate index in this
product, and the UI must never imply one.

## Route + role

`/company/talent` (`apps/company/app/talent/page.tsx`) · **company** — guarded by
`useRequireRole(["recruiter", "company_admin"])` (enforced inside `CompanyShell`; do not
re-implement). Non-managers are redirected by the shell before this page renders.

## Approved mockup (build to this exactly)

- **Live demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — the `.app` company shell, `.cell` bento, `.match > .card` ranked rows, `.bar` competency
  meters, `.ring` score donut, mono `.tag` micro-labels, `.pill-good/.pill-warn` status pills.
- **Screenshots:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.

There is no per-screen mockup yet — the design-language demo IS the reference. Task 0 below
captures the screen-specific composition (filter rail · ranked grid · detail drawer) as a
standalone HTML preview; the React build mirrors it 1:1.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope:

- `frontend/apps/company/app/talent/page.tsx` — server entry + pool fallback
- `frontend/apps/company/components/candidate-search.tsx` — search bar + stage filter + results
- `frontend/apps/company/components/fit-badge.tsx` — fit-score badge (replaced by `.pill-good/.pill-warn/.pill` + the `.ring` donut in the detail drawer)
- Any local rendering helpers under `apps/company/app/talent/` that emit the v2/Midnight markup

What is **NOT** touched: `apps/company/app/talent/sourcing-client.ts` (the mock seam +
`USE_MOCK_SOURCING` toggle), `apps/company/app/talent/sourcing-types.ts` (`CandidateHitDTO` and
`SearchCandidatesParams/Result`), `apps/company/components/company-shell.tsx` (the `.app` shell +
role gate), or any `*.proto` / generated `@ip/api-client` types.

## Section spine — 5 regions, in order

Build each as its own component under `frontend/apps/company/components/talent/`.

| # | Region | Component | Notes |
|---|---|---|---|
| 0 | App shell | `<CompanyShell>` (existing) | `.app` sidebar + topbar. Sidebar **Talent** entry carries `aria-current="page"`. Topbar crumb = `<Company> / Talent`. |
| 1 | Page head | `<TalentHead />` | h1.display "Talent pool" + `.sub` ("Search your applicants. Same talent that already raised a hand."). Trailing `.pill-coral.tnum` showing the live result count when a search is active; collapses to `.pill` showing the pool count otherwise. |
| 2 | Filter rail | `<FilterRail />` | Left column (`span 3` ≥1100px, full width ≤760px). `.cell.tight` holding: a `.searchbox` keyword input · stage `.chip-toggle` (Any / Applied / Phone / Interview / Offer / Hired / Rejected) · min-fit `.bar` slider rendered as a labelled range · a `.btn.btn-ghost` Clear filters. Filter state is local; submit on Enter or change. |
| 3 | Results grid | `<ResultsGrid />` | Right column (`span 9` ≥1100px). On no query → renders the **pool fallback** (a `.cell.tight` "Your applicants" header + `.match > .card` rows from `Talent.GetTalentPool`). On query → renders ranked hits from `Sourcing.SearchCandidates` as `.match > .card` rows: avatar gradient + masked handle `.nm` (mono) + `.sub` "Applied to N roles · top stage <stage>" + trailing `.pct` mono percent + a Stage `.pill` (tone via `applicationStatus(topStage)`). Click → opens the detail drawer for that row. |
| 4 | Detail drawer | `<CandidateDrawer />` | Slides in over the results from the right at ≥1100px (`max-width: 480px`); full-screen sheet at ≤760px. Topbar = masked handle + close. Body = a `.ring` score donut (0–100 from `fitScore * 100`) + a stage `.pill` row + matched-skill `.badge` chip cloud + a `.bars` block titled "Match signal" showing the per-skill bars (one `.bar` row per `matchedSkills[]` entry, all rails empty and the fills proportional to the row's relative weight — the search returns no per-skill score, so the bars degrade gracefully to all-equal fills with a mono note). Footer = two CTAs: **Send a message** `.btn.btn-primary` (navigates `/company/messages?to=<candidateUserId>`) and **Invite to interview** `.btn.btn-ghost` (navigates `/company/talent/<candidateUserId>/invite`). |

Bento collapse rules (already in the design language): the rail + grid layout is 3+9 columns
≥1100px → stacks rail-on-top at the mid breakpoint → full-bleed cards ≤760px. The drawer is a
right-aligned panel ≥1100px and a full-screen sheet ≤760px.

## Layout & components — map to `@ip/ui` and tokens

Pull every primitive from `@ip/ui` per [`_design-language.md`](../_design-language.md).

| Region | Primitive (in `@ip/ui`) | Tokens |
|---|---|---|
| Shell | `CompanyShell` (existing) | already on the new tokens via the design-language Task 1 |
| Page head | `h1.display` + `.sub` + `.pill-coral.tnum` | typography + pill tokens |
| Filter rail | `.cell.tight` containing `.searchbox`, `.chip-toggle`, range `.bar` | `--surface`, `--line`, `--ink-2`; chips use `--teal-soft` on `aria-pressed=true` |
| Results header | `.cell.tight` head row + `.tag` mono ("OWN APPLICANTS ONLY") | `--ink-3` mono micro-label |
| Result row | `.match > .card` (avatar + col + pct + pill) | teal-gradient avatar; mono percent in `--ink-deep`; pill via `applicationStatus()` |
| Drawer | right-aligned `<aside>` with `.cell` interior + a thin `--line` left border | `--surface`, `--line`; drawer shadow uses `--shadow-elev` |
| Score donut | `.ring` (conic-gradient, fill `--teal`) | semantic token only |
| Skill chip | `.badge` (small mono+text combo) | `--surface-2`, `--ink-2`, `--line-2` |
| Match signal | `.bars + .bar > .name/.v/.t > i` | rail `--surface-3`, fill `--teal` |
| Action buttons | `.btn.btn-primary` + `.btn.btn-ghost` | 46px default height, 12px radius |

All new primitives live in `@ip/ui/src/app.css` (one shared file). No new tokens — everything
resolves through the resolved accent (`--teal`) and the resolved base palette. **No
side-stripe borders** on the drawer; use the full left border via `--line`.

## Data wiring / seam

**Every existing query and handler is preserved verbatim. Nothing new.**

| Region | Hook | Query key | Source |
|---|---|---|---|
| Pool fallback | `useAuthedQuery(token, …, () => api.talent.getTalentPool({}))` → entries `[]` shape `{ candidateUserId, applicationCount }` | `["talent","pool"]` | `Talent.GetTalentPool` (live today) |
| Search hits | `useAuthedQuery(token, …, () => sourcingClient.searchCandidates(params), { enabled: query.length > 0 })` where `sourcingClient = USE_MOCK_SOURCING ? makeMockSourcingClient() : realSourcingClient(api)` | `["candidate-search", params]` | `Sourcing.SearchCandidates` (mock today, real after `pnpm gen`) |
| Drawer open | local state `selectedId: string \| null`, set by row click; no separate fetch (the drawer reads the row's own `CandidateHitDTO` / pool entry — there is no per-candidate detail RPC in scope) | n/a | derived |
| Detail nav | `Send a message` → `router.push("/company/messages?to=" + selectedId)`; `Invite to interview` → `router.push("/company/talent/" + selectedId + "/invite")` | n/a | client-side nav |

**Search gating.** The `["candidate-search", params]` query is enabled **only** when the keyword
`query.length > 0`. Clearing the keyword (or pressing **Clear filters**) cancels the search and the
results grid swaps back to the pool fallback. The stage `.chip-toggle` and min-fit slider modify
`params` but never enable the query on their own — the keyword is the gate. This preserves the
existing `onActive`/`searching` invariants verbatim.

**Anti-fiction guard.** When the pool returns `[]`, the results grid renders the truthful empty
state — "**No applicants yet** — your company has not received any applications. They'll show up
here as candidates apply to your jobs." When a search returns `hits: []`, render "**No candidates
match** — try a broader keyword or a different stage." **Never insert fake candidates, fake names,
fake fit scores, or fake skill chips** to fill the grid; never imply this search reaches a global
candidate database.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Build the per-screen mockup.** Create
> `docs/brand/redesign-v3/screens/talent-sourcing.html` linking `@ip/ui/src/{tokens.css,app.css}`
> and the SVG sprite. Embed the `.app` shell verbatim from the design language; build the
> 3-column (rail + grid + drawer) composition with clearly-labelled "Sample candidate" rows (A,
> B, C). Verify in both themes at 1440×900 and 390×844 against
> `D-aperture-pro-{light,dark}-full.jpeg`. Commit the new HTML file only.

- **Task 1 — Shell + page head + filter rail.** Mount the page under `CompanyShell`; render
  `<TalentHead />` and `<FilterRail />` with local filter state. The rail's keyword, stage chips,
  and min-fit slider are wired but the grid is still empty. Verify the rail collapses cleanly at
  the mid breakpoint and full-stacks under 760px. Commit
  `apps/company/app/talent/page.tsx`,
  `apps/company/components/talent/{talent-head.tsx,filter-rail.tsx}`.

- **Task 2 — Results grid: pool fallback.** Build `<ResultsGrid />` rendering the
  `Talent.GetTalentPool` response as `.match > .card` rows when the keyword is empty. Preserve
  the existing `LoadingState` / `EmptyState` ("No applicants yet") / `ErrorState` + retry
  branches. Rows show masked handle + `.sub` "Applied to N roles" (no fit/stage in the pool
  shape) + a neutral `.pill`. Verify the grid renders identically on desktop and mobile. Commit
  `apps/company/components/talent/results-grid.tsx`.

- **Task 3 — Results grid: search hits.** Wire the `["candidate-search", params]` query through
  `sourcingClient.searchCandidates(params)`. When the query is active, render hits as
  `.match > .card` rows with the `.pct` mono percent (`Math.round(fitScore * 100) + "%"`) and the
  stage `.pill` via `applicationStatus(topStage)`. Empty/loading/error branches mirror the pool.
  Verify with `NEXT_PUBLIC_MOCK=1`: typing "react" replaces the pool with ranked mocks; clearing
  restores the pool; selecting a stage narrows the results. Commit the same file.

- **Task 4 — Candidate drawer.** Build `<CandidateDrawer />` opened by `selectedId` and closed by
  ESC / backdrop / close button. The drawer reads the row's own `CandidateHitDTO` (or pool entry)
  — no extra fetch. Render the `.ring` score donut from `fitScore`, the stage `.pill`, the
  matched-skill `.badge` chips, the "Match signal" `.bars` block (all-equal fills with a mono
  note when the search returns no per-skill score), and the two action CTAs. Verify the drawer
  slides in on desktop and full-screens on mobile, traps focus, and is dismissible via keyboard.
  Commit `apps/company/components/talent/candidate-drawer.tsx`.

- **Task 5 — Page assembly + fidelity verify.**
  1. `apps/company/app/talent/page.tsx` mounts `<TalentSourcing />` inside `<CompanyShell>`.
  2. `--filter @ip/company build` + `--filter @ip/company exec tsc --noEmit` are green.
  3. Boot the dev server, sign in as a recruiter, screenshot `/company/talent` in both themes at
     1440×900 and 390×844 against the Task-0 HTML and the design-language reference. Iterate any
     divergence until 1:1. Commit verify shots under
     `docs/brand/redesign-v3/verify/talent-sourcing-{light,dark}.jpeg`.
  4. Confirm a non-manager is still redirected by `CompanyShell` — the role gate is unchanged.
  5. Confirm the `["candidate-search", params]` query stays gated on `query.length > 0`; the
     masked-handle `slice(0,12)…` rendering is preserved; the search universe is comp-scoped.

## States & a11y

- **States.** Each region loads / errors / empties **independently** — the page never blocks on
  one query.
  - **Loading** — pool grid + search grid render `LoadingState` skeleton rows (3 placeholder
    `.match > .card` rows with shimmer); drawer body skeletons the ring + bars.
  - **Empty** — truthful copy per the anti-fiction guard above; no fabricated candidates.
  - **Error** — `ErrorState` + retry per region; the page chrome stays usable.
  - **Success** — grid renders real rows; opening the drawer doesn't refetch (it reads the
    selected row's `CandidateHitDTO`); filter changes update the query key, not the route.
- **Responsive.** Sidebar collapses ≤1000px per the design language. Rail + grid layout
  3+9 columns ≥1100px → stacked (rail on top) at the mid breakpoint → full-bleed ≤760px. The
  drawer is a right-aligned panel ≥1100px and a full-screen sheet ≤760px (with a sticky bottom
  action bar for the two CTAs).
- **Dark + light.** All color via tokens; the ring fill, chip backgrounds, and bar fills resolve
  cleanly in both themes and inherit per-user Appearance accent overrides.
- **A11y.** One `<h1>` per page (the head). `<main>` + `<aside>` landmarks; the drawer is
  `role="dialog"` with `aria-modal="true"`, a labelled close button, focus trap on open, and
  ESC-to-close. Result rows are real `<button>`s (not divs) with `aria-label="Open candidate
  <masked handle>"`. The stage `.chip-toggle` is `role="group"` with `aria-pressed` per chip.
  The min-fit slider is a real `<input type="range">` with `aria-valuetext`. The `.ring` donut
  carries an `aria-label` ("Fit score 87 of 100"). Touch targets ≥44×44. Contrast ≥4.5:1 body
  (`--ink-2` on `--bg`). Focus rings: `:focus-visible` uses `--teal` 2px / 4px halo. Pulsing
  status dots respect `prefers-reduced-motion`.

## Acceptance

- Looks 1:1 like the per-screen Task 0 HTML AND the relevant slices of
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Side-by-side
  screenshot proof committed under
  `docs/brand/redesign-v3/verify/talent-sourcing-{light,dark}.jpeg`.
- `--filter @ip/company build` is green; `tsc --noEmit` is green; no console errors / warnings.
- **Zero functional diff.** Same `Talent.GetTalentPool`, same `Sourcing.SearchCandidates` (mock
  today, real after `pnpm gen`), same `["talent","pool"]` + `["candidate-search", params]` query
  keys, same `enabled: query.length > 0` gating, same masked-handle `slice(0,12)…` rendering, same
  `Number(applicationCount)` widening. The mock→real seam flips from `makeMockSourcingClient()`
  to `realSourcingClient(api)` only — components unchanged.
- Empty states are truthful — no fabricated candidates, no fake fit scores, no implication that
  the search reaches outside the company's own applicants.
- Per-user Appearance flows through: switching `accent=coral` recolors `--teal`, the `.ring`
  fill, chip highlight, and bar fills without a code change.
- A non-manager loading `/company/talent` is still redirected by `CompanyShell`'s
  `useRequireRole(["recruiter","company_admin"])`.
