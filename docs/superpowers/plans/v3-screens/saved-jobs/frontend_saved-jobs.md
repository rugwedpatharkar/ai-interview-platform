# Saved jobs — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

A signed-in candidate's bookmarked jobs, rebuilt as an Aperture Pro single-column feed of `.cell` job cards inside the `.app` shell. Each card carries the reusable **SaveJobButton** (optimistic bookmark toggle); unsaving from the list removes the card with no flicker. **The data layer is FROZEN** — the `["saved-jobs"]` list query and the optimistic `["saved-jobs","ids"]` flip / rollback in `SaveJobButton` continue exactly as today; only the UI is new.

## Route + role

`/saved` · **candidate**. Rendered inside the new candidate `.app` shell (sidebar `Saved` `aria-current="page"`).

## Approved mockup (build to this exactly)

- **Reference demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html) — the design system at landing altitude. Job cards in this screen use the same `.cell` primitive as the landing's platform-bento cells, paired with `.pill-*` for facets and `.badge` for skill chips.
- **No per-screen mockup file.** Build directly against the design language doc; Task 0 captures a fidelity reference screenshot.

## Existing code being REPLACED (not modified)

Assume these will be rewritten from scratch:

- `frontend/apps/candidate/app/saved/page.tsx` — markup rebuilt; the `["saved-jobs"]` `useQuery`, the auth guard, and the empty/error/skeleton branches are **lifted verbatim** into the new file.
- `frontend/apps/candidate/components/job-card.tsx` — replaced by a new Aperture Pro `.cell`-based card consuming the same `JobCardDTO` shape. The new component is **shared with marketplace-search** and lives in `@ip/ui` so both screens consume one source.
- `frontend/apps/candidate/components/save-job-button.tsx` — replaced by a new `.btn-ghost.btn-sm` bookmark toggle (filled when saved, outline when not). **The optimistic mutation logic (`onMutate` flip, `onError` rollback, `onSettled` invalidate of both `["saved-jobs"]` and `["saved-jobs","ids"]`) is lifted verbatim** into the new component.
- `frontend/apps/candidate/lib/saved-jobs-client.ts` — `SavedJobsClient` binding and `makeApiSavedJobsClient(api)` are **unchanged**; the rebuild consumes them as-is.

## Layout & components

**Shell:** `.app` sidebar + topbar (candidate audience, `Saved` active).

| Region | Markup / class | Notes |
|---|---|---|
| Sidebar | `.app > .side` | Candidate nav; `Saved` `aria-current="page"`. |
| Topbar | `.topbar` | `.crumb` "Home / Saved". `.toolbar` with audience pill, searchbox (placeholder "Search saved jobs…" — client-side filter only, no fetch), `NotificationBell`, avatar. |
| Page head | `.page-head` | `<h1 class="display">Saved jobs</h1>` + `.sub` ("`{n}` roles you've bookmarked. We'll keep them here until you apply or remove."). Right side: a `.pill-teal` count chip ("`{n}` saved") and a `.btn-ghost` "Browse jobs" → `/jobs`. |
| Job list | Single-column stack of `.cell` job cards | Each card: header row with `<h3>` role title + `.sub` company + location, a `.toolbar` of facet `.pill`s (location, remote mode (`.pill-teal` when remote), employment type, salary range when present), a `.sub` snippet (1-line clamp of the JD), a chip row of skill `.badge`s (max 6 visible, "+N more" overflow), a footer row with `.tnum` `savedAt` relative time on the left and the **SaveJobButton** + a `.btn-primary` "View role" on the right. Whole card is wrapped in a `<Link>` to `/jobs/{jobId}`; the SaveJobButton calls `preventDefault` so toggling never navigates. |
| Empty | `.cell.anchor` framed empty state | Headline ("No saved jobs yet"), supporting copy ("Bookmark roles from the marketplace and they'll land here."), a `.btn-primary` "Browse jobs" → `/jobs`. |

