# Coding assessment — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Replace the existing v2/Midnight `/aptitude/[applicationId]` page with an Aperture-Pro kind-aware assessment surface: a `.app` shell + a section-by-section render of MCQ / coding / free-text questions, with the coding section built as a 2-column `.cell` (problem statement panel | editor panel with `run_code` results panel). The editor upgrades from the v2 textarea fallback to a real **Monaco** (with CodeMirror as a fallback) inside a `.cell`, themed against the Aperture Pro tokens. Backend behavior (the served sections, byte-identical MCQ scoring, masked hidden tests, `run_code` sandbox) is identical to today.

## Route + role

`/aptitude/[applicationId]` · **candidate** (signed-in; `useRequireAuth` + `useRequireRole(["candidate"])`).

## Approved mockup (build to this exactly)

- **Live demo (primitives):** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html) — `.cell` (problem panel + editor panel both sit inside `.cell` children); `.pill.pill-good` / `.pill.pill-warn` (test case pass/fail badges); `.bar > i` (overall progress); `.ring` (final score donut); `.cell-visual` mono blocks (sample test stdin/expected).
- **Per-screen mockup:** ✗ none yet → **Task 0 builds** `docs/brand/redesign-v3/screens/coding-assessment.html` against the design-language tokens + primitives: `.app` shell, `.page-head` with a `.bar` for "answered N/M", per-section render (MCQ `.cell`, coding `.cell` with `lg:grid-cols-2` problem | editor, free-text `.cell`), a sticky-bottom gated Submit `.btn.btn-primary`, and a post-submit score `.cell` (a centered `.ring` + a `.pill.pill-good` "Passed" or `.pill.pill-warn` "Below threshold").

The implemented page MUST look 1:1 like the Task 0 mockup. Side-by-side screenshot proof is part of the acceptance criteria.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope (assume these files will be re-written from scratch by the new plan):

- `frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx` — kind-aware section dispatch + Submit gating + post-submit score card. Rebuild against the `.app` shell + `.cell` per-section layout.
- `frontend/apps/candidate/components/coding-section.tsx` — rebuild as the 2-column `.cell` (problem panel | editor panel + results panel), per the Layout table below.
- `frontend/apps/candidate/components/code-editor.tsx` — **upgrade** from the textarea fallback to a real Monaco editor (dynamic import, SSR-safe, themed against `--surface-2` + `--ink-deep`). Keep the `{value, language, onChange, disabled}` contract identical so MCQ scoring + the `assessment.run` mutation are unaffected.

The following are **frozen — do not modify**:

- `frontend/apps/candidate/lib/assessment.ts` — `makeAssessmentClient` + `makeMockAssessmentClient` (used to drive `NEXT_PUBLIC_MOCK=1`).
- `frontend/apps/candidate/components/candidate-shell.tsx` — the `.app` shell wrapper.
- `frontend/packages/api-client/src/gen/aptitude_pb.ts` — gRPC-web generated types (no proto delta).

## Layout & components

**Shell:** `.app` (sidebar + topbar) from `@ip/ui`, mounted by `CandidateShell`. The sidebar's "Prepare" group highlights `Practice` is the only Prepare item; this assessment is reached from the application tracker, so no sidebar item gets `aria-current="page"` (the topbar crumb `Applications / {job} / Assessment` carries the context).

