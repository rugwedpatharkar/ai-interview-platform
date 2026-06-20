# Backend — `rubrics` (Midnight v3)

> **Screen:** Scoring rubrics · **FE consumer:** [`frontend_rubrics.md`](./frontend_rubrics.md)
> **Status:** **EXISTING — reuse** the admin Aptitude/rubric service. There is **no dedicated `../v2-screens/` doc**; this restates the **already-shipped** RPC surface the page consumes today, inferred from `frontend/apps/company/components/rubric-manager.tsx` (`api.rubrics.listRubrics/createRubric/updateRubric/deleteRubric`) and the generated `Rubric` type in `@ip/api-client`. **No proto delta, no new collection, no new endpoint** — the Midnight redesign is appearance-only.
> **Real-vs-mock today:** **live.** `api.rubrics.*` is generated and consumed in production on `/company/rubrics`. There is **no mock seam** — the page binds directly to the generated client.

## Functionalities
- **List** the company's reusable competency-scoring rubric templates (each: name + weighted competencies), to seed the editor + the "Your rubrics" list.
- **Create** a new rubric (name + competencies).
- **Update** an existing rubric in place (by `id`).
- **Delete** a rubric (by `id`).
- A rubric is a **reusable scoring template** referenced by interview/aptitude grading; this screen owns its **CRUD**.

## Service & RPCs (`admin` rubric/Aptitude service, gRPC-web — manager + comp-scoped)
| Function | RPC (FE call) | Auth/scope |
|---|---|---|
| List | `api.rubrics.listRubrics({}) → { rubrics: Rubric[] }` | manager (`company_admin`/`recruiter`); `comp_id` from token |
| Create | `api.rubrics.createRubric({ name, competencies }) → Rubric` | manager; `comp_id` from token |
| Update | `api.rubrics.updateRubric({ id, name, competencies }) → Rubric` | manager; comp-scoped (`id` belongs to caller's `comp_id`) |
| Delete | `api.rubrics.deleteRubric({ id }) → (empty / ack)` | manager; comp-scoped |

- **Auth/scope:** bearer; **manager-scoped** and **comp-scoped** — `comp_id` from the **token, never the request**; mutations require `id` to belong to the caller's company (cross-tenant `id` → `NOT_FOUND`). Reuses the existing decision/job/rubric `require_permission`-style guard.

## Request / Response structures (camelCase per protobuf-es on the FE)
- **`Rubric`** (the generated type the FE imports): `{ id: string, name: string, competencies: Competency[] }` where **`Competency`** = `{ name: string, weight: number }`.
- **List:** `listRubrics({})` → `{ rubrics: Rubric[] }` (the FE reads `rubrics.data?.rubrics ?? []`).
- **Create:** `createRubric({ name: string, competencies: { name, weight }[] })` → the created `Rubric`. The FE drops unnamed rows and coerces `weight` to `Number` at submit; the server should re-validate `weight > 0`.
- **Update:** `updateRubric({ id: string, name: string, competencies: { name, weight }[] })` → the updated `Rubric` (full replace of name + competencies).
- **Delete:** `deleteRubric({ id: string })` → empty/ack; the FE invalidates `["rubrics"]`.
- **FE mock shape:** **none** — the page binds to the **already-generated** `api.rubrics.*`. No mock client to stand up; `Rubric` is already exported from `@ip/api-client`.

## Data required
- **Collection:** the company's rubric templates (one doc per rubric: `comp_id`, `name`, `competencies: [{ name, weight }]`), indexed by `comp_id` for the list read and to scope mutations by ownership.
- **Validation (boundary):** `name` non-empty; each competency `name` non-empty and `weight` a finite number `> 0` (the FE's `weightError` is a courtesy gate — the server is the real guard). Owned by the existing rubric resource/repo.

## Errors & edge cases
- Empty company (no rubrics yet) → `{ rubrics: [] }` → the FE shows the `EmptyState` ("No rubrics yet").
- Invalid input (blank name, missing/`<= 0` weight) → `INVALID_ARGUMENT` (the FE blocks most of these client-side via `weightError` + the submit guard).
- Cross-tenant `id` on update/delete → `NOT_FOUND` (comp-scoped). `UNAVAILABLE`/network → `toast.error(errorMessage(err))` (existing behavior).

## Cross-references
- No `../v2-screens/` doc — this is the restated contract for the **existing** admin rubric/Aptitude service the page already consumes.
- **Consumer:** the rubric is a reusable scoring template referenced by aptitude/interview grading — see [`../../v2-screens/coding-assessment.md`](../../v2-screens/coding-assessment.md) and the proctored-interview grading path (shared `Rubric`/`Competency` shape). Editing here changes the template; in-flight gradings reference the rubric as it was applied.
