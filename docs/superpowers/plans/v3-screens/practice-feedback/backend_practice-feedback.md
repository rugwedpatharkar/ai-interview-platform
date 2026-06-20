# Backend — `practice-feedback` (Midnight v3)

> **Screen:** Practice growth feedback (read-only) · **FE consumer:** [`frontend_practice-feedback.md`](./frontend_practice-feedback.md)
> **Status:** **EXISTING — reuse the detached practice REST.** Restated from [`../../v2-screens/practice-feedback.md`](../../v2-screens/practice-feedback.md) §A. **No new endpoint, no proto delta, no new collection.** Appearance-only redesign — the page consumes the same `GET /practice/{id}/feedback` it ships today.
> **Real-vs-mock today:** ai-agents practice REST behind the injected-LLM seam; the FE binds to `makePracticeClient` and can build against `NEXT_PUBLIC_MOCK` until live. The reskin changes **markup/classes only**.

## Functionalities
- **Read-only** growth feedback for **one past practice run** (the `[id]` route param is a `practice_id`, owner-scoped).
- Render **strengths / gaps / suggested topics** + the evaluation summary. **No hire/reject verdict, no numeric score, no `recommendation`** — the server strips it; the render layer is the visual guarantee.
- Handle the **still-finalizing** race (`409` immediately after a run completes): treat as "still scoring", poll until the summary lands.
- **Detached invariant:** `practice_id`-keyed, owner-scoped, **never employer-visible**; carries no `comp_id`/`applicationId`. This is **practice** feedback — distinct from the separate terminal-state-gated `GET /application/{id}/feedback` (not this screen; do not route through `makePracticeClient`).

## Service & RPCs (ai-agents FastAPI REST; bearer = candidate token)
| Function | Endpoint | Auth/scope |
|---|---|---|
| Read practice feedback | `GET /practice/{practice_id}/feedback` → `{evaluation_summary, feedback}` | bearer; owner (`403` reading another's run); `409` while in progress |

FE client: `practice.feedback(practiceId, signal?)` (`frontend/apps/candidate/lib/practice-client.ts`).

## Request / Response structures
```ts
export interface GrowthFeedbackView {
  summary: string;
  strengths: string[];
  gaps: string[];
  suggested_topics: string[];   // NO recommendation/score field — model + render both strip it
}
export interface PracticeFeedbackResult { evaluation_summary: string; feedback: GrowthFeedbackView; }
```
- **`feedback`** — load the completed `PracticeSummary` via `data.get_practice_summary(user_id, practice_id)`; `409` if still in progress (UI polls), `404` missing, `403` not owner.
- **FE mock shape:** `PracticeFeedbackResult` / `GrowthFeedbackView` (`frontend/apps/candidate/app/practice/types.ts`) — identical to today; the reskin does not touch them.

## Data required
- Reads `practice_sessions` (the finalized `PracticeSummary` for `(user_id, practice_id)`). Owned by `resources/practice.py::_finalize` + `feedback_writer.py` (`build_feedback` → `GrowthFeedback`, bands `_STRENGTH_BAND=0.70`/`_GAP_BAND=0.50`). **Unchanged** by this redesign.

## Errors & edge cases
- `409` (finalizing) → "still scoring" card + auto-poll (`retry` on `409`, `n < 12`, `refetchUntil` 2500ms) — existing behavior, preserved.
- `404`/`403` → `ErrorState` (not found / not yours).
- `UNAVAILABLE`/network → `ErrorState` + Retry.
- The growth panel renders **no verdict / no score** — load-bearing; the reskin keeps that guarantee (no score ring, no pass/fail pill).

## Cross-references
- Shared contract: [`../../v2-screens/practice-feedback.md`](../../v2-screens/practice-feedback.md) §A (feedback shape, the never-mid-funnel rule, the detached invariant).
- Sibling page reusing the same client: [`practice`](../practice/backend_practice.md) (`start`/`turn`/`sessions`).
- Never-mid-funnel: the real-application feedback surface (`GET /application/{id}/feedback`, terminal-only) is a **separate** page on the comp-scoped client — not this one.
