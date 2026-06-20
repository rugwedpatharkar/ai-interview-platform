# Frontend — Job alerts (v3 Midnight reskin)

> **Screen:** Signed-in candidate's saved-search "job alerts" (create / list / delete-with-confirm).
> **Goal:** Port `/alerts` to the **Midnight Intelligence** look inside the `.app` shell — a create form (keyword +
> filters + frequency) above a list of saved-alert rows with confirm-gated delete — **appearance only.** The
> `["job-alerts"]` query, the create/delete mutations (`toast` + invalidate), and the `summarizeAlert` helper stay
> byte-for-byte identical; only markup + token classes change. **The FE never triggers a run** (the sweep is BE).

- **Unified route(s) + role:** `/alerts` · **candidate**.
- **Mockup:** ✗ — **build in Task 0** (`docs/brand/redesign-v2/job-alerts.html`).
- **Existing code it reskins:**
  - `frontend/apps/candidate/app/alerts/page.tsx` (authed CRUD — query/mutations/empty/error; **keep verbatim**)
  - `frontend/apps/candidate/components/alert-form.tsx` (keyword/remote/frequency form — restyle to `.input`/`.toolbar`)
  - `frontend/apps/candidate/components/alert-row.tsx` (summary + last-run + confirm-delete — restyle to `.card`/`.approw`)
  - `frontend/apps/candidate/lib/job-alerts-client.ts` (`JobAlertsClient` + pure `summarizeAlert` — **unchanged**)
- **Backend:** `backend_job-alerts.md` (EXISTING — reuse v2 `../v2-screens/job-alerts.md`). `JobAlertsService`
  CRUD (`create`/`list`/`delete`); the scheduled run-alerts sweep is a separate BE pillar task, not this screen.

---

## Layout & components

**Shell:** the `.app` sidebar+topbar product shell (Alerts active). Regions:

| Mockup region | Markup / `@ip/ui` + `app.css` classes | Source today |
|---|---|---|
| Sidebar | `.side` · `.navitem[aria-current]` on Alerts · `.side .foot` `.avatar` | candidate shell |
| Topbar | `.topbar` · `.crumb` `Home / Alerts` · `.toolbar` | shell topbar |
| Page head | `.page-head` (`h2` "Job alerts" + `.sub` "Save a search and we'll notify you…") | page heading |
| Create form | `.card` wrapping `AlertForm`: keyword `.input` + remote/frequency selects (`.input`-styled) + `.btn-primary` "Create alert", laid out as a `.toolbar`/`.searchbox`-adjacent row | `AlertForm` restyle |
| Alert list | stack of `AlertRow`s as `.card`/`.approw`: `summarizeAlert` text + frequency `.badge` + last-run `.sub` + `.btn-ghost.btn-sm` Delete (confirm-gated) | `AlertRow` restyle |
| Empty | `.card`-framed empty state ("No alerts yet" → "Create your first saved search above.") | `EmptyState` |

> **Component classes (reference):** `.app · .side · .topbar · .content · .page-head · .card · .toolbar · .searchbox ·
> .input · .badge · .pill · .btn(.btn-primary/.btn-ghost/.btn-sm)` from `app.css`; tokens from `tokens.css`.

**New vs reused:** no new logic components. `AlertForm` and `AlertRow` keep their props/logic and are **restyled** to
the Midnight classes above. The loading `Skeleton`/`EmptyState` map to Midnight equivalents.

---

## Data wiring (identical to today)

- **Client/seam:** `app/alerts/page.tsx` calls `jobAlertsClient.{list,create,remove}`. The binding is the
  `JobAlertsClient` seam (mock today; `makeApiJobAlertsClient(api)` over `api.jobAlerts.*` once `pnpm gen` lands).
  **Unchanged** — the reskin must not touch the client wiring or the swap path.
