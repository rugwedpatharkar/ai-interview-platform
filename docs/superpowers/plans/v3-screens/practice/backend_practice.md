# Practice interview — Backend contract (v3 · frozen)

> **Screen.** Practice interview (`/practice`). **FE consumer:** [`frontend_practice.md`](./frontend_practice.md).
> **Status:** `EXISTING — reuse the detached practice REST.` Restated from [`../../v2-screens/practice-feedback.md`](../../v2-screens/practice-feedback.md) §A (ai-agents practice REST). **No new endpoint, no proto delta, no new collection.** The v3 Aperture Pro redesign is appearance-only; this page consumes the same `makePracticeClient` (ai-agents FastAPI) it ships today.
> **Anti-fiction reminder.** Aptura is pre-launch. Practice is **private to the candidate** and never produces a verdict against them — this contract documents only what the UI consumes today; no claimed integrations, no fabricated benchmark scores, and no employer-visible artifacts. The detached invariant below is an **architectural truth** the product enforces (no `comp_id` / `applicationId` in any signature, no funnel emit) — preserve it.
> **Real-vs-mock today.** The practice endpoints are the **detached mock-interview turn loop** on ai-agents behind the injected-LLM seam; the FE binds to `makePracticeClient(AIAGENTS_URL, store)` and can build against `NEXT_PUBLIC_MOCK` until the endpoints are live. The rebuild changes markup/classes only — the client, query keys, and request/response shapes are untouched.

## Functionalities

- **Start** a private mock interview from a `topic` **xor** a pasted `jd_text` (exactly one — server-authoritative).
- **Submit a turn** (the candidate's answer) and receive the next question or `done: true`.
- **List** the caller's past practice runs (owner-scoped history) for the "Past practice runs" section.
- **Detached invariant.** Practice carries **no `comp_id` / `job_id` / `applicationId`** in any signature; it never emits a funnel event; it is **never shown to employers**. The rebuild must not surface any employer-visible affordance.

## Service & RPCs (ai-agents FastAPI REST; bearer = candidate token, `_caller_user_id`)

| Function | Endpoint | Auth/scope |
|---|---|---|
| Start practice | `POST /practice/start` `{topic?, jd_text?}` → `{practice_id, question}` | bearer; owner (no `comp_id`); exactly-one — `400` if neither / both blank |
| Submit turn | `POST /practice/{practice_id}/turn` `{answer}` → `{done, question}` | bearer; owner (`403` driving another's session); `404` missing; `409` if `status != in_progress` |
| List history | `GET /practice/sessions` → `{sessions: [{practice_id, role_label, created_at}]}` | bearer; **owner-scoped** (never a client param) |
| Read feedback | `GET /practice/{practice_id}/feedback` → `{evaluation_summary, feedback}` | bearer; owner (consumed by [`practice-feedback`](../practice-feedback/backend_practice-feedback.md), not this page) |

FE client: `practice = makePracticeClient(AIAGENTS_URL, store)` in `frontend/apps/candidate/lib/practice-client.ts` — methods `start` / `turn` / `feedback` / `list`.

## Request / Response structures (camelCase on the FE where applicable; REST uses snake_case bodies)

```ts
export interface PracticeStartResult { practice_id: string; question: string; }   // POST /practice/start
export interface PracticeTurn        { done: boolean; question: string; }          // POST /practice/{id}/turn — "" question when done
export interface PracticeSummaryRow  { practice_id: string; role_label: string; created_at: string; }  // GET /practice/sessions
export interface StartArgs           { topic?: string; jd_text?: string; }         // exactly one — server-authoritative
```

- **`start`** — send **only** the active field (`topic` xor `jd_text`); server `400` if neither / both blank.
- **`turn`** — `{answer}`; `404` missing, `403` not owner, `409` if `status != in_progress` (terminal → FE shows "session ended").
- **`list`** — owner-scoped projection (no transcript, no evaluation); empty → FE empty-state cell.
- **FE mock shape:** the four interfaces above (`frontend/apps/candidate/app/practice/types.ts`) — identical to today; the rebuild does not touch them.

## Data required

- `practice_sessions` collection **keyed by `user_id`** (never `comp_id`); indexes `(user_id)` (history + erasure cascade) and `(user_id, practice_id)`. Owned by the existing `resources/practice.py` (no `publisher` in signature) + mcp-data tools. **Unchanged** by this redesign.

## Errors & edge cases

- `400` exactly-one violation → start form inline warn-tone `.cell` alert (UI guard is a second layer; the server boundary stays authoritative).
- `404` / `403` / `409` on `turn` → terminal "session ended" `.cell` (no resume).
- `UNAVAILABLE` / network on start or list → warn-tone `.cell` + Retry, input preserved.

## Cross-references

- Shared contract: [`../../v2-screens/practice-feedback.md`](../../v2-screens/practice-feedback.md) §A (all practice REST, the detached invariant, the feedback shape).
- Sibling page reusing the same client: [`practice-feedback`](../practice-feedback/backend_practice-feedback.md) (`GET /practice/{id}/feedback`).
- Detached invariant (test-locked upstream): no `publisher` in `practice.py` → no funnel event is emittable from practice.
- Design language: [`../_design-language.md`](../_design-language.md) — `.hud` primitive is shared with the proctored interview, but the practice surface deliberately differs (no proctoring chips, no auto-end, no score).
