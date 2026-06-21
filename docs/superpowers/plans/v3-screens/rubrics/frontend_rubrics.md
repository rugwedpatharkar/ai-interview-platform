# Scoring rubrics — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Rebuild the rubrics-management surface at `/company/rubrics` from scratch in the Aperture Pro
design language. The page is the manager's scoring-template workspace: a **left rail list of
saved rubrics** (each name + competency summary + edit / delete), and a **right-side rubric
editor** that opens with a chosen rubric (or in "new rubric" mode by default). The editor's
competency rows reuse the design language's `.bar`-style row primitive — each row carries a name
`.input`, a weight `.input` (numeric), an optional descriptors `.textarea` (free-text scoring
guide for graders), and a live weight-share indicator built from the same `.bar > .t > i` token
the funnel uses, so recruiters instantly see how a competency's weight compares to the others in
the rubric. The backend stays frozen — every existing `api.rubrics.*` RPC is reused verbatim,
only the UI is new.

The screen makes the rubric's purpose visible: a `.cell.tight` "Used by" footer under the editor
lists the interview/aptitude grading paths the rubric feeds — these are the **same in-flight
grading consumers** documented in the rubric backend. Editing a rubric does not retro-actively
re-score in-flight grades (they reference the rubric as it was applied at grading time).

## Route + role

`/company/rubrics` (`apps/company/app/rubrics/page.tsx`) · **company** — guarded by
`useRequireRole(["recruiter", "company_admin"])` (enforced inside `CompanyShell`; do not
re-implement). Non-managers are redirected by the shell before this page renders.

## Approved mockup (build to this exactly)

- **Live demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — the `.app` company shell, `.cell` bento, `.bars + .bar > .t > i` row primitive, `.input` /
  `.textarea` form tokens, `.btn-primary` / `.btn-ghost` buttons, `.pill` / `.badge` chips, mono
  `.tag` micro-labels.
- **Screenshots:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.

There is no per-screen mockup yet — the design-language demo IS the reference. Task 0 below
captures the screen-specific composition (left rail list + right editor with `.bar`-style
competency rows) as a standalone HTML preview; the React build mirrors it 1:1.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope:

- `frontend/apps/company/app/rubrics/page.tsx` — page body (shell wrapper + `<RubricManager />`)
- `frontend/apps/company/components/rubric-manager.tsx` — editor + list composition
- Any local rendering helpers under `apps/company/app/rubrics/` that emit the v2/Midnight markup

What is **NOT** touched: `apps/company/components/company-shell.tsx` (the `.app` shell + role
gate), the in-tree `Rubric` / `Competency` types exported from `@ip/api-client`, the
already-generated `api.rubrics.*` bindings, or any `*.proto`. The `Rubric` shape is **not
extended** by this screen (descriptors are a UI-only annotation rendered from local state during
edit; they are not persisted today — see the descriptors note in the backend contract).

## Section spine — 4 regions, in order

Build each as its own component under `frontend/apps/company/components/rubrics/`.

| # | Region | Component | Notes |
|---|---|---|---|
| 0 | App shell | `<CompanyShell>` (existing) | `.app` sidebar + topbar. Sidebar **Rubrics** entry carries `aria-current="page"`. Topbar crumb = `<Company> / Rubrics`. |
| 1 | Page head | `<RubricsHead />` | h1.display "Scoring rubrics" + `.sub` ("Reusable competency sets that feed interview and aptitude grading."). Trailing **+ New rubric** `.btn.btn-primary` (resets the editor to a fresh template). |
| 2 | Rubrics list (left rail) | `<RubricsList />` | Left column (`span 4` ≥1100px, full width ≤760px). One `.cell.tight` titled "Your rubrics" + a `.tag` mono ("LAST EDITED"). Each rubric is a `.match > .card` row: avatar slot is replaced with a small `.ring` showing the **competency count** (e.g., "5") + name (Schibsted 600) + `.sub` (comma-joined competency summary, truncated to 80 chars) + a trailing **Edit** `.btn.btn-ghost.btn-sm`. Active row is highlighted via `--surface-2`. Below the list, a Delete affordance uses the row's overflow menu (kebab) opening a `ConfirmDialog`. |
| 3 | Editor (right) | `<RubricEditor />` | Right column (`span 8` ≥1100px, full width ≤760px). One `.cell` containing: a `.tag` mono ("NEW RUBRIC" or "EDITING · <name>"), a Schibsted h3 ("Untitled rubric" / current name), a name `.input` (large, `--step-1`), then the **Competencies** section: a stacked `.bars` group of `<CompetencyRow />`s. Footer: **Save** `.btn.btn-primary` (Create when new, Update when editing) + **Cancel** `.btn.btn-ghost` (visible in edit mode only). Below the editor, a `.cell.tight` "Used by" footer lists the grading paths this rubric feeds (Coding assessment · Proctored interview · Aptitude grading) sourced from the static cross-reference list — not from an RPC. |