- **Query keys:** `["job-alerts"]` (the list). Create + delete invalidate it; both `toast` on success/error. **Unchanged.**
- **Fields consumed** (from `backend_job-alerts.md`, identical): `JobAlertDTO` — `alertId`, `keyword`, `filters`
  (`location`/`remoteMode`/`employmentType`/`experienceLevel`/`skills[]`), `frequency` (`daily`|`weekly`), `createdAt`,
  `lastRunAt` (`null` → "Never run yet"). `summarizeAlert(alert)` renders the human label (pure, unchanged).

---

## Tasks (bite-sized; restyle + shell)

### Task 0: Build the mockup (mockup ✗)
- [ ] Create `docs/brand/redesign-v2/job-alerts.html` against `tokens.css` + `app.css`: the `.app` shell + a `.card`
  create form (keyword/remote/frequency + Create) + a stack of alert rows (summary + frequency `.badge` + last-run +
  Delete) + the empty state, matching the Midnight family (`data-theme="dark"`).
- [ ] Browser-verify on the :4173 preview (dark + light); commit the mockup.

### Task 1: Wrap `/alerts` in the `.app` shell + page head
- [ ] Render the page inside the candidate `.app` shell (Alerts `aria-current`), topbar `.crumb` `Home / Alerts`, the
  `.page-head` ("Job alerts" + sub). **Keep** the `["job-alerts"]` query + auth guard untouched.
- [ ] Build (`--filter @ip/candidate build`, stop dev first) + browser-verify; commit.

### Task 2: Restyle `AlertForm` (the create row)
- [ ] Swap ad-hoc Tailwind to `.card` + `.input`/select + `.btn-primary` "Create alert". **Keep** the controlled state,
  the `CreateAlertInput` it reports up, and the page's `create.mutate` wiring untouched. Build + browser-verify; commit.

### Task 3: Restyle `AlertRow` + states
- [ ] Restyle each row to `.card`/`.approw`: `summarizeAlert` text, frequency `.badge`, last-run `.sub`
  ("Never run yet" when `lastRunAt === null`), `.btn-ghost.btn-sm` Delete behind the **existing** `ConfirmDialog`.
  Restyle the loading `Skeleton` + `EmptyState`. **Keep** `summarizeAlert` + delete mutation untouched.
- [ ] Build + `--filter @ip/{ui,shared,api-client} typecheck` green; browser-verify: seeded alert renders with summary
  + last-run; submitting prepends a new alert (`toast` "Alert created"); Delete opens the confirm and removes the row;
  empty state once all gone; nav highlights Alerts; commit.

---

## States & a11y
- **States (all preserved):** **loading** (`Skeleton`), **empty** ("No alerts yet"), **error** (`EmptyState` with the
  error message), **success** (form + alert-row list). Create/delete are mutations with `toast` feedback +
  `["job-alerts"]` invalidation; delete is **confirm-gated**. `lastRunAt === null` → "Never run yet" (the sweep writes
  it; the FE never runs alerts).
- **Responsive:** the form stacks on mobile (`sm:flex-row`); rows are full-width `.card`s; sidebar hides ≤1000px.
- **Dark + light:** **dark-first**; all colors via tokens — **no hardcoded color**; reads per-user accent/base.
- **A11y:** the create form is a `<form>` with labelled fields; remote/frequency are labelled selects; Delete has an
  `aria-label` + a confirm step; the page has a real `<h1>`; focus rings via tokens; contrast ≥4.5:1.

## Acceptance
- Matches the Task 0 `job-alerts.html` (Midnight create form + alert-row list + empty state).
- Build + typecheck green for `@ip/candidate` (+ `@ip/ui`/`shared`/`api-client`).
- **Zero functional diff:** same `JobAlertsService` create/list/delete round-trip, same `["job-alerts"]` key, same
  confirm-gated delete, same `summarizeAlert`. **The FE never triggers a run** (sweep is BE). Mock→real swap path
  (`makeApiJobAlertsClient`) unchanged.
