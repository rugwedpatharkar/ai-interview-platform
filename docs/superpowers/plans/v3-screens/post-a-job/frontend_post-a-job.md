# Post a job — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Rebuild `/company/jobs/new` from scratch as a **multi-step `.cell`-sectioned form** in the
Aperture Pro design language. The form is the "express what role you want to fill, what
matters, what the AI interview should cover, and who decides" surface. Each logical group of
fields lives in its own `.cell` for separation; the JD field gets an integrated **Improve with
AI** affordance (existing `jd.improveJd` call); the **Decision policy** (`gate_mode`) is
exposed as two selectable `.cell` tiles ("Advisory · you decide" / "Auto · high-severity
proctoring auto-ends"). The previous v2/Midnight form markup is **discarded**; only the form
state, validation, mutations, and pure helpers (`parseSkills`, `toCreateRequest`) survive.

## Route + role

`/company/jobs/new` (`apps/company/app/jobs/new/page.tsx`) · **company** — guarded by
`useRequireRole(["recruiter", "company_admin"])` (enforced inside `CompanyShell`).

The same `JobForm` is reused by `/company/jobs/[id]` edit. The rebuild keeps that contract.

## Approved mockup (build to this exactly)

- **Live demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — `.cell` cards, `.btn-primary` + `.btn-ghost`, `.pill-teal` chips, `.cell-visual` mono
  preview, `.tag` mono kickers.
- **Screenshots:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.

No per-screen mockup yet — Task 0 builds it.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope:

- `frontend/apps/company/app/jobs/new/page.tsx` — `NewJobPage` body (mutations stay; markup
  is replaced)
- `frontend/apps/company/components/job-form.tsx` — `JobForm` markup (state, validation,
  `toCreateRequest`, double-submit latch all survive — only JSX/classes are new)
- `frontend/apps/company/components/gate-mode-toggle.tsx` — replaced by the new `<GateModeTiles />`
  primitive built on the Aperture Pro `.cell` tile pattern
- `frontend/apps/company/components/ai-suggest-panel.tsx` — replaced by `<AiSuggestPanel />`
  rebuilt to the `.btn.btn-ghost.btn-sm` + suggestions `.cell` pattern

What is **NOT** touched: `CompanyShell`, `apps/company/app/jobs/job-form-types.ts`
(`JobFormValues`, `EMPTY_JOB_FORM`, `RemoteMode` / `EmploymentType` / `GateMode` — pure types,
unchanged), `parseSkills` (its tests still pass), `toCreateRequest` (its tests still pass), or
any generated client.

## Section spine — 7 regions, in order

| # | Region | Component | Notes |
|---|---|---|---|
| 0 | App shell | `<CompanyShell>` (existing) | **Jobs & applicants** `aria-current`. Topbar crumb = `<Company> / Jobs / Create`, avatar. |
| 1 | Page head | `<PostJobHead />` | h1 ("Create a job") + `.sub` ("A clear ad → fewer wasted applications. Aptura interviews everyone — make sure the bar is right."). |
| 2 | `.cell` — Role | `<RoleCell />` | Title input (full-width, `.input`), JD `<textarea>` `.input` (min 8 lines), and the **Improve with AI** affordance: `.btn.btn-ghost.btn-sm` ("✦ Improve with AI") above the textarea + a suggestions `.cell.tight` rendering `.pill-teal` chips when results arrive. |
| 3 | `.cell` — Requirements | `<RequirementsCell />` | Location grid (city / region / country, 3-up `.input`s). Work mode + employment type (2-up `.input` selects). Salary min / max / currency (3-up; mono `.tnum`). Skills (`.input` that emits comma-separated; rendered below as `.pill-teal` chips via `parseSkills`). |
| 4 | `.cell` — Rubric | `<RubricCell />` | Read-only `.cell-visual` mono preview of the **Aptura Core 6** rubric (Problem framing / Communication / Tradeoff reasoning / Domain knowledge / Execution / Leadership) — labelled "Default rubric — applied unless your team has customised it on the Rubrics page." A `.btn.btn-ghost.btn-sm` "Customise rubric" Link → `/company/rubrics`. No editing here. |
| 5 | `.cell` — Interview config | `<InterviewConfigCell />` | Duration target (mono select `.input`, default 30m), focus areas (multi-select chip group built on `.pill-teal`), language (`.input` select, default English). The duration field is purely advisory — it does not change the proctored-interview contract; it informs the AI agent's pacing. |
| 6 | `.cell` — Decision policy (`gate_mode`) | `<GateModeTiles />` | Two side-by-side selectable `.cell` tiles: **Advisory** (default · "Integrity is surfaced to you — you decide.") and **Auto** ("HIGH-severity integrity events end the interview automatically."). Selected tile gets the teal-tinted background + teal border (`.cell.anchor` styling). Below the tiles, a `.sub` line with the truthful explanation: "Server-authoritative. The candidate sees the same proctoring rules either way." |
| 7 | Submit row | `<SubmitRow />` | Sticky bottom row. Left = `.sub` "Drafts auto-save". Right = `.btn.btn-ghost` "Save as draft" + `.btn.btn-primary` "Create job" (disabled until title is non-empty; spinner on pending; double-submit latch via existing `useRef`). |

## Layout & components — map to `@ip/ui` and tokens

| Region | Primitive | Tokens |
|---|---|---|
| Shell | `CompanyShell` (existing) | already on the new tokens |
| Head | `h1.display` + `.sub` | typography tokens |
| Form cells | `.cell` (22px radius, 1.4rem padding, `.tag` mono kicker top-right) | `--surface`, `--line` |
| Inputs | `.input` (token-styled; 12px radius; teal focus ring via `--teal-glow`) | `--surface-2`, `--ink-deep`, `--teal-glow` focus |
| Numeric inputs | `.input.tnum` (mono numerals) | as above + Geist Mono |
| AI suggest button | `.btn.btn-ghost.btn-sm` with `✦` SVG icon (use `#spark` from sprite) | button tokens |
| AI suggestions list | `.cell.tight` (smaller padding) with `.pill-teal` chips | teal-soft background |
| Skill chips | `.pill-teal` (after `parseSkills`) | teal pill tokens |
| Rubric preview | `.cell-visual` (Geist Mono, k / v rows) | data-UI typography |
| Gate-mode tiles | Two `.cell` tiles; selected adopts `.cell.anchor` styling (teal tint + teal border) | `--teal`, `--teal-soft` |
| Submit | `.btn.btn-primary` + `.btn.btn-ghost` | button tokens |

All primitives live in `@ip/ui/src/app.css`. **Anti-slop ban —** no side-stripe borders, no
gradient text, no glassmorphism, no SaaS hero-metric template, no numbered-section markers (this
is not a 5-act narrative). The mono `.tag` kicker on each `.cell` is the only "label above the
title" the page is allowed.

## Data wiring / seam

**Identical to today.** Mutations and helpers are preserved verbatim.

| Action | Hook | Source |
|---|---|---|
| Create | `useMutation(() => api.jobs.createJob(toCreateRequest(values)))` → on success `toast` + `router.push("/company/jobs/[id]")` | `Job.CreateJob` — see [`backend_post-a-job.md`](./backend_post-a-job.md) |
| Improve JD with AI | `useMutation((jdText) => jd.improveJd(jdText))` → seeds the JD textarea + `suggestions[]` (ai-agents REST via `lib/auth`) | `jd.improveJd` |

Form state is a single `JobFormValues` (`EMPTY_JOB_FORM` seed). Adapters:

- `parseSkills(input: string): string[]` — comma-split, trim, lowercase, dedupe. **Unchanged.**
- `toCreateRequest(values: JobFormValues): CreateJobRequest` — string → bigint salary, drop-empty,
  pass `gateMode` (default `"advisory"` per design-language posture · server falls back to its
  proto3 default if missing). **Unchanged.**

**Anti-fiction guard.** The Rubric cell shows the **real** Aptura Core 6 rubric — no fake "you
beat the industry average" callouts. The AI Improve button surfaces only the real
`jd.improveJd` response. If the AI is unavailable, the form is still submittable; a toast
explains "AI suggestions unavailable right now — your draft is fine."

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Build the per-screen mockup.** Create
> `docs/brand/redesign-v3/screens/post-a-job.html` linking `@ip/ui/src/{tokens.css,app.css}`
> and the sprite. Embed the `.app` shell. Body = head + 5 `.cell` sections + the gate-mode
> tiles + the sticky submit row. Inputs use the `.input` primitive; skill chips render as
> `.pill-teal`; the rubric cell uses `.cell-visual` mono rows. Verify in both themes at 1440×900
> and 390×844 against the design-language demo. Commit the new HTML file only.

- **Task 1 — Shell + page head + sticky submit scaffold.** Mount `NewJobPage` under
  `CompanyShell`; render `<PostJobHead />` and the sticky `<SubmitRow />` (disabled placeholder
  while the form is empty). Confirm topbar crumb. Commit `apps/company/app/jobs/new/page.tsx`,
  `apps/company/components/jobs/{post-job-head.tsx,submit-row.tsx}`.

- **Task 2 — Role cell + AI suggest.** Build `<RoleCell />` with the title `.input` and the
  JD `<textarea>` `.input`. Wire the **Improve with AI** `.btn-ghost.btn-sm` to the existing
  `jd.improveJd` mutation (unchanged hook). On success, replace JD text + render a
  `.cell.tight` of `.pill-teal` suggestion chips that click-to-append into the JD. Preserve
  the existing pending/disabled states and the `type="button"` guard. Commit
  `components/jobs/role-cell.tsx`, `components/jobs/ai-suggest-panel.tsx`.

- **Task 3 — Requirements cell.** Build `<RequirementsCell />` with the three sub-grids:
  location (3-up city / region / country), mode + type (2-up selects), salary (3-up min / max /
  currency with `.input.tnum`), skills (`.input` + `.pill-teal` chips via `parseSkills`). Wire
  every field into the single `JobFormValues` state — the existing helpers `parseSkills`
  + `toCreateRequest` are reused unmodified (their tests still pass). Commit
  `components/jobs/requirements-cell.tsx`.

- **Task 4 — Rubric cell.** Build `<RubricCell />` as a read-only `.cell` with a `.cell-visual`
  mono rubric preview (the 6 Aptura Core 6 dimensions) and a Customise rubric Link to
  `/company/rubrics`. No editing here. Commit `components/jobs/rubric-cell.tsx`.

- **Task 5 — Interview config cell.** Build `<InterviewConfigCell />` with duration (mono
  select, default 30m), focus-area `.pill-teal` chip group (multi-select), and language
  (`.input` select, default English). Wire into form state. Commit
  `components/jobs/interview-config-cell.tsx`.

- **Task 6 — Decision policy tiles (`gate_mode`).** Build `<GateModeTiles />` — two selectable
  `.cell` tiles. Default = `"advisory"` (consistent with the design-language posture
  "AI recommends. Humans decide."). Selected tile gets `.cell.anchor` styling (teal tint + teal
  border) and `aria-pressed="true"`. The truthful sub-line below explains the server-
  authoritative behavior. Keep `value` / `onChange` semantics as a labelled `RadioGroup` (one-of
  selection, keyboard-operable). Commit `components/jobs/gate-mode-tiles.tsx`.

- **Task 7 — Submit + full-form preview.** Wire the **Create job** `.btn-primary` to the
  existing `createJob` mutation (`useMutation((vals) => api.jobs.createJob(toCreateRequest(vals)))`)
  with on-success `toast` + `router.push("/company/jobs/[id]")`. Preserve the `useRef`
  double-submit latch + the empty-title inline error. **Save as draft** uses the same
  `createJob` with a `status: "draft"` projection — unchanged behavior. Verify end-to-end:
  fill title + JD, improve with AI, pick mode + type, enter salary + skills (chips render),
  toggle Advisory ↔ Auto, submit → toast + redirect. Screenshot. Commit
  `app/jobs/new/page.tsx`.

- **Task 8 — Page assembly + fidelity verify.**
  1. `--filter @ip/company build` + `tsc --noEmit` green.
  2. Boot dev, sign in as a recruiter, screenshot `/company/jobs/new` in both themes at
     1440×900 and 390×844. Side-by-side against the Task-0 HTML and the design-language demo.
  3. Confirm the **shared `JobForm` contract** still serves `/company/jobs/[id]` edit — the
     edit page renders the same cells, seeded from `GetJob` (with `gateMode` populated).
  4. Confirm a non-manager loading `/company/jobs/new` is still redirected by `CompanyShell`.

## States & a11y

- **States.**
  - **Idle** — form populated from `EMPTY_JOB_FORM`; submit disabled until title is non-empty.
  - **AI improve pending** — `.btn-ghost.btn-sm` shows a spinner; the JD textarea is
    `aria-busy="true"` but still editable.
  - **AI unavailable** — toast "AI suggestions unavailable right now — your draft is fine." The
    form is still submittable.
  - **Create pending** — submit button shows spinner + `disabled`; the `useRef` double-submit
    latch prevents a second send.
  - **Validation** — empty title → inline `.pill-danger` error under the field. Off-range
    salary (server-side `INVALID_ARGUMENT`) → toast.
  - **Success** — toast + redirect to the new job (`/company/jobs/[jobId]`).
- **Responsive.** Sidebar collapses ≤1000px. Every sub-grid (location 3-up, mode/type 2-up,
  salary 3-up, gate tiles 2-up) collapses to a single column ≤760px. Sticky submit row stays
  visible at the bottom; the form scrolls under it.
- **Dark + light.** All color via tokens (`.input` focus uses `--teal-glow`; gate tiles use
  `.cell.anchor`'s teal-tinted gradient; skill chips use `.pill-teal`). No raw hex.
- **A11y.** Every field is wrapped in a `<label>` (or `aria-labelledby`). The Improve-with-AI
  button is `type="button"` so it never submits. Gate-mode tiles are a labelled
  `role="radiogroup"`; each tile is a `role="radio"` `<button>` with `aria-checked`. Salary
  fields use `inputMode="numeric"`. Skill chips have an `aria-label="Remove <skill>"` X button.
  Touch targets ≥44×44. Contrast ≥4.5:1. Focus rings via `:focus-visible` — `--teal` 2px /
  4px halo.

## Acceptance

- Looks 1:1 like the per-screen Task 0 HTML AND the relevant slices of
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Side-by-side
  screenshot proof committed under `docs/brand/redesign-v3/verify/post-a-job-{light,dark}.jpeg`.
- `--filter @ip/company build` green; `tsc --noEmit` green; no console errors / warnings.
- **Zero functional diff.** Same `createJob` mutation, same `jd.improveJd` REST call, same
  `parseSkills` + `toCreateRequest` helpers + their tests, same `useRef` latch + empty-title
  validation. `JobForm` remains reusable by `/company/jobs/[id]` edit (the edit page reads the
  same cells, seeds them from `GetJob`).
- The `gate_mode` value defaults to `"advisory"` from the FE; the server respects its proto3
  default if `gateMode` is omitted. Editing an existing job preserves the persisted `gateMode`
  (read from `aptitudeConfig.gateMode`).
- A non-manager loading `/company/jobs/new` is still redirected by `CompanyShell`.
