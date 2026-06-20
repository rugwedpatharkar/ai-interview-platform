# Frontend — `talent-sourcing` (Midnight v3)

> **Screen:** Talent pool / sourcing — search and browse candidates who applied to your jobs.
> **Goal:** Reskin the talent page to the Midnight shell — a candidate **search** (keyword / stage filter) over the
> company's **own applicants only**, returning ranked rows with **fit badges**, above the default full-pool table.
> **Appearance-only:** the search universe, query gating, masked-handle treatment, and the pool fallback stay
> identical; only markup/classes change.
> **Unified route(s) + role:** `/company/talent` · **company** (recruiter / company_admin), inside the `.app` shell
> under `/company/*`.
> **Mockup:** ✗ — none exists → **build it in Task 0** (`redesign-v2/talent-sourcing.html`).
> **Existing code it reskins (exact paths):**
> - `frontend/apps/company/app/talent/page.tsx` (mounts search above the pool; pool is the empty-query default)
> - `frontend/apps/company/components/candidate-search.tsx` (search bar + stage filter + results)
> - `frontend/apps/company/components/fit-badge.tsx` (fit-score badge)
> - `frontend/apps/company/app/talent/sourcing-client.ts` (mock seam — untouched)
> - `frontend/apps/company/app/talent/sourcing-types.ts` (DTO — untouched)

**Privacy note (carry into copy):** results render **only** the masked handle (`slice(0,12)…`) + counts + fit +
stage + matched skills — **no ID / background / biometric data**. The search universe is the company's **own
applicants only** — never a global candidate index.

## Layout & components

**Shell:** the signed-in product shell — `.app` (`.side` sidebar + `.topbar`) from `@ip/ui` / `redesign-v2/app.css`,
mounted by `CompanyShell`; body in `.content` with a `.page-head` (title + sub).

| Region | Mockup class(es) | Maps to (existing component) |
|---|---|---|
| Page chrome | `.app · .side · .topbar · .content · .page-head` | `CompanyShell` + `PageHeader` |
| Search card | `.card.tight` | `candidate-search.tsx` outer `Card` |
| Search form | `.toolbar` + `.searchbox` (keyword) + `.input`/select (stage) + `.btn .btn-primary` | the `<form>` (`Field`/`Input`/`Select`/`Button`) |
| Stage filter | `.chip-toggle` group **or** select `.input` | the `Select` (Any stage / Applied / Interview / Shortlisted / Rejected) |
| Results table | `.table-wrap > table.data` (`.who .nm/.sub`, `.tnum`) | the results `Table` |
| Fit badge | `.pill` (`.pill-good` ≥0.8 / `.pill-warn` ≥0.5 / `.pill-neutral`) | `fit-badge.tsx` (`FitBadge` + `fitTone`) |
| Stage badge | `.pill` (tone from `applicationStatus`) | the stage `Badge` |
| Matched skills | `.badge` chips | the skills `Badge` list |
| Masked handle | `.who .nm` mono + `.who .sub` | the `font-mono` candidate cell |
| Default pool (empty query) | `.table-wrap > table.data` + mobile `.card` stack | the `page.tsx` pool table + `sm:hidden` card variant |

**New vs reused:** **no new components.** Class/markup reskin of the existing search + pool tree. `FitBadge` maps its
`fitTone` buckets onto `.pill-good/.pill-warn/.pill-neutral`. The default pool keeps both its desktop `table.data`
and its ~375px `.card` stack.

## Data wiring (kept identical to today)

- **Client/seam:** the default (empty-query) pool uses `useAuth().api.talent.getTalentPool({})` (live, generated).
  The **search** uses `makeMockSourcingClient()` from `sourcing-client.ts` (`USE_MOCK_SOURCING`) until
  `SourcingService.SearchCandidates` lands; after `pnpm gen` it binds to `api.sourcing.searchCandidates(p)` — the
  component is unchanged.
- **TanStack query keys (unchanged):** `["talent"]` (pool) · `["candidate-search", params]` (search;
  `enabled: query.length > 0`).
- **Backend fields consumed** (see [`backend_talent-sourcing.md`](./backend_talent-sourcing.md)): pool entries
  (`candidateUserId`, `applicationCount`); search `CandidateHitDTO` (`candidateUserId`, `applicationCount`,
  `fitScore` 0..1, `topStage`, `matchedSkills[]`). The `onActive`/`searching` gating that hides the pool while a
  search is active, the `slice(0,12)…` masking, and the `Number(applicationCount)` widening **stay identical**.

