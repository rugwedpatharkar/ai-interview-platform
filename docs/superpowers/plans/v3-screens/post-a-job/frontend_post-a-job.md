# Frontend — `post-a-job` (Midnight v3)

> **Screen:** Post a job — the marketplace-grade create form · **Goal:** reskin the existing `/company/jobs/new` create form into the Midnight `.app` shell (a `.card` form with token inputs, the **Improve with AI** affordance, and the **integrity gate** toggle) **with zero behavior change** — same `createJob` mutation, same `jd.improveJd` REST call, same `JobForm` field state + double-submit latch.
> **Unified route + role:** `/company/jobs/new` (signed-in **company/recruiter**; `.app` shell under `/company/*`).
> **Mockup:** ✗ — **Task 0 builds** [`redesign-v2/post-a-job.html`](../../../../brand/redesign-v2/post-a-job.html).
> **Existing code it reskins (exact paths):**
> - `frontend/apps/company/app/jobs/new/page.tsx` (`NewJobPage` — owns `create`/`improve` mutations + `jd.improve`, renders `<JobForm/>`)
> - `frontend/apps/company/components/job-form.tsx` (`JobForm` — shared create/edit; `JobFormValues` state, `parseSkills`/`toCreateRequest` helpers, title-error + `useRef` latch)
> - `frontend/apps/company/components/gate-mode-toggle.tsx` (`GateModeToggle` — auto|advisory `RadioGroup`)
> - `frontend/apps/company/components/ai-suggest-panel.tsx` (`AiSuggestPanel` — lifted Improve-with-AI)
> - `frontend/apps/company/app/jobs/job-form-types.ts` (`JobFormValues`, `EMPTY_JOB_FORM`, `RemoteMode`/`EmploymentType`/`GateMode`)
> - BE contract: [`backend_post-a-job.md`](./backend_post-a-job.md) (restates [`../../v2-screens/post-a-job.md`](../../v2-screens/post-a-job.md)).

## Layout & components (shell → mockup region map)

**Shell:** signed-in `.app` (`CompanyShell`) → `.side` (**Jobs & applicants** `aria-current`) + `.main` → `.topbar` (crumb `Jobs / Create` + `.avatar`) + `.content`.

| Region | `@ip/ui` class | Existing component |
|---|---|---|
| Page head | `.page-head` (`h2` "Create a job" + `.sub`) | `PageHeader` |
| Form card "Role details" | `.card` + `.card-head` (`h3` + description) | `JobForm` → `Card`/`CardHeader` |
| Title / JD / city / region / country inputs | `.input` + `Field` label | `Input`/`Textarea` (`Field`) |
| **Improve with AI** button + suggestions | `.btn-ghost.btn-sm` (`Sparkles` icon) + suggestions `.card`/`.pill` list | `AiSuggestPanel` |
| Work mode / employment selects | `.input` (Select trigger) | `Select` |
| Salary min/max + currency | `.input.tnum` (numeric) | `Input type=number` |
| Skills (comma-separated) → chips | `.input` + `.pill.pill-neutral` chips | `Input` (`parseSkills`) |
| **Integrity gate** (Auto-gate \| Advisory) | `.chip-toggle[aria-pressed]` pair or two `.card`-radio tiles | `GateModeToggle` (`RadioGroup`) |
| Submit | `.btn.btn-primary` | `Button` (submit) |

**New vs reused:** no new logic. `GateModeToggle`'s two-option control maps to the `has-[:checked]` card tiles already in place (reskinned to Midnight `.card`/`--accent-soft`); `AiSuggestPanel` keeps its `jd.improve` call + suggestions list; field grids become token-styled. Markup/class swap only.

## Data wiring (kept identical to today)
- **Create:** `useMutation(() => api.jobs.createJob(toCreateRequest(values)))` → on success `toast` + `router.push('/company/jobs/[id]')`. **Unchanged.**
- **Improve with AI:** `useMutation((jdText) => jd.improveJd(jdText))` (ai-agents REST via `lib/auth`) → seeds the JD textarea + `suggestions[]`. **Unchanged.**
- **Form state:** a single `JobFormValues` (`EMPTY_JOB_FORM` seed); `parseSkills` (comma-split/trim/lowercase/dedupe) + `toCreateRequest` (string→bigint salary, drop-empty, pass `gateMode`) — the **only** adapter that changes when `pnpm gen` lands the additive proto fields. See [`backend_post-a-job.md`](./backend_post-a-job.md) for the extended `Job` fields (`remote_mode`/`employment_type`/`salary_*`/`skills`/`gate_mode`/`posted_at`) + `jd.improveJd`.
- **Query keys:** none new (mutations only).

## Tasks (bite-sized; reskin only — TDD only for the pure helpers, which are unchanged)

