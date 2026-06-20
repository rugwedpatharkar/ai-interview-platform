# Frontend — Saved jobs (v3 Midnight reskin)

> **Screen:** Signed-in candidate's saved/bookmarked jobs.
> **Goal:** Port `/saved` to the **Midnight Intelligence** look inside the `.app` shell — a single-column list of saved
> jobs as Midnight job cards, each with the reusable **SaveJobButton** bookmark toggle — **appearance only.** The
> `["saved-jobs"]` list query and the **optimistic** save/unsave mutation (flip + rollback over `["saved-jobs","ids"]`)
> stay byte-for-byte identical; only markup + token classes change.

- **Unified route(s) + role:** `/saved` · **candidate**.
- **Mockup:** ✗ — **build in Task 0** (`docs/brand/redesign-v2/saved-jobs.html`).
- **Existing code it reskins:**
  - `frontend/apps/candidate/app/saved/page.tsx` (authed list — query/empty/error/skeleton; **keep verbatim**)
  - `frontend/apps/candidate/components/job-card.tsx` (the shared card — restyle to Midnight `.card`)
  - `frontend/apps/candidate/components/save-job-button.tsx` (the **optimistic** toggle — logic **unchanged**)
  - `frontend/apps/candidate/lib/saved-jobs-client.ts` (the `SavedJobsClient` binding — **unchanged**)
- **Backend:** `backend_saved-jobs.md` (EXISTING — reuse v2 `../v2-screens/saved-jobs.md`). `savedJobs.{save,unsave,
  listSavedJobs}` — **already LIVE** (mark real).

---

## Layout & components

**Shell:** the `.app` sidebar+topbar product shell (Saved active). Regions:

| Mockup region | Markup / `@ip/ui` + `app.css` classes | Source today |
|---|---|---|
| Sidebar | `.side` · `.navitem[aria-current]` on Saved · `.side .foot` `.avatar` | candidate shell |
| Topbar | `.topbar` · `.crumb` `Home / Saved` · `.toolbar` `.searchbox` | shell topbar |
| Page head | `.page-head` (`h2` "Saved jobs" + `.sub` count) | page `<h1>` |
| Job list | single-column stack of Midnight job cards: `.card` (`.role`/`.co`, location/remote/salary as `.pill-neutral`/`.badge`, skills chips) + the `action` slot top-right holding `SaveJobButton` (`.btn-ghost.btn-sm`, `aria-pressed`) | `JobCard` + `SaveJobButton` |
| Empty | `.card`-framed empty state ("No saved jobs yet" → `.btn-primary` "Browse jobs" → `/jobs`) | `EmptyState` |

> **Component classes (reference):** `.app · .side · .topbar · .content · .page-head · .card · .pill(.pill-neutral) ·
> .badge · .btn(.btn-primary/.btn-ghost/.btn-sm)` from `app.css`; tokens from `tokens.css`.

**New vs reused:** no new logic components. `JobCard` is **restyled** to the Midnight `.card` (shared with the
marketplace reskin); `SaveJobButton` keeps its optimistic mutation and is restyled to `.btn-ghost.btn-sm` (bookmark
filled/outline). The page's loading `Skeleton`/`EmptyState`/`ErrorState` map to the Midnight equivalents.

---

## Data wiring (identical to today)

- **Client/seam:** `app/saved/page.tsx` calls `savedJobsClient.list()` and `SaveJobButton` calls
  `savedJobsClient.{save,unsave}`. The binding is **LIVE** (`makeApiSavedJobsClient(api)` over `api.savedJobs.*`).
  **Unchanged** — the reskin must not touch the client wiring.
- **Query keys:** `["saved-jobs"]` (the full list, for `/saved`) and `["saved-jobs","ids"]` (the id `Set`, for
  `SaveJobButton.isSaved`). The optimistic `onMutate`/`onError`(rollback)/`onSettled`(invalidate both) flow is **unchanged**.
- **Fields consumed** (from `backend_saved-jobs.md`, identical): `SavedJobDTO extends JobCardDTO` — `jobId`, `title`,
  `companyName`, `companyId`, `location`, `remoteMode`, `employmentType`, `salaryMin/Max/Currency`, `skills[]`,
  `postedAt`, `snippet`, `savedAt`.

---

## Tasks (bite-sized; restyle + shell)

### Task 0: Build the mockup (mockup ✗)
- [ ] Create `docs/brand/redesign-v2/saved-jobs.html` against `tokens.css` + `app.css`: the `.app` shell + a
  single-column stack of Midnight job cards (with the bookmark `action`) + the empty state, matching the Midnight
  family (`data-theme="dark"`).
- [ ] Browser-verify on the :4173 preview (dark + light); commit the mockup.

### Task 1: Wrap `/saved` in the `.app` shell + page head
- [ ] Render the page inside the candidate `.app` shell (Saved `aria-current`), topbar `.crumb` `Home / Saved`, the
  `.page-head` ("Saved jobs" + count). **Keep** the `["saved-jobs"]` query + auth guard untouched.
- [ ] Build (`--filter @ip/candidate build`, stop dev first) + browser-verify; commit.

### Task 2: Restyle `JobCard` to the Midnight `.card`
- [ ] Swap ad-hoc Tailwind to `.card` with `.role`/`.co`, location/remote/salary as `.pill-neutral`/`.badge`, skills
  chips; keep the `action` slot top-right. Build + browser-verify; commit. *(Shared with the marketplace reskin — coordinate.)*

### Task 3: Restyle `SaveJobButton` + states
- [ ] Restyle the toggle to `.btn-ghost.btn-sm` (filled bookmark when saved / outline when not), keeping
  `aria-pressed` + `preventDefault`. **Keep** the optimistic `useMutation` (flip + rollback + invalidate) **verbatim**.
  Restyle the loading `Skeleton` + the `EmptyState` ("No saved jobs yet" → `.btn-primary` "Browse jobs").
- [ ] Build + `--filter @ip/{ui,shared,api-client} typecheck` green; browser-verify: bookmarked jobs render; clicking
  a card's bookmark **un-saves it and it disappears** (optimistic); empty state after clearing all; nav highlights Saved; commit.

---

## States & a11y
- **States (all preserved):** **loading** (`Skeleton`), **empty** ("No saved jobs yet" → `/jobs`), **error**
  (`EmptyState` with the error message), **success** (Midnight job-card list). The toggle is **optimistic** — flips
  instantly, rolls back on failure (`toast` on error only).
- **Responsive:** single-column card list; the bookmark stays in the card's top-right `action` slot; sidebar hides ≤1000px.
- **Dark + light:** **dark-first**; all colors via tokens — **no hardcoded color**; reads per-user accent/base.
- **A11y:** `SaveJobButton` is `aria-pressed` + `aria-label`; it `preventDefault`s so the wrapping card-link doesn't
  navigate on toggle; the page has a real `<h1>`; focus rings via tokens; contrast ≥4.5:1.

## Acceptance
- Matches the Task 0 `saved-jobs.html` (Midnight job-card list + bookmark toggle + empty state).
- Build + typecheck green for `@ip/candidate` (+ `@ip/ui`/`shared`/`api-client`).
- **Zero functional diff:** same `savedJobs.{save,unsave,listSavedJobs}` (LIVE), same `["saved-jobs"]` /
  `["saved-jobs","ids"]` keys, same optimistic flip + rollback, same `SaveJobButton` reused across search/company/detail.
  Real path unchanged (binds to live `api.savedJobs.*` today).