> **Primitives reference (do NOT redefine):** `.app · .side · .topbar · .crumb · .toolbar · .page-head · .cell · .cell.anchor · .pill · .pill-{teal,good,warn,neutral} · .badge · .tnum · .btn · .btn-{primary,ghost,sm}` — defined in `@ip/ui/src/app.css`. Tokens via `@ip/ui/src/tokens.css`.

**New presentational pieces to build:** the Aperture Pro `JobCard` (`@ip/ui/src/job-card.tsx`) — shared with marketplace-search; coordinate so both screens consume one source.

## Data wiring / seam (FROZEN — preserve every existing seam)

- **Client/seam:** `savedJobsClient` from `apps/candidate/lib/saved-jobs-client.ts`, bound LIVE to `makeApiSavedJobsClient(api)` (over `api.savedJobs.*`). **Unchanged.**
- **Query keys (unchanged):**
  - `["saved-jobs"]` — full saved-job list for `/saved` (`savedJobsClient.list()`).
  - `["saved-jobs","ids"]` — the saved-id `Set` consumed by `SaveJobButton.isSaved` (and the marketplace card heart icon).
- **Mutations (unchanged):**
  - `savedJobsClient.save({ jobId })` / `savedJobsClient.unsave({ jobId })` — both invoked via `useMutation` with `onMutate` (flip the `Set` in `["saved-jobs","ids"]` optimistically), `onError` (rollback), `onSettled` (invalidate both `["saved-jobs"]` and `["saved-jobs","ids"]`). The optimistic flip is what makes unsaving from `/saved` remove the card with no flicker.
- **Fields consumed** (per [`backend_saved-jobs.md`](./backend_saved-jobs.md)): `SavedJob` = `jobId`, `title`, `companyName`, `companyId`, `location`, `remoteMode`, `employmentType`, `salaryMin/Max/Currency`, `skills[]`, `postedAt`, `snippet`, `savedAt`.
- **Client-derived (no new fetch):** the searchbox in the topbar filters the **already-fetched** list client-side (title / company / location / skills); no new query or RPC.

## Tasks

> **Task 0 — Fidelity baseline.** Confirm the Aperture Pro demo loads; capture reference shots at 1440×900 (light + dark) into `docs/brand/redesign-v3/verify/saved-jobs-{light,dark}-reference.jpeg`. The build is screenshot-diffed against the design-language primitives in Task 4.

- **Task 1 — `/saved` mounted in the candidate shell + page head.** Wrap the page in `<CandidateShell />` (from `@ip/ui`, introduced by the landing task) with `Saved` `aria-current`. Topbar `.crumb` "Home / Saved". Build the `.page-head` with the count chip and the "Browse jobs" CTA. Verify the existing `["saved-jobs"]` query mounts unchanged. Commit `apps/candidate/app/saved/page.tsx`.
- **Task 2 — Shared `JobCard` in `@ip/ui`.** Build the Aperture Pro `JobCard` as `.cell` with the header / facets / snippet / skills / footer rhythm described above. The component takes a `JobCardDTO` prop + a `right` slot (where the SaveJobButton renders). Export from `@ip/ui` so marketplace-search consumes the same component (coordinate with [`../marketplace-search/frontend_marketplace-search.md`](../marketplace-search/frontend_marketplace-search.md)). Verify a hard-coded story renders identically in both themes. Commit `packages/ui/src/job-card.tsx` + `packages/ui/src/app.css`.
- **Task 3 — Aperture Pro `SaveJobButton`.** Build the new toggle as a `.btn-ghost.btn-sm` (lucide bookmark filled when saved, outline when not), keeping `aria-pressed` and the `preventDefault` that stops the card-link from navigating on toggle. **Lift the optimistic `useMutation` (flip + rollback + invalidate of both keys) verbatim** from the old component. Verify: toggling on a marketplace card persists the bookmark and the `/saved` list updates on the next invalidation; toggling on a `/saved` card removes it with no flicker (optimistic flip); a failed mutation rolls back and `toast`s the error. Commit `packages/ui/src/save-job-button.tsx`.
- **Task 4 — Empty / loading / error + full assembly + fidelity verify.** Build the `.cell.anchor` empty state, the loading skeleton (3 placeholder `.cell` cards), and the error branch (`.cell.anchor` with the error + retry).
  1. `--filter @ip/candidate build` is green; `--filter @ip/{ui,shared,api-client} typecheck` is green.
  2. Run the dev server, sign in as a candidate seeded with bookmarked + non-bookmarked jobs.
  3. Screenshot at 1440×900 in both themes; visually diff against the Aperture Pro design-language primitives; iterate until the list reads as the same product as the landing.
  4. Confirm: bookmarked jobs render; clicking a card's bookmark un-saves it and the card disappears with no flicker; empty state appears once all bookmarks are cleared; nav highlights `Saved`; the same `JobCard` + `SaveJobButton` work on marketplace-search.
  5. Save final screenshots to `docs/brand/redesign-v3/verify/saved-jobs-{light,dark}.jpeg`.