`<CompetencyRow />` is the editor's primitive — a `.bar`-styled row carrying:
- a name `.input` (flex, `--step-0`),
- a numeric weight `.input` (`w-24`, `inputmode="decimal"`, `min="0.01"`, `step="0.01"`),
- a descriptors `.textarea` (collapsed by default; "Add scoring guide" `.btn-ghost.btn-sm` chip
  expands it — descriptors are a UI-only annotation in local state today, not persisted),
- a live **share-of-total** indicator: `.t > i` track filled to
  `weight / sum(weights) * 100%` using `--teal`, with a mono `.tnum` showing the percentage —
  recruiters see at a glance that "Communication" carries 25% vs "Problem solving" at 40%,
- a Remove `.btn.btn-ghost.btn-sm` (icon-only, `aria-label="Remove <name>"`, disabled when only
  one row remains).

A footer **+ Add competency** `.btn.btn-ghost.btn-sm` appends a new empty row.

## Layout & components — map to `@ip/ui` and tokens

Pull every primitive from `@ip/ui` per [`_design-language.md`](../_design-language.md).

| Region | Primitive (in `@ip/ui`) | Tokens |
|---|---|---|
| Shell | `CompanyShell` (existing) | already on the new tokens via the design-language Task 1 |
| Page head | `h1.display` + `.sub` + `.btn.btn-primary` | typography + button tokens |
| List card | `.cell.tight` + `.tag` mono | `--surface`, `--line`; active row `--surface-2` |
| List row | `.match > .card` + small `.ring` (competency count) | teal ring fill; row hover `--surface-2` |
| Editor card | `.cell` + `.tag` mono + `h3` | `--surface`, `--line` |
| Name input | `.input` (`--step-1` size) | `--surface`, `--line`; focus `--teal` 2px halo |
| Competency row | `.bars + .bar > .name + .v + .t > i` | rail `--surface-3`, fill `--teal`; `.v` mono `--ink-deep` |
| Descriptors | `.textarea` (collapsed; expanded inline) | `--surface`, `--line` |
| Add / Remove chip | `.btn.btn-ghost.btn-sm` | 32px height, 8px radius |
| Used-by footer | `.cell.tight` + `.badge` cloud | `--surface-2`, `--ink-2`, `--line-2` |
| Confirm dialog | `Dialog` from `@ip/ui` | `--surface`, `--line`; backdrop = `color-mix(in oklch, var(--ink-deep) 60%, transparent)` |

All new primitives live in `@ip/ui/src/app.css` (one shared file). No new tokens — everything
resolves through the resolved accent (`--teal`) and the resolved base palette. **No side-stripe
borders** on rows; use full borders + the `.match > .card` token. **No chart library** — the
weight-share indicator is the existing `.bar / .bar > i` token.

## Data wiring / seam

**Every existing query and handler is preserved verbatim. Nothing new.**

| Region | Hook | Query key | Source |
|---|---|---|---|
| List | `useAuthedQuery(token, …, () => api.rubrics.listRubrics({}))` → `data.rubrics: Rubric[]` (the FE reads `rubrics.data?.rubrics ?? []`) | `["rubrics"]` | `Rubrics.ListRubrics` (live today) |
| Create | `useMutation((p) => api.rubrics.createRubric({ name: p.name, competencies: p.competencies }))` → on success: `qc.invalidateQueries(["rubrics"])` + `toast.success("Rubric created")` + select the new row | n/a | `Rubrics.CreateRubric` |
| Update | `useMutation((p) => api.rubrics.updateRubric({ id: p.id, name: p.name, competencies: p.competencies }))` → invalidate + `toast.success("Rubric updated")` | n/a | `Rubrics.UpdateRubric` |
| Delete | `useMutation((id) => api.rubrics.deleteRubric({ id }))` (behind `ConfirmDialog`) → invalidate + `toast.success("Rubric deleted")` + reset the editor if the deleted rubric was open | n/a | `Rubrics.DeleteRubric` |
| Editor state | local `editingId: string \| null`, `name: string`, `rows: CompRow[]` where `CompRow = { name: string, weight: string /*raw input*/, descriptors?: string }`. `loadForEdit(rubric)` seeds the editor; `reset()` clears it; `submit()` maps `rows → { name, weight: Number(weight) }[]` (dropping unnamed rows), and dispatches Create or Update based on `editingId`. | n/a | derived |

