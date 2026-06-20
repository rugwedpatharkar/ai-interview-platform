# Frontend — `practice-feedback` (Midnight v3)

> **Screen:** Practice growth feedback (read-only) · **Goal:** reskin the read-only growth-feedback panel for a past practice run to the **Midnight Intelligence** look. **Appearance-only — zero behavior change.**
> **Unified route + role:** `/feedback/[id]` (the `[id]` is a `practice_id`) · **candidate** (`useRequireAuth` + `useRequireRole(["candidate"])`).
> **Mockup:** ✗ — **build `redesign-v2/practice-feedback.html` in Task 0**.
> **BE contract:** [`backend_practice-feedback.md`](./backend_practice-feedback.md) (`GET /practice/{id}/feedback` — read-only growth feedback).
> **Existing code it reskins (exact paths):**
> - `frontend/apps/candidate/app/feedback/[id]/page.tsx` (route shell + finalizing poll)
> - `frontend/apps/candidate/components/growth-feedback-panel.tsx` (strengths / gaps / suggested topics — **no verdict**)
> - `frontend/apps/candidate/lib/practice-client.ts` (`practice.feedback` — **do not change**)
> - `frontend/apps/candidate/components/candidate-shell.tsx` (the `.app` shell wrapper — unchanged)

## Layout & components
- **Shell:** `.app` (sidebar + topbar) via the existing `CandidateShell` — **no shell change**; reskin the page body only.
- **Region → `@ip/ui` class map:**
  - Page header → `.page-head` ("Practice feedback", `.sub` private framing).
  - Summary card → `.card` (`h3` Fraunces; the `summary` + muted `evaluation_summary` in `--ink-2`).
  - Strengths / gaps pair → two `.card`s in a `sm:grid-cols-2`; strengths headed with a good-tone accent (`.pill .pill-good` / token), gaps with a neutral/accent tone (`.pill .pill-accent`); list items are semantic `<ul>/<li>` with token text.
  - Suggested topics → `.card` with `.pill .pill-neutral`/`.badge` chips.
  - Footer links ("Practice again" / "Back to dashboard") → `.btn .btn-ghost` / text links, token colors.
- **New vs reused:** **no new components** — reskin the two existing files; reuse `@ip/ui` primitives.

## Data wiring (kept identical to today)
- Client/seam: `practice.feedback(id, signal?)` via `useQuery`. **Unchanged.**
- Query key: `["practice-feedback", id]`; `retry` on `409` (`n < 12`), `refetchUntil((d)=>d!==undefined, 2500)`. **Unchanged.**
- Fields consumed: `PracticeFeedbackResult{evaluation_summary, feedback}` where `feedback = GrowthFeedbackView{summary, strengths[], gaps[], suggested_topics[]}`. Markup/classes only change.
- **No verdict (load-bearing):** **no hire/reject/pass-fail, no numeric score, no `recommendation`, no score ring** — the visual guarantee matching the server-stripped shape. The reskin must NOT add a score ring or pass/fail pill.

## Tasks (reskin-only — no new logic)

### Task 0 — build the mockup `redesign-v2/practice-feedback.html` (mockup ✗)
- [ ] Build `docs/brand/redesign-v2/practice-feedback.html` against `tokens.css` + `app.css`: the `.app` shell, a `.page-head`, a summary `.card`, the strengths/gaps `sm:grid-cols-2` pair, a suggested-topics chip `.card`, footer links — and **explicitly no score/verdict element**. Dark-first; light parity.
- [ ] Browser-verify on the `:4173` preview; commit `docs/brand/redesign-v2/practice-feedback.html`.

### Task 1 — reskin `growth-feedback-panel.tsx`
- [ ] Wrap the summary / strengths / gaps / topics in `.card`s + token classes; chips → `.pill`/`.badge`; keep the props (`result: PracticeFeedbackResult`) and the **no-verdict** render identical (no score/recommendation added). Lucide icons stay imported in-file. Build + browser-verify. Commit `frontend/apps/candidate/components/growth-feedback-panel.tsx`.

### Task 2 — reskin `app/feedback/[id]/page.tsx`
- [ ] Reskin the `.page-head` + the loading/finalizing/error wrappers to tokens; keep `useRequireAuth`/`useRequireRole`, the `useParams` `practice_id` read, and the 409-poll query **identical**. Build + browser-verify (dark + light). Commit `frontend/apps/candidate/app/feedback/[id]/page.tsx`.

## States & a11y
- **Loading** (`LoadingState`), **finalizing** (`409` → "still scoring" card + auto-poll), **error** (`ErrorState` + Retry, not-found/not-yours), **success** (the growth panel).
- **No-verdict (load-bearing):** the panel renders strengths/gaps/topics only — **never** a score, ring, or hire/reject pill; the reskin preserves this.
- **Responsive:** strengths/gaps stack on mobile, `sm:grid-cols-2` on wider; topic chips wrap.
- **Dark + light:** `--accent`/base vars only; both themes verified.
- **A11y:** lists are semantic `<ul>/<li>`; decorative icons `aria-hidden`; links are real `<a>`; focus rings via `:focus-visible`; contrast ≥4.5:1.

## Acceptance
- Matches `redesign-v2/practice-feedback.html`; `--filter @ip/candidate build` + typecheck green; **zero functional diff** (same client, query key, 409-poll, fields); the no-verdict guarantee holds; mock→real path unchanged.