## States & a11y

- **States (all preserved):**
  - **Loading** — skeleton stack of 3 placeholder `.cell` cards (token-driven shimmer).
  - **Empty** — `.cell.anchor` ("No saved jobs yet" + "Browse jobs" CTA).
  - **Error** — `.cell.anchor` with the error message + a `.btn-ghost` "Retry" that calls `query.refetch()`.
  - **Success** — single-column `.cell` stack; the optimistic bookmark toggle removes a card without re-fetch.
- **Responsive:**
  - ≥ 1100px — full sidebar + topbar; cards span the content area at a comfortable line length.
  - 760–1099px — sidebar narrows; cards stay single column.
  - ≤ 760px — sidebar collapses to a drawer; the card footer (`savedAt` + actions) stacks; skill chips wrap.
- **Dark + light:** all colors via tokens; remote-mode pill uses `.pill-teal` when `remoteMode === "remote"`; salary pill uses `.pill-neutral`.
- **Reduced motion:** loading skeleton uses a token-driven static shimmer (no animation) under `prefers-reduced-motion: reduce`.
- **A11y:**
  - One `<h1>` (the greeting); each card uses `<h3>`.
  - **SaveJobButton** is `aria-pressed` + `aria-label="Save {role} at {company}" | "Unsave {role}"`; `preventDefault` stops the wrapping link from navigating on toggle.
  - The whole-card `<Link>` carries `aria-label="View {role} at {company}"`.
  - Facet pills carry text labels (not color-only).
  - The page-head count chip is `aria-live="polite"` so screen readers announce when the list shrinks after an unsave.
  - Focus rings via tokens (`--teal` 2px outline + 4px halo); touch targets ≥ 44×44; body contrast ≥ 4.5:1.

## Acceptance

- The saved-jobs list reads as the same product as the Aperture Pro landing — same tokens, type scale, primitives (`.cell` / `.pill-*` / `.badge` / `.btn-*`). Side-by-side screenshot proof committed at `docs/brand/redesign-v3/verify/saved-jobs-{light,dark}.jpeg`.
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors / warnings; reduced-motion is honored.
- **Zero functional diff vs. today:** same `savedJobs.{save, unsave, listSavedJobs}` round-trips (LIVE); same `["saved-jobs"]` / `["saved-jobs","ids"]` query keys; same optimistic flip + rollback + invalidate-both; same `SaveJobButton` reused across search / company / detail screens.
- The shared `JobCard` in `@ip/ui` is consumed by both `/saved` and the marketplace — one source.
- Pre-launch posture is preserved: empty state copy is truthful ("No saved jobs yet — bookmark roles from the marketplace") with no fabricated sample employer names.