**Validation gate (FE courtesy, server is the real guard).** Submit is blocked when:
- the rubric name is empty (`name.trim().length === 0`),
- any non-empty-name row has a missing / non-positive weight
  (`!Number.isFinite(Number(weight)) || Number(weight) <= 0`),
- all rows are empty (no competencies after the unnamed-row drop).

`weightError(row)` powers the inline per-row `.sub` error text and the `aria-invalid` flag.

**Anti-fiction guard.** The list's empty state ("No rubrics yet — create your first scoring
template") is truthful. The "Used by" footer lists the **real** grading paths from the static
cross-reference list, never invented consumers. The editor's competency rows never auto-fill
with fake "Sample competency" entries — a new rubric starts with two empty rows ready for input.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Build the per-screen mockup.** Create
> `docs/brand/redesign-v3/screens/rubrics.html` linking `@ip/ui/src/{tokens.css,app.css}` and
> the SVG sprite. Embed the `.app` shell verbatim from the design language; build the 4+8 (list
> + editor) composition with 3 sample rubrics in the list (clearly labelled "Sample") and the
> editor showing one in edit mode with 4 `.bar`-styled competency rows. Verify in both themes at
> 1440×900 and 390×844 against `D-aperture-pro-{light,dark}-full.jpeg`. Commit the new HTML file
> only.

- **Task 1 — Shell + page head + list rail.** Mount the page under `CompanyShell`; render
  `<RubricsHead />` (with the **+ New rubric** trigger that resets the editor) and
  `<RubricsList />` against `["rubrics"]`. Each list row is a `.match > .card` with the
  competency-count `.ring`, name, summary, and Edit chip. Preserve `LoadingState` + truthful
  empty ("No rubrics yet") + `ErrorState` + retry. Verify the list collapses cleanly on mobile.
  Commit `apps/company/app/rubrics/page.tsx`,
  `apps/company/components/rubrics/{rubrics-head.tsx,rubrics-list.tsx}`.

- **Task 2 — Editor scaffolding.** Build `<RubricEditor />` reading the editor's local state
  (`editingId`, `name`, `rows`). Render the editor `.cell` with the `.tag` mono + h3 + name
  `.input` + an empty `.bars` group (ready for `<CompetencyRow />`s) + Save / Cancel footer.
  Wire the New / Edit flow so picking a list row seeds `loadForEdit(rubric)` and the **+ New
  rubric** CTA calls `reset()`. Commit `apps/company/components/rubrics/rubric-editor.tsx`.

- **Task 3 — Competency rows.** Build `<CompetencyRow />` as the `.bar`-styled row primitive
  (name input + weight input + collapsed descriptors textarea + live `.t > i` share-of-total
  indicator + Remove chip). Wire the **+ Add competency** button to append a new empty row.
  Implement `weightError(row)` + the inline per-row error text + `aria-invalid` flag. The
  share-of-total indicator recomputes on every keystroke. Verify add / remove (Remove disabled
  on the last row), weight validation, and that the indicator stays accurate as weights change.
  Commit `apps/company/components/rubrics/competency-row.tsx`.

