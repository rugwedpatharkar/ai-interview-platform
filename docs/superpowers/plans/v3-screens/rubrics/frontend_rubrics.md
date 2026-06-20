# Frontend — `rubrics` (Midnight v3)

> **Screen:** Scoring rubrics · **Goal:** reskin the existing rubric manager to the **Midnight Intelligence** `.app` company shell — a **rubric editor** (name + weighted competency rows) over a **list of saved rubrics** with edit/delete — **reusing every handler/query verbatim** (presentational only, zero behavior change).
> **Unified route + role:** `/company/rubrics` · company (`company_admin`/`recruiter`, manager-scoped). Mounted under the `.app` shell at `/company/*`.
> **Mockup:** ✗ → **build in Task 0** as `docs/brand/redesign-v2/rubrics.html` (an editor `.card` — name `Field` + competency rows (name `.input` + weight `.input` + remove `.btn-ghost` + "Add competency") + Create/Save `.btn-primary` — over a list of saved-rubric `.card`s with Edit/Delete).
> **Existing code it reskins:**
> - `frontend/apps/company/app/rubrics/page.tsx` (the shell wrapper: `CompanyShell` + `PageHeader` + `<RubricManager/>`)
> - `frontend/apps/company/components/rubric-manager.tsx` (the editor + list: `useAuthedQuery(["rubrics"])` → `save`/`remove` `useMutation`s → `api.rubrics.createRubric/updateRubric/deleteRubric`; the `CompRow` weight-validation state)
> - `frontend/apps/company/components/company-shell.tsx` (the `.app` shell + `Rubrics` nav entry — reskinned to Midnight)

## Layout & components
- **Shell:** the `.app` **sidebar + topbar** shell (`CompanyShell`). `Rubrics` is the active `.navitem`. `.page-head` carries "Rubrics" + sub "Reusable competency sets for interview scoring."
- **Editor card:** a `.card` (titled "New rubric" / "Edit rubric") — a name `Field`+`Input` (`.input`), then the **Competencies** section: per `CompRow`, a name `Input` + a numeric weight `Input` (`.input`, `w-24`) + a remove `.btn-ghost .btn-sm` (icon, disabled when one row left), plus an "Add competency" `.btn-ghost .btn-sm`. Footer: Create/Save `.btn-primary` (+ a Cancel `.btn-ghost` in edit mode).
- **Saved-rubrics list:** a section "Your rubrics" of `.card` rows — each shows the rubric name (`--font-display`) + a comma-joined competency summary (`.who .sub`) + Edit (`.btn-ghost .btn-sm`) + Delete (`ConfirmDialog` trigger `.btn-ghost .btn-sm`).
- **New vs reused:** **no new components** — `CompanyShell`, `RubricManager`, `Card*`, `Field`, `Input`, `Button`, `ConfirmDialog`, `EmptyState`, `ErrorState`, `LoadingState`, `PageHeader`, `toast` all reused; only token classes/markup change. lucide icons (`Plus`, `Trash2`) stay imported **in the app**.

## Data wiring (kept identical to today)
- **Client/seam:** `useAuth().api.rubrics.*` — **already generated and live** (no mock seam). The editor maps `CompRow[]` (raw `weight` strings) → `{ name, weight: Number(weight) }[]` at submit, dropping unnamed rows.
- **TanStack query key:** `["rubrics"]` (seed the list; invalidated after `save`/`remove`).
- **Consumes** (`backend_rubrics.md`): `listRubrics({})` → `{ rubrics: Rubric[] }` (`Rubric = { id, name, competencies: { name, weight }[] }`); `createRubric({ name, competencies })`; `updateRubric({ id, name, competencies })`; `deleteRubric({ id })`. **No field added or removed.**

## Tasks (bite-sized; presentational only)
- [ ] **Task 0 — build the mockup.** Create `docs/brand/redesign-v2/rubrics.html` against `tokens.css` + `app.css`: the `.app` shell with `Rubrics` active, a `.page-head`, an editor `.card` (name field + 2 competency rows with weight inputs + Add/Create buttons), and a "Your rubrics" list of saved-rubric `.card`s (name + competency summary + Edit/Delete). Browser-verify on the `:4173` preview (dark **and** light). Commit `docs/brand/redesign-v2/rubrics.html`.
- [ ] **Task 1 — reskin the editor card.** In `rubric-manager.tsx`, keep the `useAuthedQuery(["rubrics"])`, the `name`/`rows`/`editingId`/`showErrors` state, `weightError`, `loadForEdit`, `reset`, and the `save` mutation (`createRubric`/`updateRubric` branch) **verbatim**; swap ad-hoc classes (`text-foreground`, `text-danger`, etc.) → token component classes (`.card`/`.input`/`.btn-*`) to match the mockup. Build + browser-verify `/company/rubrics` (add/remove rows, weight validation, Create/Save); commit explicit path.
- [ ] **Task 2 — reskin the saved-rubrics list.** Swap the list `Card`/`Button`/`ConfirmDialog` classes to match the mockup. Keep the `list = rubrics.data?.rubrics ?? []` mapping, the loading/error/empty branches, `loadForEdit`, and the `remove` mutation **verbatim**. Build + browser-verify (Edit loads into the editor; Delete confirms + removes); commit.

> **Restyle discipline:** the diff per file is markup/classes only. If a task touches a mutation, the `weightError` logic, the `CompRow`→competency mapping, or an RPC call — **stop**, it's out of scope.

## States & a11y
- **States (preserved, named):** **loading** (`LoadingState` on `["rubrics"]`); **error** (`ErrorState` + retry); **empty** (`EmptyState` "No rubrics yet" when the list is empty); **validation** (`showErrors` → name-required + per-row weight errors, the submit guard blocks); **save/delete** pending (button/`ConfirmDialog` spinner) / **success** (toast + `["rubrics"]` invalidation + editor `reset`).
- **Responsive:** the editor competency rows are a flex row (name flexes, weight `w-24`, remove icon); the saved-rubric cards are `sm:flex-row` (stack at ~375px).
- **Dark + light:** all tokens (`.card`/`.input`/`.btn-*`/`--ink`/`--accent`) — auto-themes.
- **A11y:** the name field is a labelled `Field` with `aria-invalid`; weight inputs carry `aria-label="Weight"` + `aria-invalid`; the remove button has `aria-label="Remove competency"`; Delete uses `ConfirmDialog`; per-row weight errors render as text; focus ring `--accent-strong`; contrast ≥4.5:1.

## Acceptance
- Matches `rubrics.html`; build/typecheck green; **zero functional diff** (list/create/update/delete + the weight-validation gate + the `CompRow`→competency mapping are identical to today); the page binds to the **already-live** `api.rubrics.*` (no mock seam to flip).
