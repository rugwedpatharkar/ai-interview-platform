# Practice interview — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Replace the existing v2/Midnight `/practice` page with an Aperture-Pro candidate practice surface: a setup `.cell` to start a private practice interview, a HUD-driven runner that mirrors the proctored interview's `.hud` primitive (so the candidate practices in the same surface they'll face), and a "Past practice runs" list. The whole surface is **private to the candidate** — no employer-visible affordance, no scoring against the candidate, no hire/reject verdict anywhere.

This screen is the **rehearsal twin** of `/interview/[applicationId]`. It reuses the design-language `.hud` primitive so the muscle memory transfers — but with three load-bearing differences:

1. **No proctoring auto-end.** The HUD strip shows informational chips (mic live, captions on) but never a danger state, and there is no server-authoritative termination. Practice is a private rehearsal.
2. **No score against the candidate.** No `recommendation`, no numeric score, no pass/fail. The output is feedback (strengths / gaps / suggested topics) shown on the sibling [`/feedback/[id]`](../practice-feedback/frontend_practice-feedback.md) screen.
3. **Detached invariant.** No `comp_id` / `job_id` / `applicationId` reaches the client. The page calls `makePracticeClient` (ai-agents REST), which uses owner-scoped `practice_id` only.

## Route + role

`/practice` · **candidate** (signed-in; `useRequireAuth` + `useRequireRole(["candidate"])`).

## Approved mockup (build to this exactly)

- **Live demo (HUD primitive lives here):** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html) — the practice runner reuses the `.hud` / `.hud-stage` / `.hud-strip` / `.hud-caption` primitive from the hero, with the differences described in the Goal above (no proctoring chips, captions log is the main interaction surface).
- **Per-screen mockup:** ✗ none yet → **Task 0 builds** `docs/brand/redesign-v3/screens/practice.html` against the design-language tokens + primitives: `.app` shell + setup `.cell` (topic/JD tabs + textarea + "private to you" note + "Start practice" `.btn.btn-coral`) + the HUD-driven runner (showing a current-question card + transcript captions log + a 2-control bar: captions toggle + "End practice") + a `.table-wrap` of past runs.

The implemented page MUST look like the Task 0 mockup. The runner's HUD primitive is shared with the proctored interview (see `_design-language.md` §"Hero / live HUD (interview surface)"). Side-by-side screenshot proof is part of the acceptance criteria.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope (assume these files will be re-written from scratch by the new plan):

- `frontend/apps/candidate/app/practice/page.tsx` — route shell (setup ↔ runner + history). Rebuild against the `.app` shell + the new `.cell` setup + the shared `<Hud>` primitive runner.
- `frontend/apps/candidate/components/practice-start-form.tsx` — rebuild as a single Aperture-Pro `.cell` with a topic/JD `.tabs` toggle, a `<textarea>` styled to `.input`, the privacy note, and the coral primary "Start practice" CTA.
- `frontend/apps/candidate/components/practice-runner.tsx` — rebuild around the shared `<Hud>` primitive: a stage that shows the **current question** (Schibsted Grotesk display, centered) and an answer textarea below, with the captions log on the side showing prior Q/A turns. The "End practice" control replaces "End interview" — same shape, different label.

The following are **frozen — do not modify** (data seam / type contract are reused as-is):

- `frontend/apps/candidate/app/practice/types.ts` — re-exports shared `PracticeStartResult` / `PracticeTurn` / `PracticeSummaryRow` types.
- `frontend/apps/candidate/lib/practice-client.ts` — `makePracticeClient(AIAGENTS_URL, store)` (mock + real); the FE seam.
- `frontend/apps/candidate/components/candidate-shell.tsx` — the `.app` shell wrapper (already has `{ href: "/practice" }` in `NAV`); this screen consumes it.

## Layout & components

**Shell:** `.app` (sidebar + topbar) from `@ip/ui`, mounted by the existing `CandidateShell`. The page body lives in `.content`; the sidebar's "Prepare" group highlights `Practice` via `aria-current="page"`.

