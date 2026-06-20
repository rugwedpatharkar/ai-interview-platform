# Frontend — `coding-assessment` (Midnight v3)

> **Screen:** Coding assessment + sandbox · **Goal:** reskin the kind-aware assessment page (MCQ / coding / free_text sections, scratch run, masked hidden tests) to the **Midnight Intelligence** look. **Appearance-only — zero behavior change.**
> **Unified route + role:** `/aptitude/[applicationId]` · **candidate** (`useRequireAuth` + `useRequireRole(["candidate"])`).
> **Mockup:** ✗ — **build `redesign-v2/coding-assessment.html` in Task 0**.
> **BE contract:** [`backend_coding-assessment.md`](./backend_coding-assessment.md) (`Aptitude` gRPC `getAptitudeTest`/`submitAptitude` + ai-agents `POST /assessment/{id}/run`).
> **Existing code it reskins (exact paths):**
> - `frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx` (kind-aware: map served sections, dispatch on `kind`)
> - `frontend/apps/candidate/components/coding-section.tsx` (problem pane + editor + Run + masked results)
> - `frontend/apps/candidate/components/code-editor.tsx` (the **textarea fallback** editor — Monaco/CodeMirror deferred)
> - `frontend/apps/candidate/lib/assessment.ts` (`makeAssessmentClient` + `makeMockAssessmentClient` — **do not change**)
> - `frontend/apps/candidate/components/candidate-shell.tsx` (the `.app` shell wrapper — unchanged)

## Layout & components
- **Shell:** `.app` (sidebar + topbar) via the existing `CandidateShell` — **no shell change**; reskin the page body only.
- **Region → `@ip/ui` class map:**
  - Page header → `.page-head` (title + an optional progress/answered count); preparing/stalled alerts kept, tokenized.
  - **MCQ section** → `.card` per question; the `RadioGroup` reskinned with token surfaces — **the MCQ markup/scoring stays byte-identical** (regression anchor); only colors/spacing change.
  - **Coding section** (`coding-section.tsx`) → `.card` with a `lg:grid lg:grid-cols-2` split: problem pane (prompt in token text; sample tests in `.badge`/mono on `--surface-2`; "+N hidden tests" as `.pill .pill-neutral`) | editor pane (the textarea-fallback `code-editor.tsx` styled with `--font-mono` on `--surface-2`, `.btn .btn-ghost` "Run tests", results as token rows + a `.pill .pill-good`/`.pill-bad` per visible case + a hidden-aggregate line).
  - **Free-text section** → `.card` + textarea styled to `.input`.
  - Submit → `.btn .btn-primary` (gated by `allAnswered`); the score result card → `.card` with `.kpi`/`.ring` for `score` + a `.pill .pill-good`/`.pill-bad` for `passed`.
- **New vs reused:** **no new components** — reskin the existing files. The editor stays a **textarea fallback** (Monaco deferred); the seam is unchanged.

## Data wiring (kept identical to today)
- Clients/seams: `api.aptitude.getAptitudeTest`/`submitAptitude` (gRPC-web) + `assessment.run` (REST) + `makeMockAssessmentClient()` under `NEXT_PUBLIC_MOCK`. **Unchanged.**
- Query/mutations: `["aptitude", applicationId]` query (preparing-poll predicate kept); `run` `useMutation` keyed off the active coding section; `submit` `useMutation`. **Unchanged.**
- Fields consumed (from [`backend_coding-assessment.md`](./backend_coding-assessment.md)): `AssessmentTest{sections[]}`, `AssessmentSection` per-kind payload, `RunResult{compileOk, cases[], hiddenPassed, hiddenTotal}`, `AptitudeResult{score, passed}`. Markup/classes only change.
- **MCQ scoring byte-identical** + **hidden tests masked** (no hidden bodies in DTO or run result) — both preserved by the reskin.

## Tasks (reskin-only — keep all handlers/queries identical)

### Task 0 — build the mockup `redesign-v2/coding-assessment.html` (mockup ✗)
- [ ] Build `docs/brand/redesign-v2/coding-assessment.html` against `tokens.css` + `app.css`: the `.app` shell, a `.page-head`, an MCQ `.card`, a coding `.card` (`lg:grid-cols-2` problem | editor, sample tests, "+N hidden tests" pill, Run button, masked results), a free-text `.card`, the gated Submit `.btn-primary`, and a score result `.card` (`.ring`/`.kpi` + pass/fail pill). Dark-first; light parity.
- [ ] Browser-verify on the `:4173` preview; commit `docs/brand/redesign-v2/coding-assessment.html`.

### Task 1 — reskin `code-editor.tsx` (textarea fallback)
- [ ] Style the controlled textarea with `--font-mono` on `--surface-2` + token border/focus ring; keep the `{value, language, onChange, disabled}` contract identical (no editor swap — Monaco deferred). Build + browser-verify. Commit `frontend/apps/candidate/components/code-editor.tsx`.

### Task 2 — reskin `coding-section.tsx`
- [ ] Reskin the problem pane / editor pane / Run / results to the `lg:grid-cols-2` token layout; sample tests + "+N hidden tests" tokenized; per-visible-case pass/fail → `.pill`; hidden aggregate line tokenized. Keep `onRun`/`running`/`result`/`error` props + the masked-hidden render **identical** (no hidden body rendered). Lucide icons imported in-app. Build + browser-verify. Commit `frontend/apps/candidate/components/coding-section.tsx`.

### Task 3 — reskin `app/aptitude/[applicationId]/page.tsx`
- [ ] Reskin the `.page-head`, the per-kind section dispatch wrappers, the preparing/stalled/empty/error states, the gated Submit, and the score result card to tokens; keep the `["aptitude", …]` query/poll, the `run`/`submit` mutations, `allAnswered` gating, and the **byte-identical MCQ** `RadioGroup` block identical. Build + browser-verify (dark + light, `NEXT_PUBLIC_MOCK=1`). Commit `frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx`.

## States & a11y
- **Loading** (`LoadingState`), **preparing/stalled** (existing poll alerts, tokenized), **empty** (zero sections → `EmptyState`), **run idle → running → results → run-error** (per coding section: running disables Run + Spinner; error is an **inline `Alert` + Retry**, not a vanishing toast), **submitted** (score/`passed` card — unchanged), **submit-error** (toast — unchanged).
- **Hidden tests masked (load-bearing):** visible cases show `stdin → expected`; hidden show **count only** pre-run + `hiddenPassed/hiddenTotal` post-run; no hidden body ever in the DOM — preserved.
- **MCQ regression (load-bearing):** the `RadioGroup` flow + submit shape are unchanged → the score card is unchanged.
- **Responsive:** page widens (`max-w-3xl`) when a coding section is present; coding card is editor-above-results on narrow, `lg:grid-cols-2` on wide; sample-tests list scrolls in-panel.
- **Dark + light:** `--accent`/base vars only (editor inherits via `--surface-2`); both themes verified.
- **A11y:** `code-editor` keeps an explicit `aria-label` (incl. language) and does **not** trap Tab; Run/Submit are real `<button>`s with disabled/loading states; the results panel is `role="status" aria-live="polite"`; each section card has a labelled heading; MCQ stays `RadioGroup`-native; contrast ≥4.5:1.

## Acceptance
- Matches `redesign-v2/coding-assessment.html`; `--filter @ip/candidate build` + typecheck green; **zero functional diff** (same clients, query keys, mutations, request/response, MCQ byte-identical, hidden masked); mock→real path unchanged.
