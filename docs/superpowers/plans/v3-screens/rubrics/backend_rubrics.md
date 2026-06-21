# Scoring rubrics — Backend contract (v3 · frozen)

> **Screen.** `/company/rubrics` rubric-management workspace. **FE consumer:** [`frontend_rubrics.md`](./frontend_rubrics.md).
> **Status:** **EXISTING — reuse** the admin Aptitude / rubric service. There is **no dedicated
> `../../v2-screens/` doc**; this restates the **already-shipped** RPC surface the page consumes
> today, inferred from the existing `apps/company/components/rubric-manager.tsx`
> (`api.rubrics.listRubrics / createRubric / updateRubric / deleteRubric`) and the generated
> `Rubric` / `Competency` types in `@ip/api-client`. The Aperture Pro v3 redesign is
> **appearance-only** — no proto delta, no new collection, no new endpoint beyond what is already
> shipped.
> **Anti-fiction reminder:** Aptura is pre-launch. The list renders only what `ListRubrics`
> returns; never auto-fill a fake rubric name or "Sample competency" rows. The "Used by" footer
> lists the **real** grading consumers from the static cross-reference, never invented paths. See
> the anti-fiction rule in [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today:** **live.** `api.rubrics.*` is generated and consumed in production on
> `/company/rubrics`. There is **no mock seam** — the page binds directly to the generated client.

## Functionalities

- **List** the company's reusable competency-scoring rubric templates (each: name + weighted
  competencies), to seed the list rail + the editor.
- **Create** a new rubric (name + competencies).
- **Update** an existing rubric in place (by `id`).
- **Delete** a rubric (by `id`).
- A rubric is a **reusable scoring template** referenced by interview / aptitude grading; this
  screen owns its **CRUD**.

## Service & RPCs

`admin` rubric / Aptitude service (gRPC-web). All **bearer-auth, manager-scoped**
(`company_admin` / `recruiter`); `comp_id` derived from the **token, never the request**;
mutations require `id` to belong to the caller's company (cross-tenant `id` → `NOT_FOUND`).
Reuses the existing decision / job / rubric `require_permission`-style guard.

| Function | RPC (FE call) | Status | Auth / scope |
|---|---|---|---|
| List | `api.rubrics.listRubrics({}) → { rubrics: Rubric[] }` | EXISTING (live) | manager + comp-scoped, read-only |
| Create | `api.rubrics.createRubric({ name, competencies }) → Rubric` | EXISTING (live) | manager + comp-scoped |
| Update | `api.rubrics.updateRubric({ id, name, competencies }) → Rubric` | EXISTING (live) | manager + comp-scoped (`id` must belong to caller's `comp_id`) |
| Delete | `api.rubrics.deleteRubric({ id }) → (empty / ack)` | EXISTING (live) | manager + comp-scoped |

## Request / Response structures (camelCase per protobuf-es on the FE)

- **`Rubric`** (the generated type the FE imports from `@ip/api-client`):
  `{ id: string, name: string, competencies: Competency[] }` where **`Competency`** =
  `{ name: string, weight: number }`. The shape is **not extended** by this screen — descriptors
  rendered in the UI's expanded competency rows are a UI-only annotation in local state today and
  are not persisted.
- **`listRubrics({})`** → `{ rubrics: Rubric[] }` (the FE reads `rubrics.data?.rubrics ?? []`;
  comp-scoped server-side).
- **`createRubric({ name: string, competencies: { name: string, weight: number }[] })`** →
  the created `Rubric`. The FE drops unnamed rows and coerces `weight` to `Number` at submit;
  the server re-validates `weight > 0` and `name.length > 0`.
- **`updateRubric({ id: string, name: string, competencies: { name, weight }[] })`** → the
  updated `Rubric` (full replace of name + competencies; the server keys by `id` + scopes by
  `comp_id`).
- **`deleteRubric({ id: string })`** → empty / ack; the FE invalidates `["rubrics"]`.
- **FE mock shape:** **none** — the page binds to the **already-generated** `api.rubrics.*`. No
  mock client to stand up; `Rubric` / `Competency` are already exported from `@ip/api-client`.

## Data required

- **Collection:** the company's rubric templates (one doc per rubric: `comp_id`, `name`,
  `competencies: [{ name, weight }]`), indexed by `comp_id` for the list read and to scope
  mutations by ownership.
- **Validation (boundary):** `name` non-empty; each competency `name` non-empty and `weight` a
  finite number `> 0`. The FE's `weightError` is a courtesy gate — the server is the real guard.
  Owned by the existing rubric resource / repo.
- **Descriptors are not persisted** in the current schema. The UI shows a collapsed
  descriptors `.textarea` per competency as a future-friendly annotation surface, but the value
  stays in local state and is not sent to `Create` / `Update`. Persisting descriptors would
  require a schema extension and is **out of scope** for this redesign.

## Errors & edge cases

- **Empty company (no rubrics yet)** → `{ rubrics: [] }` → the FE shows the truthful empty
  ("No rubrics yet — create your first scoring template") with the **+ New rubric** CTA.
- **Invalid input** (blank name, missing / `<= 0` weight) → `INVALID_ARGUMENT` (the FE blocks
  most of these client-side via `weightError` + the submit guard).
- **Cross-tenant `id`** on update / delete → `NOT_FOUND` (comp-scoped).
- **`UNAVAILABLE` / network** → `toast.error(errorMessage(err))` (existing behavior).
- **Editing a rubric does not retro-actively re-score** in-flight grades; grading consumers
  reference the rubric as it was applied at grading time. The UI does not surface this
  retroactivity (because there is none).
- **No fake placeholder rubrics.** When the list is empty, the editor starts in new-rubric
  mode with two empty competency rows — never auto-filled with "Sample competency" content.

## Cross-references

- No `../../v2-screens/` doc — this is the restated contract for the **existing** admin rubric /
  Aptitude service the page already consumes.
- **Grading consumers** (the "Used by" footer surfaces these as static badges, not via RPC):
  - [`../coding-assessment/backend_coding-assessment.md`](../coding-assessment/backend_coding-assessment.md)
    — the rubric drives coding-assessment grading.
  - [`../proctored-interview/backend_proctored-interview.md`](../proctored-interview/backend_proctored-interview.md)
    — the rubric drives interview competency grading.
  - The applicant report's competency rows ([`../applicant-report/backend_applicant-report.md`](../applicant-report/backend_applicant-report.md))
    render the per-competency results that this rubric drove at grading time.
- Shared shape: `Rubric` / `Competency` (already exported from `@ip/api-client`; not extended).
- Design language: [`../_design-language.md`](../_design-language.md).
- Demo to match: [`../../../brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