| Phase / region | Aperture-Pro primitive | Behavior |
|---|---|---|
| **Page header** | `.page-head` (`h2` Schibsted Grotesk display + `.sub`) | "Practice interview" + sub "Private to you — never shared with employers, never scored against you." |
| **`setup` — start card** | `.cell` (single large card; no anchor variant) | Three regions: (1) topic/JD `.tabs` (segmented `button[aria-selected]`) with two tabs `Practice a topic` / `Practice from a JD` — only one input is active at a time (server-authoritative XOR); (2) the active input — `topic` is an `.input` `<input type="text">`, `jd_text` is an `.input`-styled `<textarea>`; (3) a `.pill.pill-teal` "Private" note + a coral primary CTA `.btn.btn-coral` "Start practice →" (gated on input non-empty + `inFlight` latch — exactly-one start). |
| **`live` — runner HUD** | shared `<Hud>` from `@ip/ui` (same primitive the proctored interview uses) | `.hud-topbar` (title "Practice run · {topic|"From JD"}" + a `.pill.pill-teal` "Private" badge + run timer) → `.hud-stage` (instead of an interviewer video, the stage shows the **current question** centered, Schibsted Grotesk `--step-3`, on the dark gradient; the answer `<textarea>` sits in a `.cell.tight` below the stage) → `.hud-strip` (3 informational chips: **Mic** Live · **Captions** On · **Mode** Practice; no proctoring states, no danger tone) → control bar (exactly two controls: captions toggle + "End practice" `.btn.btn-ghost`). |
| **`live` — transcript log** | `.hud-caption` styled live log to the side of (or stacked below on mobile) the stage | `role="log" aria-live="polite"` showing prior Q/A turns: question bubble on `--surface-2`, answer bubble on `--teal-soft` with `--teal-ink` text. The current question is `role="status" aria-live="polite"` and lives inside the stage, not in the log. |
| **`finalizing`** | `.cell.tight` overlay (replaces the stage) | "Scoring your practice interview…" + a `.bar` token progress indicator. Polls `["practice-feedback", practiceId]` until `feedback` lands, then routes to `/feedback/{practiceId}`. |
| **`history` — past runs** | `.table-wrap` containing semantic `<table class="data">` rows | Columns: `Role label` (left, Schibsted Grotesk) · `Started` (mono `--font-mono` timestamp) · `Status` (`.pill.pill-good` "Feedback ready" / `.pill.pill-neutral` "In progress") · trailing chevron link → `/feedback/{practice_id}`. Empty state: an `.cell.tight` "No practice runs yet — your first run will appear here." |
| **`unavailable`** | `.cell` (warn-tone leading icon) | "Practice is unavailable right now. Please try again shortly." + `.btn.btn-ghost` Retry. |

**Control bar — exactly two controls** (captions toggle + End practice). No mute, no camera-off, no settings — same shape as the proctored interview so muscle memory transfers, even though the proctoring gates do not apply here.

**No new logic components.** The `<Hud>` primitive is reused from `@ip/ui` (Task 1 of the proctored-interview plan lifts it there). The `.cell` / `.tabs` / `.pill` / `.table-wrap` primitives are reused as-is. The only screen-local CSS is a thin wrapper that lays the runner stage + transcript log side-by-side at `>= 1100px` and stacks them below.

## Data wiring / seam (preserved verbatim)

- **Client/seam:** `practice = makePracticeClient(AIAGENTS_URL, store)` (`frontend/apps/candidate/lib/practice-client.ts`) — methods `start` / `turn` / `feedback` / `list`. Used via `useMutation` (start, turn) + `useQuery` (history, finalizing poll). **Unchanged.**
- **Query keys (unchanged):** `["practice-history"]` (history list) · `["practice-feedback", practiceId]` (finalizing poll: `retry` on `409` n<12, `refetchUntil((d)=>d!==undefined, 2500)`).
- **Fields consumed** (see [`backend_practice.md`](./backend_practice.md)):
  - `PracticeStartResult { practice_id, question }` — `start({topic?, jd_text?})`.
  - `PracticeTurn { done, question }` — `turn({answer})`; `done=true` ⇒ switch to finalizing.
  - `PracticeSummaryRow { practice_id, role_label, created_at }` — `list()` → history table rows.
- **Mutation gating:** the start button uses an `inFlight` latch + `useMutation`'s `isPending` to guarantee exactly-one start; the turn submit uses `inFlight` + `abortCtrl` so a duplicate ⌘/Ctrl+Enter is dropped.
- **Session-ended race:** a `409` / `410` on `turn` → switch to a terminal `.cell` "Session ended — start a new run" (no resume; same shape as today).
- **Detached invariant (load-bearing).** No `comp_id` / `job_id` / `applicationId` appears in any signature on this page — the request DTOs literally don't have those fields (server boundary). The rebuild must not introduce any employer-visible affordance: no recruiter link, no shareable URL, no export button, no "report" CTA.

## Tasks (build → screenshot-verify → commit per task)

> **Task 0 — Build the screen mockup** (no demo screen exists yet).