| Region | Aperture-Pro primitive | Behavior |
|---|---|---|
| **Page header** | `.page-head` (`h2` "Take the assessment" + `.sub` "Answer every section. Coding sections have hidden tests — your final score includes them.") + a `.bar > i` showing `answered/total` | The progress bar uses `.bar`; the count label sits to the right in `.tnum` mono. |
| **Preparing / stalled banners** | `.cell.tight` (info-tone leading icon) | Existing poll alerts ("Preparing your test…", "This is taking longer than usual"), tokenized. |
| **MCQ section** | `.cell` per question | The `<RadioGroup>` block stays byte-identical (scoring regression anchor); only the visual chrome changes — the radio dots use `--teal` token color, the option labels use `--ink`, the selected option gets a `--teal-soft` background. |
| **Coding section** | `.cell` with a 2-column inner grid (`lg:grid-cols-2`) | Left column: **problem panel** — prompt body in `--ink` body type; a `.cell-visual` mono block per visible sample case (`stdin` → `expected`); a `.pill.pill-neutral` "+N hidden tests" (count only — never bodies); an optional `.k-label` timer if `timeLimitS` is set. Right column: **editor panel** — the Monaco editor inside a sub-`.cell` styled with `--font-mono` on `--surface-2`; a `.toolbar` below with a `.btn.btn-ghost` "Run tests" + a `.k-label` language; the **results panel** (a sub-`.cell.tight`) renders per visible case as a row: `.pill.pill-good` "Pass" / `.pill.pill-warn` "Fail" + the case name + a `.tnum` runtime; a final `.k-label` "Hidden tests: {hiddenPassed} / {hiddenTotal} (bodies never shown)". |
| **Free-text section** | `.cell` per question | A `<textarea>` styled to `.input` (`--font-mono` for code-like prompts is opt-in; default is body sans). |
| **Submit bar** | sticky-bottom `.toolbar` inside `.app .content` | A `.btn.btn-primary` "Submit assessment" (disabled until `allAnswered` is true, with a `.k-label` "{answered} / {total} answered" beside it). On submit, the page enters the score state. |
| **Score result** | `.cell.anchor`-like single card (no anchor span) | A centered `.ring` with `--p:{score}` showing `score%`, a Schibsted Grotesk `h3` "{score}% — {passed ? "Passed" : "Below threshold"}", and a `.btn.btn-ghost` "Back to dashboard". The pill uses `.pill.pill-good` (passed) / `.pill.pill-warn` (not passed) — NOT `.pill-bad`, because the assessment is part of growth (the failed verdict is the funnel decision, not a moral one). |
| **`empty`** | `.cell` (neutral leading icon) | "This assessment has no questions yet — please contact your recruiter." + Back link. |
| **`error`** | `.cell` (warn leading icon) | "We couldn't load your assessment." + Retry. |

**Editor upgrade.** The v2 textarea fallback is replaced with **Monaco** (dynamic import, SSR-safe, lazy-loaded only on coding sections; CodeMirror remains a documented fallback if Monaco bundle pressure becomes a problem — both consume the same `{value, language, onChange, disabled}` contract). Theme is bound to the active appearance theme via `monaco.editor.defineTheme("aperture-pro-{light|dark}", …)` using the design-language tokens.

**No new logic components.** The `.cell`, `.pill`, `.bar`, `.ring`, `.toolbar`, `.cell-visual` primitives are reused as-is from `@ip/ui`. The editor is the only piece of "new logic" — a thin wrapper around `@monaco-editor/react` that resolves theme + language.

## Data wiring / seam (preserved verbatim)

- **Clients/seams (unchanged).**
  - `api.aptitude.getAptitudeTest` (gRPC-web) — fetch the test.
  - `api.aptitude.submitAptitude` (gRPC-web) — submit answers.
  - `assessment.run` from `makeAssessmentClient(AIAGENTS_URL, store)` (REST) — scratch-run the active coding section.
  - `makeMockAssessmentClient()` drives `NEXT_PUBLIC_MOCK=1`.
- **Query / mutations (unchanged).**
  - `["aptitude", applicationId]` query — keeps its preparing-poll predicate (poll while the test is being prepared, stop once `sections.length > 0`).
  - `run` `useMutation` keyed off the active coding section's `section.id`.
  - `submit` `useMutation` — the score is the response (`AptitudeResult { score, passed }`).
