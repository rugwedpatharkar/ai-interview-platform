# Frontend — `practice` (Midnight v3)

> **Screen:** Practice interview · **Goal:** reskin the candidate practice surface (start a private mock interview → turn loop → past runs) to the **Midnight Intelligence** look. **Appearance-only — zero behavior change.**
> **Unified route + role:** `/practice` · **candidate** (signed-in; `useRequireAuth` + `useRequireRole(["candidate"])`).
> **Mockup:** ✗ — **build `redesign-v2/practice.html` in Task 0**.
> **BE contract:** [`backend_practice.md`](./backend_practice.md) (ai-agents detached practice REST — `start`/`turn`/`sessions`).
> **Existing code it reskins (exact paths):**
> - `frontend/apps/candidate/app/practice/page.tsx` (route shell: start form ↔ runner + history)
> - `frontend/apps/candidate/app/practice/types.ts` (re-exported shared types — **do not change**)
> - `frontend/apps/candidate/components/practice-start-form.tsx` (topic/JD start)
> - `frontend/apps/candidate/components/practice-runner.tsx` (turn loop → finalizing → feedback)
> - `frontend/apps/candidate/lib/practice-client.ts` (`makePracticeClient` — **do not change**)
> - `frontend/apps/candidate/components/candidate-shell.tsx` (the `.app` shell wrapper — already wired, `{ href: "/practice" }` already in `NAV`)

## Layout & components
- **Shell:** `.app` (sidebar + topbar) via the existing `CandidateShell`/`AppShell` — **no shell change**, only the page body is reskinned.
- **Region → `@ip/ui` class map:**
  - Page header → `.page-head` (`h2` Fraunces, `.sub` for the "private to you" framing).
  - Start form card → `.card` with `.card-head`; the topic/JD toggle → `.tabs` (`button[aria-selected]`); inputs → `.input` / textarea styled to `.input`; the "private — never shared" note → `.pill .pill-accent` or an inline note (token colors only).
  - Primary action → `.btn .btn-primary` ("Start practice"); secondary "Start another" → `.btn .btn-ghost`.
  - Runner transcript → existing `role="log"` list reskinned with `.card`/surface tokens (question bubble on `--surface-2`, answer bubble on `--accent-soft`/`--accent-ink`); current question in Fraunces.
  - Finalizing state → `.card.tight` + `.bar`/`Spinner` ("Scoring your practice interview…").
  - Past runs → `.table-wrap`/`table.data` **or** stacked `.card.tight` rows (`.who .nm` = `role_label`, `.who .sub` = `created_at`); each row links to `/feedback/{practice_id}`.
- **New vs reused:** **no new components** — reskin the four existing files. Reuse all `@ip/ui` primitives; swap ad-hoc Tailwind colors → token component classes.

## Data wiring (kept identical to today)
- Client/seam: `practice = makePracticeClient(AIAGENTS_URL, store)` (`lib/practice-client.ts`) via `useMutation`/`useQuery`. **Unchanged.**
- Query keys: `["practice-feedback", practiceId]` (finalizing poll), `["practice-history"]` (past runs). **Unchanged.**
- Fields consumed (from [`backend_practice.md`](./backend_practice.md)): `PracticeStartResult{practice_id, question}`, `PracticeTurn{done, question}`, `PracticeSummaryRow{practice_id, role_label, created_at}`. Markup/classes only change.
- **Detached invariant at the FE surface:** no `comp_id`/`job_id`/`applicationId` passed anywhere — the reskin must not add any employer-visible affordance.

## Tasks (bite-sized; this screen is reskin-only — no new logic, so no TDD beyond build/preview)

### Task 0 — build the mockup `redesign-v2/practice.html` (mockup ✗)
- [ ] Build `docs/brand/redesign-v2/practice.html` against `tokens.css` + `app.css`: the `.app` shell (sidebar + topbar), a `.page-head`, the start-form `.card` (topic/JD `.tabs`, `.input`, the private note, `.btn-primary`), a sample transcript + current-question, and the "Past practice runs" list. Dark-first; light parity.
- [ ] Browser-verify on the `:4173` preview; commit `docs/brand/redesign-v2/practice.html`.

### Task 1 — reskin `practice-start-form.tsx`
- [ ] Wrap in `.card`/`.card-head`; topic/JD toggle → `.tabs`; inputs → `.input`; private note tokenized; `Start practice` → `.btn-primary` (keep `inFlight` latch + exactly-one logic). Build + browser-verify. Commit `frontend/apps/candidate/components/practice-start-form.tsx`.

### Task 2 — reskin `practice-runner.tsx`
- [ ] Reskin the transcript bubbles + current question + finalizing state to surface/accent tokens; keep the `inFlight`/`abortCtrl` refs, `isSessionEnded` 409/410 check, `beforeunload`, `⌘/Ctrl+Enter`, and the feedback handoff **identical**. Build + browser-verify. Commit `frontend/apps/candidate/components/practice-runner.tsx`.

### Task 3 — reskin `app/practice/page.tsx` (shell body + history)
- [ ] Reskin the `.page-head`, the start↔runner swap, and the "Past practice runs" list (`.table-wrap` or `.card.tight` rows) to tokens; keep `useRequireAuth`/`useRequireRole`, the `started` state, and the `["practice-history"]` query identical. Build + browser-verify (dark + light). Commit `frontend/apps/candidate/app/practice/page.tsx`.

## States & a11y
- **Loading** (`LoadingState`/`Spinner` on history + finalizing), **empty** (`EmptyState` — "No practice runs yet"), **error** (`Alert tone="danger"`/`ErrorState` + Retry, input preserved), **success** (transcript advances; row appears in history), **finalizing** (Spinner + `.bar`/`Progress`, 409-poll), **ended** (409/410 → terminal `Alert tone="warning"` + link to start anew, no resume).
- **Detached (load-bearing):** the page renders **no hire/reject verdict, no numeric score, no employer affordance** anywhere; no `comp_id`/`applicationId` reaches the client.
- **Responsive:** start form + runner stack on mobile (`.app` collapses sidebar < 1000px per `app.css`); history rows full-width.
- **Dark + light:** reads `--accent`/base vars only — no hardcoded color; both themes verified.
- **A11y:** transcript `role="log" aria-live="polite"`; current question `role="status" aria-live="polite"`; tab toggle `aria-label`; real `<label>`s; focus rings via `:focus-visible`; contrast ≥4.5:1.

## Acceptance
- Matches `redesign-v2/practice.html`; `--filter @ip/candidate build` + typecheck green; **zero functional diff** (same client, query keys, handlers, request/response); the mock→real path is unchanged; the detached invariant holds at the FE surface.