## Tasks (bite-sized — reskin only, no logic change)

### Task 0: Build the mockup (no mockup exists)
- [ ] Author `docs/brand/redesign-v2/talent-sourcing.html` against `tokens.css` + `app.css`: the `.app` shell, a
  `.card.tight` search row (`.searchbox` keyword + stage `.chip-toggle`/select + `.btn .btn-primary`), a results
  `.table-wrap > table.data` with `.who .nm` masked handles, fit `.pill-good/.pill-warn/.pill-neutral`, stage `.pill`,
  matched-skill `.badge`s, and below it the default-pool `table.data` (+ a mobile `.card` stack). No identity/biometric
  columns. Browser-verify on the :4173 preview; commit `docs/brand/redesign-v2/talent-sourcing.html`.

### Task 1: Shell + page head + pool fallback
- [ ] Confirm `CompanyShell` renders the Midnight `.app`/`.side`/`.topbar`/`.content` shell; reskin `PageHeader` to
  `.page-head` (title "Talent pool" + sub).
- [ ] Reskin the default pool in `page.tsx` to `.table-wrap > table.data` (desktop) keeping the `sm:hidden` `.card`
  stack for ~375px; preserve `LoadingState`/`ErrorState`/`EmptyState` and the `!searching` gate.
- [ ] Build + browser-verify; commit `frontend/apps/company/app/talent/page.tsx`.

### Task 2: Search form
- [ ] In `candidate-search.tsx`, wrap the form in `.card.tight` + `.toolbar`; reskin the keyword `Input` to
  `.searchbox`, the stage `Select` to `.chip-toggle` group (or `.input` select), and the submit `Button` to
  `.btn .btn-primary`. Keep `draft`/`params` state, `submit()`, and `onActive` exactly.
- [ ] Build + browser-verify; commit `candidate-search.tsx`.

### Task 3: Results table + fit/stage/skill badges
- [ ] Reskin the results `Table` to `.table-wrap > table.data`; masked handle → `.who .nm` mono; app count → `.tnum`.
- [ ] In `fit-badge.tsx`, keep `fitTone` thresholds; map to `.pill-good`/`.pill-warn`/`.pill-neutral`. Stage badge →
  `.pill` (tone from `applicationStatus`); matched skills → `.badge` chips.
- [ ] Preserve the `Skeleton` loading row and the "No candidates match" `EmptyState`.
- [ ] Build + browser-verify (`NEXT_PUBLIC_MOCK=1`: type "react" → results replace pool; clear → pool returns; pick
  a stage → results narrow); commit `candidate-search.tsx` + `fit-badge.tsx`.

## States & a11y

- **States (named, all preserved):**
  - **Default (empty query):** *loading* (`LoadingState`) · *error* (`ErrorState` + retry) · *empty*
    (`EmptyState` "No candidates yet") · *populated* (pool `table.data` + mobile card stack).
  - **Search active:** *loading* (`Skeleton`) · *empty* (`EmptyState` "No candidates match") · *results*
    (`table.data` with fit/stage/skill badges). The query fires only when non-empty; clearing restores the pool.
- **Responsive:** the search form is `sm:flex-row` (stacks at ~375px); both tables live in `.card`s / `.table-wrap`
  and scroll within their container; the default pool keeps its mobile `.card` stack; the `.side` collapses under the
  `@media (max-width:1000px)` shell rule.
- **Dark + light:** all color via tokens (`.pill-*`, `.badge`, `.who .sub`, `.searchbox`) — reads `--accent`/base
  vars, **no hardcoded color**; auto-themes.
- **A11y:** the search is a `<form>` with labelled `Field`s; candidate handles carry `aria-label`; fit + stage are
  text `.pill`s (not color-only); focus rings via `:focus-visible`; contrast ≥4.5:1.

## Acceptance

- Matches the new `redesign-v2/talent-sourcing.html` (Task 0): `.card.tight` search row, fit/stage/skill badges on a
  `table.data` results table, the default pool below.
- `GetTalentPool` remains the empty-query default; the search universe stays the company's own applicants only.
- `--filter @ip/ui typecheck` + `--filter @ip/company build` + `typecheck` green.
- **Zero functional diff:** query keys, the `onActive`/`searching` gate, the masked-handle `slice(0,12)…`, the mock
  seam, and `Number(applicationCount)` widening are unchanged — markup/classes only.
- Mock→real path unchanged: builds against the sourcing mock today; after `pnpm gen` only the
  `makeMockSourcingClient()` → `api.sourcing.searchCandidates` binding flips.