- **Fields consumed** (see [`backend_coding-assessment.md`](./backend_coding-assessment.md)):
  - `AssessmentTest { sections[] }` and `AssessmentSection` per-kind payload (MCQ `options[]`; coding `language` + `starterCode` + `visibleCases[]` + `hiddenCaseCount`; free-text prompt).
  - `RunResult { compileOk, cases[], hiddenPassed, hiddenTotal }` — visible per-case pass/fail + hidden aggregate.
  - `AptitudeResult { score, passed }` — flat post-submit result.
- **MCQ byte-identical (load-bearing).** The `RadioGroup` block — markup, props, scoring — stays byte-for-byte the same as today. Only the surrounding `.cell` chrome changes.
- **Hidden tests masked (load-bearing).** No hidden stdin/expected/diff is ever rendered. Pre-run: a `.pill.pill-neutral` "+{hiddenCaseCount} hidden tests"; post-run: a single `.k-label` "Hidden tests: {hiddenPassed} / {hiddenTotal} (bodies never shown)". The DTO has no hidden body field (server-stripped); the render layer is the second guarantee.

## Tasks (build → screenshot-verify → commit per task)

> **Task 0 — Build the screen mockup.**

- **Task 0 — Mockup.** Build `docs/brand/redesign-v3/screens/coding-assessment.html` against the design-language tokens + primitives: `.app` shell, `.page-head` + answered `.bar`, a sample MCQ `.cell` (radio question), a sample coding `.cell` (`lg:grid-cols-2` problem | editor with `.cell-visual` sample tests + `.pill.pill-neutral` "+N hidden tests" + Run + results panel with `.pill.pill-good` / `.pill.pill-warn` per case + hidden aggregate line), a sample free-text `.cell`, the sticky-bottom Submit `.btn.btn-primary`, and a post-submit score `.cell` (`.ring` + pass/below pill). Verify in both themes on the `:4173` preview. Commit.
- **Task 1 — Rebuild `code-editor.tsx` as Monaco.** Dynamic import `@monaco-editor/react`; define two themes (`aperture-pro-light` / `aperture-pro-dark`) mapped to the design-language tokens; render inside a sub-`.cell` styled `--font-mono` on `--surface-2`. **Keep the `{value, language, onChange, disabled}` prop contract identical** — the `assessment.run` mutation + the submit shape must remain unaffected. Verify SSR-safe (no `window` access at module scope; editor mounts only client-side under a `<Suspense>` boundary). Browser-verify both themes (the Monaco theme follows the resolved app theme). Commit.
- **Task 2 — Rebuild `coding-section.tsx`.** New 2-column `.cell`: left problem panel (prompt + `.cell-visual` sample cases + `.pill.pill-neutral` "+N hidden tests"), right editor panel (`<CodeEditor />` + `.toolbar` Run + results sub-`.cell.tight`). Render results per visible case as a row of `.pill.pill-good` / `.pill.pill-warn` + case name + runtime; render hidden aggregate as a single `.k-label` line. **Keep the `onRun` / `running` / `result` / `error` props and the masked-hidden render byte-for-byte identical** (no hidden body anywhere in the DOM). Browser-verify the run flow under `NEXT_PUBLIC_MOCK=1`. Commit.
- **Task 3 — Rebuild `app/aptitude/[applicationId]/page.tsx`.** New body: `.page-head` + answered `.bar`, the per-kind section dispatch (MCQ `.cell` with byte-identical `<RadioGroup>`, coding `<CodingSection>`, free-text `.cell`), the sticky-bottom gated Submit `.btn.btn-primary`, the post-submit score `.cell` (`.ring` + pass/below pill), and the preparing / stalled / empty / error `.cell` variants. **Keep the `["aptitude", …]` query + poll predicate, the `run` / `submit` mutations, the `allAnswered` gating, and the byte-identical MCQ block identical.** Browser-verify end-to-end under `NEXT_PUBLIC_MOCK=1` (MCQ + coding + free-text mix, Run on the coding section, Submit, score card). Commit.
- **Task 4 — Verify against the mockup.**
  1. Build `--filter @ip/candidate build` is green; `tsc --noEmit` is green; Monaco bundle is dynamic-imported (verify via Next.js bundle analyzer that it doesn't ship in the initial chunk).
  2. Navigate `/aptitude/{appId}` signed-in, screenshot both themes at 1440×900 and 390×844 (preparing, sectioned test, post-submit score).
  3. **Side-by-side fidelity check** against `docs/brand/redesign-v3/screens/coding-assessment.html`. Iterate until 1:1.
  4. **Masked-hidden audit** — grep the new components for `hiddenStdin`, `hiddenExpected`, `hiddenBody`, `hidden_case.stdin`. **Zero hits.** The pre-run "+N hidden tests" is the only mention of hidden bodies.
  5. **MCQ regression audit** — diff the rendered `<RadioGroup>` HTML against the v2 snapshot. Markup/scoring **must be byte-for-byte identical**.

## States & a11y

- **States.**
  - `loading` (`.cell.tight` skeleton).
  - `preparing` / `stalled` (existing poll alerts as `.cell.tight`, info / warn tone).
  - `empty` (zero sections → neutral `.cell`).
  - Per coding section: `idle` → `running` (Run disabled + Spinner) → `results` (results panel) → `run-error` (**inline warn-tone `Alert` + Retry**, NOT a vanishing toast — the test is in progress, the user must see the error).
  - `submitted` (post-submit score `.cell`).
  - `submit-error` (toast).
- **Hidden tests masked (load-bearing).** Pre-run: `.pill.pill-neutral` "+N hidden tests". Post-run: `.k-label` "Hidden tests: {hiddenPassed} / {hiddenTotal} (bodies never shown)". No hidden body ever in the DOM — render-layer guarantee.
- **MCQ regression (load-bearing).** The `<RadioGroup>` flow + submit shape stay byte-identical → the score card is unchanged.
- **Responsive.** The coding `.cell` is single-column at `<= 1100px` (problem panel on top, editor + results below); 2-column at `>= 1100px`. The Submit bar is sticky-bottom at all widths. The score `.ring` stays centered.
- **Dark + light.** All colors via tokens — `--surface`, `--surface-2`, `--ink-deep`, `--teal`, `--good`, `--warn`. The Monaco editor binds to the matched theme (`aperture-pro-light` / `aperture-pro-dark`); no hardcoded color anywhere.
- **A11y.** The editor has a real `aria-label` (incl. language); Monaco's `tabSize` is set but `Tab` is **not** trapped (so keyboard users can leave the editor). Run / Submit are real `<button>`s with `disabled` + loading states. The results panel is `role="status" aria-live="polite"`. Each section card has a labelled `<h3>`. MCQ stays `<RadioGroup>`-native. Touch targets ≥44×44. Contrast ≥4.5:1.

## Acceptance

- Looks 1:1 like `docs/brand/redesign-v3/screens/coding-assessment.html` (the Task 0 mockup) — `.app` shell, `.page-head` + answered `.bar`, per-section `.cell` (MCQ / coding 2-column / free-text), sticky-bottom Submit, post-submit score `.cell` with `.ring`. Side-by-side screenshot proof committed under `docs/brand/redesign-v3/verify/coding-assessment-{light,dark}-{loading,test,score}.jpeg`.
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors / warnings; Monaco is dynamic-imported and not in the initial bundle; reduced-motion is honored.
- **Zero functional diff.** Same `api.aptitude.*` clients, same `assessment.run` REST client, same `["aptitude", appId]` query key + poll predicate, same `run` / `submit` mutations, same `allAnswered` gating, byte-identical MCQ `<RadioGroup>` markup + scoring, masked-hidden render.
- Mock→real path unchanged: `NEXT_PUBLIC_MOCK=1` still drives the full flow via `makeMockAssessmentClient`; real `api.aptitude.*` + `assessment.run` bind exactly as today.
