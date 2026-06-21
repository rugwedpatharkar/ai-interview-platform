# Jobs list — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Rebuild `/company/jobs` from scratch in the Aperture Pro design language. The page is the
recruiter's "every role I own" surface — a dense, sortable, filter-chip-driven table of every
job posting their company has created, with status pills, applicant + new-applicant counts, a
posted-on date, and a per-row View action. The previous v2/Midnight table markup is **discarded**;
only the data hook (`ListJobs`) and the status-mapping helpers survive.

## Route + role

`/company/jobs` (`apps/company/app/jobs/page.tsx`) · **company** — guarded by
`useRequireRole(["recruiter", "company_admin"])` (enforced inside `CompanyShell`).

## Approved mockup (build to this exactly)

- **Live demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — `.app` shell, `.cell` surface, `.pill`, `.match > .card` row vocabulary, `.tag` mono labels.
- **Screenshots:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.

No per-screen mockup yet — Task 0 builds the standalone HTML that the React build mirrors 1:1.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope:

- `frontend/apps/company/app/jobs/page.tsx` — `JobsPage` body (the v2/Midnight table markup,
  `STATUS_ICON` / `STATUS_HINT` Tailwind composition, `buttonVariants()` Create link wrap)

What is **NOT** touched: `CompanyShell` (auth+role gate), `jobStatus()` (`@ip/ui` status-→pill
helper — its mapping survives, only the consumer markup is new), and any generated client.

## Section spine — 5 regions, in order

| # | Region | Component | Notes |
|---|---|---|---|
| 0 | App shell | `<CompanyShell>` (existing) | `.app` sidebar + topbar. **Jobs & applicants** carries `aria-current="page"`. Topbar crumb = `<Company> / Jobs`, search box ("Search postings…"), avatar. |
| 1 | Page head | `<JobsHead />` | h1 ("Jobs") + `.sub` ("Postings you've created for your company.") + trailing `.btn.btn-primary` **+ Post a job** (Link `/company/jobs/new`). |
| 2 | Filter chip bar | `<JobsFilterBar />` | Above-the-table row of filter chips. Each chip = `.pill` toggled via `aria-pressed` (selected → `.pill-teal`; unselected → `.pill`). Chips: **All · Published · Paused · Draft · Closed**. Counts come from the already-fetched list — render-only client filter, no extra fetch. A trailing `.sub` line ("Showing N of M") with mono `.tnum` numerals. |
| 3 | Jobs table | `<JobsTable />` | A `.cell` (22px radius, 1.4rem padding) wrapping a semantic `<table>`. Columns: **Role · Status · Applicants · New · Posted · ·**. `thead` is Schibsted 600 + `--ink-deep`; `tbody td` is body (`--ink`). Hover background = `--surface-2`. Status pill via `jobStatus(status)` → `.pill-good/.pill-warn/.pill`. Applicants + New cells are mono `.tnum`. Posted is mono short date. Trailing cell carries a **View** `.btn.btn-ghost.btn-sm` → `/company/jobs/[id]`. |
| 4 | Empty / loading / error | `<JobsTable.Empty/Loading/Error />` | All inline within the `.cell`. Empty: "No jobs yet — post a role to get started" + `.btn.btn-primary` linking to `/company/jobs/new`. Loading: 3 skeleton rows. Error: an inline `.pill-danger` row + Retry `.btn.btn-ghost.btn-sm`. |

## Layout & components — map to `@ip/ui` and tokens

| Region | Primitive | Tokens |
|---|---|---|
| Shell | `CompanyShell` (existing) | already on the new tokens |
| Head | `h1.display` + `.sub` + `.btn.btn-primary` | typography + button tokens |
| Filter chips | `.pill` / `.pill-teal` with `[aria-pressed]` | semantic teal pill for selected state |
| Table cell | `.cell` wraps `<table>` | `--surface`, `--line`, 22px radius |
| Table header | Schibsted 600 `--ink-deep`, bottom-border `--line` | typography token |
| Status cell | `.pill-good` published · `.pill-warn` paused · `.pill` draft/closed | via `jobStatus()` (existing helper) |
| Numeric cells | mono `.tnum` (Geist Mono) | data-UI typography rule |
| Action | `.btn.btn-ghost.btn-sm` View link | button tokens |

All primitives live in `@ip/ui/src/app.css`. The `<table>` itself is unstyled HTML; only its
container `.cell` and the inline header/cell tokens give it polish. **Anti-slop ban —** no
side-stripe borders, no glassmorphism, no SaaS hero-metric template, no identical-card grids.

## Data wiring / seam

**Identical to today.** No new RPC, no new query key.

| Region | Hook | Query key | Source |
|---|---|---|---|
| Jobs table | `useAuthedQuery(token, ["jobs"], () => api.jobs.listJobs({}))` | `["jobs"]` | `Job.ListJobs` — see [`backend_jobs-list.md`](./backend_jobs-list.md) |
| Filter chips | pure client filter over the already-fetched `list` | — | — |

Row mapping:

```ts
type Row = {
  jobId: string;
  title: string;
  status: "draft" | "published" | "paused" | "closed";
  applicantCount?: number;
  newCount?: number;
  postedAt?: string; // ISO; empty for drafts
};
```

`jobStatus(status)` (`@ip/ui`) returns `{ label, tone }`; the table renders `.pill-${tone}` and
the label as text (never color-only). Posted dates are formatted as compact "MMM d" (locale-aware,
`Intl.DateTimeFormat`). Drafts render `—` in the Posted cell, not "today".