- **Task 0 — Mockup.** Build `docs/brand/redesign-v3/screens/practice.html` against the design-language tokens + primitives: `.app` shell (sidebar with `Practice` `aria-current`), `.page-head`, the start `.cell` (topic/JD `.tabs`, `.input`, privacy `.pill.pill-teal`, `.btn.btn-coral` "Start practice"), the runner (shared `<Hud>` with current question in the stage + answer textarea below + transcript log + 2-control bar + 3 informational chips), and the "Past practice runs" `.table-wrap`. Verify in both themes on the `:4173` preview. Commit.
- **Task 1 — Rebuild `practice-start-form.tsx`.** Wrap in `.cell`; topic/JD toggle → `.tabs` segmented control; inputs → `.input`; privacy note tokenized; "Start practice" → `.btn.btn-coral` (candidate-CTA accent). **Keep the `inFlight` latch + exactly-one-start logic identical.** Browser-verify both themes. Commit.
- **Task 2 — Rebuild `practice-runner.tsx`.** Mount the shared `<Hud>` primitive with: current question in `.hud-stage` (Schibsted Grotesk display); answer `<textarea>` in a `.cell.tight` below the stage; transcript log in `.hud-caption` styled list; 3-chip `.hud-strip` (Mic Live · Captions On · Mode Practice — never danger-tone); 2-control bar (captions toggle + "End practice"). **Keep the `inFlight` / `abortCtrl` refs, the `isSessionEnded` 409/410 check, the `beforeunload` warning, the `⌘/Ctrl+Enter` submit, and the feedback handoff (`router.push("/feedback/{id}")` when `done=true`) identical.** Browser-verify the full turn loop. Commit.
- **Task 3 — Rebuild `app/practice/page.tsx`.** New body: `.page-head`, the start↔runner switch (per `started` state), the "Past practice runs" `.table-wrap`. **Keep `useRequireAuth` / `useRequireRole`, the `started` state, the `["practice-history"]` query, and the empty/loading/error branches identical.** Browser-verify (dark + light, `NEXT_PUBLIC_MOCK=1`: start → turn → end → row appears in history). Commit.
- **Task 4 — Verify against the mockup.**
  1. Build `--filter @ip/candidate build` is green; `tsc --noEmit` is green.
  2. Navigate `/practice` signed-in, screenshot setup + runner + history in both themes at 1440×900 and 390×844.
  3. **Side-by-side fidelity check** against `docs/brand/redesign-v3/screens/practice.html`. Iterate until 1:1.
  4. **Detached-invariant audit** — grep the new components for `comp_id`, `companyId`, `jobId`, `applicationId`, `recruiter`, `share`, `export`. **Zero hits.** The control bar has exactly two `<button>` elements.

## States & a11y

- **States.** `loading` (history `LoadingState`/skeleton) · `empty` (history `.cell.tight` "No practice runs yet") · `error` (`.cell` warn-tone + Retry, input preserved) · `setup` (start card) · `live` (runner) · `finalizing` (Scoring… `.cell.tight` overlay + auto-poll) · `ended` (session-ended terminal `.cell`, no resume).
- **Detached (load-bearing).** The page renders **no hire/reject verdict, no numeric score, no employer affordance** anywhere. No `comp_id` / `applicationId` reaches the client. The "Mode" chip in the HUD strip permanently reads "Practice".
- **No proctoring danger states.** The HUD strip chips are informational only — they never flip to `.hud-chip.danger` and never trigger an auto-end. There is no "auto-terminated" ended state for practice.
- **Responsive.** The start card stays single-column at all widths (`.cell` natural). The runner stage + transcript log lay side-by-side at `>= 1100px` and stack at `<= 760px` (stage on top, transcript below, answer textarea fixed below the stage). The history `<table>` collapses to a `.table-wrap` horizontal-scroll on narrow widths.
- **Dark + light.** All colors via tokens — `--surface`, `--ink-deep`, `--teal-soft`, `--teal-ink`, `--coral` (the candidate CTA accent). The stage dark gradient is the only intentional dark surface in both themes (consistency with `/interview`).
- **A11y.** One `<h1>` per page. Transcript log `role="log" aria-live="polite"`. Current question `role="status" aria-live="polite"`. Tab toggle has `role="tablist"` with `aria-selected` per tab. Inputs have real `<label>`s. Start/End are real `<button>`s with `disabled` + visible focus rings (`--teal` 2px / 4px halo). Touch targets ≥44×44. Contrast ≥4.5:1. Respects `prefers-reduced-motion`.

## Acceptance

- Looks 1:1 like `docs/brand/redesign-v3/screens/practice.html` (the Task 0 mockup) — `.app` shell, `.page-head`, start `.cell`, HUD-driven runner with current-question stage + transcript log + 3-chip informational strip + 2-control bar, past runs `.table-wrap`. Side-by-side screenshot proof committed under `docs/brand/redesign-v3/verify/practice-{light,dark}-{setup,runner}.jpeg`.
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors / warnings; reduced-motion is honored.
- **Zero functional diff.** Same `makePracticeClient`, same `["practice-history"]` / `["practice-feedback", id]` query keys, same `inFlight` / `abortCtrl` mutation gating, same `beforeunload` + `⌘/Ctrl+Enter` shortcuts, same 409/410 session-ended terminal state, same feedback handoff.
- **Detached invariant holds** — grep audit passes (no `comp_id` / `companyId` / `jobId` / `applicationId` in the practice tree), the request DTOs continue to carry only owner-scoped fields, the HUD "Mode" chip permanently reads "Practice".
- Mock→real path unchanged: `NEXT_PUBLIC_MOCK=1` still drives the full setup → turn loop → finalizing → feedback handoff; real `makePracticeClient` binds the same way once ai-agents is live.