- **Task 4 — Save + delete + used-by footer.** Wire the Save button to the existing `save`
  mutation (Create when `editingId === null`, Update otherwise). On success: invalidate
  `["rubrics"]`, toast, and select the saved row. Wire Delete (from the list row's overflow) to
  the `remove` mutation behind a `ConfirmDialog`; reset the editor if the deleted rubric was
  open. Build the static **Used by** `.cell.tight` footer listing the grading paths (Coding
  assessment · Proctored interview · Aptitude grading) as `.badge` chips. Verify a Create + an
  Update + a Delete round-trip; verify the footer renders the static list. Commit the wiring
  inside the editor + the new footer component.

- **Task 5 — Page assembly + fidelity verify.**
  1. `apps/company/app/rubrics/page.tsx` mounts `<Rubrics />` inside `<CompanyShell>`.
  2. `--filter @ip/company build` + `--filter @ip/company exec tsc --noEmit` are green.
  3. Boot the dev server, sign in as a recruiter, screenshot `/company/rubrics` in both themes
     at 1440×900 and 390×844 against the Task-0 HTML and the design-language reference. Iterate
     any divergence until 1:1. Commit verify shots under
     `docs/brand/redesign-v3/verify/rubrics-{light,dark}.jpeg`.
  4. Confirm a non-manager is still redirected by `CompanyShell` — the role gate is unchanged.
  5. Confirm the page binds to the **already-live** `api.rubrics.*` (no mock seam to flip); the
     `CompRow → { name, weight: Number(weight) }[]` mapping at submit is preserved verbatim;
     descriptors are local-state-only (not persisted today).

## States & a11y

- **States.** Each region behaves independently:
  - **Loading** — list renders skeleton rows (3 placeholder `.match > .card` rows with shimmer);
    editor renders an empty scaffold ready for input.
  - **Empty** — list shows truthful "No rubrics yet — create your first scoring template" with
    the **+ New rubric** CTA; the editor starts in new-rubric mode by default.
  - **Error** — list renders `ErrorState` + retry; mutation errors → `toast.error(errorMessage)`.
  - **Validation** — submit is blocked on empty name / invalid weight / no competencies;
    per-row errors render inline as `.sub` text with `aria-invalid`.
  - **Save / delete pending** — button shows an inline spinner; `ConfirmDialog` shows a pending
    state for delete.
  - **Save / delete success** — `toast.success` + `["rubrics"]` invalidation + editor `reset()`
    (delete) or row-select (save).
- **Responsive.** Sidebar collapses ≤1000px per the design language. List + editor 4+8
  ≥1100px → stacked (list first, then editor) at the mid breakpoint → full-bleed ≤760px. The
  competency rows wrap to two-line layout (name on top, weight + remove below) ≤760px.
- **Dark + light.** All color via tokens; the competency-count `.ring`, weight-share `.bar`
  fills, focus rings, and confirm-dialog backdrop resolve cleanly in both themes and inherit
  per-user Appearance accent overrides.
- **A11y.** One `<h1>` per page (the head). `<main>` + `<aside>` (list) + `<section>` (editor)
  landmarks. The name field is in a labelled `Field` with `aria-invalid`. Weight inputs carry
  `aria-label="Weight"` + `aria-invalid` + `inputmode="decimal"`. Each row's weight-share `.bar`
  carries an `aria-label="<name> · <pct>% of total weight"`. The Remove button has an
  `aria-label="Remove <competency name>"`. Delete uses `ConfirmDialog` (focus-trapped,
  ESC-to-close). Touch targets ≥44×44. Contrast ≥4.5:1 body (`--ink-2` on `--bg`). Focus rings:
  `:focus-visible` uses `--teal` 2px / 4px halo.

## Acceptance

- Looks 1:1 like the per-screen Task 0 HTML AND the relevant slices of
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Side-by-side
  screenshot proof committed under
  `docs/brand/redesign-v3/verify/rubrics-{light,dark}.jpeg`.
- `--filter @ip/company build` is green; `tsc --noEmit` is green; no console errors / warnings.
- **Zero functional diff.** Same `api.rubrics.*` calls (live; no mock seam to flip), same
  `["rubrics"]` query key, same `CompRow → { name, weight: Number(weight) }[]` mapping at
  submit, same unnamed-row drop, same `weightError` validation gate. The `Rubric` /
  `Competency` shape from `@ip/api-client` is unchanged — descriptors are local-state-only
  (not persisted).
- The list and editor each have their own loading / empty / error states; the page never blocks
  on one query.
- Empty states are truthful — no fabricated rubric names, no auto-filled "Sample competency"
  rows. The "Used by" footer lists the real grading consumers from the static cross-reference,
  never invented paths.
- Per-user Appearance flows through: switching `accent=coral` recolors `--teal`, the
  competency-count `.ring`, weight-share fills, and focus rings without a code change.
- A non-manager loading `/company/rubrics` is still redirected by `CompanyShell`'s
  `useRequireRole(["recruiter","company_admin"])`.