**Anti-fiction guard.** No fake job rows ever appear. If the company has not posted a job, the
empty state copy is "**No jobs yet** — post a role to get started" with the primary CTA.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Build the per-screen mockup.** Create
> `docs/brand/redesign-v3/screens/jobs-list.html` linking `@ip/ui/src/{tokens.css,app.css}` and
> the sprite. Embed the `.app` shell verbatim. Body = `<JobsHead />` + `<JobsFilterBar />` +
> a `.cell` wrapping a 6-column `<table>` of 6 sample rows (mix `published / paused / draft /
> closed`; one row carries a `+3 new` count). Use generic role names ("Sample role — Backend
> engineer") — no fake company outcomes. Screen-specific CSS inline only; everything else from
> `app.css`. Browser-verify on the :4173 preview at 1440×900 and 390×844; iterate against the
> design-language demo. Commit the new HTML file only.

- **Task 1 — Shell + page head.** Mount `JobsPage` under `CompanyShell`; render `<JobsHead />`
  with the h1, `.sub`, and the **+ Post a job** primary CTA. Verify the topbar crumb reads
  `<Company> / Jobs`. Commit `apps/company/app/jobs/page.tsx`,
  `apps/company/components/jobs/jobs-head.tsx`.

- **Task 2 — Filter chip bar.** Build `<JobsFilterBar />` over the already-fetched list. Each
  chip renders its count from the list (`list.filter(j => j.status === status).length`).
  Selected chip toggles `aria-pressed="true"` and adopts `.pill-teal`. A trailing `.sub` shows
  "Showing N of M". Verify chip clicks filter rows without a refetch. Commit
  `components/jobs/jobs-filter-bar.tsx`.

- **Task 3 — Jobs table.** Build `<JobsTable />` reading the filtered rows. Render the 6-column
  semantic `<table>` inside a `.cell` with the header / body styling above. Status cells use
  `jobStatus(status)` → `.pill-${tone}`; Applicants / New / Posted cells use mono `.tnum`;
  trailing cell is a **View** `.btn.btn-ghost.btn-sm` → `/company/jobs/[id]`. The whole row is
  not link-wrapped (keep the cell semantics) — the title and View link are the two affordances.
  Verify row hover, status pill tones, and that draft rows render `—` in Posted. Commit
  `components/jobs/jobs-table.tsx`.

- **Task 4 — Empty / loading / error states.** Inline within the table `.cell`. Empty: full-cell
  message "**No jobs yet** — post a role to get started" + primary CTA. Loading: 3 skeleton rows
  (matched column widths). Error: a `.pill-danger` row with the message + Retry `.btn-ghost.btn-sm`.
  Verify every branch is reachable (force-empty, throw in dev, etc.). Commit
  `components/jobs/jobs-table.tsx`.

- **Task 5 — Page assembly + fidelity verify.**
  1. `--filter @ip/company build` + `tsc --noEmit` green.
  2. Boot dev, sign in as a recruiter, screenshot `/company/jobs` in both themes at 1440×900
     and 390×844. Side-by-side fidelity against the Task-0 HTML and the design-language demo —
     iterate until 1:1.
  3. Confirm a non-manager (e.g., `candidate`) is still redirected by `CompanyShell`.
  4. Confirm the **+ Post a job** CTA still navigates to `/company/jobs/new`.

## States & a11y

- **States.**
  - **Loading** — 3 skeleton rows inside the `.cell`.
  - **Empty (no jobs)** — truthful "No jobs yet" copy + CTA. **Never seeded with fake jobs.**
  - **Empty (filtered to zero)** — chip is selected but no rows match: "No <status> jobs."
  - **Error** — inline `.pill-danger` + Retry; the rest of the page (head + chips) remains
    interactive.
  - **Success** — table renders the filtered rows.
- **Responsive.** Sidebar collapses ≤1000px (design language). Table scrolls horizontally
  inside its `.cell` under ~760px (preserves cell rhythm); chips wrap to multiple rows; head
  CTA wraps below the title at ~390px.
- **Dark + light.** All color via tokens (`.pill-*`, `--ink-*`, `--surface-*`, `--line`) — no
  raw hex. Per-user Appearance accent recolors `.pill-teal` and the primary CTA without code
  changes.
- **A11y.** Semantic `<table>` with `<thead>` / `<tbody>` / `<th scope="col">`. Status pill
  carries the label text (not color-only). Filter chips are real `<button>`s with
  `aria-pressed` and an `aria-label` reflecting the count ("Filter to Published, 4 jobs"). The
  row title is a real `<a>` to `/company/jobs/[id]`. Touch targets ≥44×44. Contrast ≥4.5:1
  (chips selected use `.pill-teal` which already clears AA on `--bg`). Focus rings via
  `:focus-visible` — `--teal` 2px / 4px halo.

## Acceptance

- Looks 1:1 like the per-screen Task 0 HTML AND the relevant slices of
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Side-by-side
  screenshot proof committed under `docs/brand/redesign-v3/verify/jobs-list-{light,dark}.jpeg`.
- `--filter @ip/company build` green; `tsc --noEmit` green; no console errors / warnings.
- **Zero functional diff.** Same `Job.ListJobs` query and key, same `jobStatus()` mapping, same
  Create / View links. `JobsTable` consumes the `ListJobsResponse` field names verbatim — no
  shape change.
- Empty + filtered-empty + error states are truthful — no fabricated job rows.
- A non-manager loading `/company/jobs` is still redirected by `CompanyShell`'s
  `useRequireRole(["recruiter","company_admin"])`.