### Task 0: Build the mockup (mockup ✗)
- [ ] Create `docs/brand/redesign-v2/post-a-job.html` against `tokens.css` + `app.css` (`<html data-theme="dark">`, company sidebar verbatim, **Jobs & applicants** `aria-current`). Body = `.page-head` ("Create a job") + a `.card` "Role details" form: Title `.input`; a JD `<textarea>` styled `.input` with an **Improve with AI** `.btn-ghost.btn-sm` (✦) + a suggestions block (`.card` w/ `.pill` list); city/region/country grid; work-mode + employment selects; salary min/max/currency (`.tnum`); a skills input rendering `.pill.pill-neutral` chips; the **Integrity gate** as two selectable `.card` tiles (Auto-gate / Advisory, the second `aria-pressed`/checked) with hint copy; a `.btn-primary` "Create job". Screen-specific CSS inline only.
- [ ] Browser-verify on :4173 (desktop + ~375px — grids stack). Commit `docs/brand/redesign-v2/post-a-job.html`.

### Task 1: Shell + page head
- [ ] Wrap `NewJobPage` in `CompanyShell`; `PageHeader` → `.page-head` ("Create a job" + sub). Verify build; commit `app/jobs/new/page.tsx`.

### Task 2: `JobForm` card + token inputs
- [ ] Reskin `JobForm`'s `Card` → `.card` + `.card-head` ("Role details" + description); every `Field`/`Input`/`Textarea`/`Select` to the token `.input` look; the city/region/country, mode/type, and salary grids to the mockup's grid (`sm:grid-cols-3`/`-2`). Keep the single `JobFormValues` state, `titleError`, the `useRef` latch, and `parseSkills`/`toCreateRequest` **verbatim** (helpers unchanged → their existing tests still pass; do not rewrite them).
- [ ] Verify `--filter @ip/company typecheck` + build; commit `components/job-form.tsx`.

### Task 3: `AiSuggestPanel` reskin
- [ ] Reskin the Improve-with-AI affordance to `.btn-ghost.btn-sm` (✦ `Sparkles`) + a suggestions `.card`/`.pill` list. Keep `improving`/`suggestions`/`disabled`/`onImprove` props + the `jd.improveJd` call path **identical**.
- [ ] Verify + commit `components/ai-suggest-panel.tsx`.

### Task 4: `GateModeToggle` → Midnight gate tiles
- [ ] Reskin `GateModeToggle`'s two `RadioGroup` tiles to Midnight `.card`-radio (or `.chip-toggle` pair): selected tile uses `--accent`/`--accent-soft` (`has-[:checked]`), each tile shows label + hint ("High-severity integrity signals end the interview automatically." / "Integrity is surfaced to you — never auto-ends the interview."). Keep `value`/`onChange` + `RadioGroup` semantics (default `auto`, keyboard single-select) **unchanged**.
- [ ] Verify + commit `components/gate-mode-toggle.tsx`.

### Task 5: Submit + full-form preview
- [ ] Submit `Button` → `.btn-primary`. Verify build + preview: fill title + JD, **Improve with AI** (text replaces JD, suggestions show), pick mode/type, enter salary + skills (chips render), toggle **Auto-gate ↔ Advisory**, submit → toast + redirect to `/company/jobs/[id]`. Confirm double-submit latch + empty-title inline error still fire. Screenshot. Commit `app/jobs/new/page.tsx`.

## States & a11y
- **Idle/pending:** form idle; `improve` pending (button spinner); `create` pending (submit spinner, disabled); double-submit guarded by the `useRef` latch.
- **Validation:** empty title → inline `Field` error; off-range salary handled server-side → `toast` on `INVALID_ARGUMENT`.
- **Success:** toast + redirect to the new job.
- **Responsive:** location grid `sm:grid-cols-3`, mode/type `sm:grid-cols-2`, salary `sm:grid-cols-3`, gate tiles `sm:grid-cols-2` — all stack at ~375px.
- **Dark + light:** tokens only (`.input` focus `--accent-soft` ring, gate tiles `--accent`/`--accent-soft`, `.pill-neutral` skill chips) — no hardcoded color.
- **A11y:** every field in `Field` with a label; `GateModeToggle` is a labelled `RadioGroup` (keyboard single-select); salary `inputMode="numeric"`; the AI button is `type="button"` so it never submits; focus rings via `:focus-visible`; contrast ≥4.5:1.

## Acceptance
- Matches `redesign-v2/post-a-job.html`; `npx pnpm@9.15.0 --filter @ip/company build` + `typecheck` green; **zero functional diff** (same `createJob` + `jd.improveJd` calls, same `parseSkills`/`toCreateRequest` helpers + their tests, same latch/validation); the only mock→real change remains `toCreateRequest`'s field names after `pnpm gen` regenerates `job_pb.ts` — unchanged by this reskin. `JobForm` stays reusable by `/company/jobs/[id]` edit.
