# Frontend — `job-pipeline` (Midnight v3)

> **Screen:** Job pipeline — applicants, ranking, advisory gate · **Goal:** reskin the existing `/company/jobs/[id]` pipeline into the Midnight `.app` shell (KPI strip, funnel-stage filter chips, a selection bar + batch decide, the `.table-wrap` applicants table with status/integrity/gate `.pill`s, the Ranked panel, score distribution, and the gate-mode control) **with zero behavior change** — same `ListApplicants`/`GetJobRankedCandidates` queries, same `OverrideGate`/`DecideApplication` handlers, same selection reducer + gate-mode mutation.
> **Unified route + role:** `/company/jobs/[id]` (signed-in **company/recruiter**; `.app` shell under `/company/*`).
> **Mockup:** ✓ [`redesign-v2/applicants-pipeline.html`](../../../../brand/redesign-v2/applicants-pipeline.html) — **no Task 0**.
> **Existing code it reskins (exact paths):**
> - `frontend/apps/company/app/jobs/[id]/page.tsx` (`JobDetailPage` — tabs Pipeline/Report/Schedule/Messages; gate-mode Settings; publish/status controls)
> - `frontend/apps/company/components/applicants-table.tsx` (rows, status pills, `assessment_review` advisory cluster, bulk-select, poll/override)
> - `frontend/apps/company/components/ranked-panel.tsx` (`GetJobRankedCandidates` AI match order)
> - `frontend/apps/company/components/reports-panel.tsx` · `score-distribution-panel.tsx`
> - `frontend/apps/company/components/gate-mode-toggle.tsx` (per-job auto|advisory)
> - `frontend/apps/company/components/batch-decision-bar.tsx` (bulk decide fan-out)
> - BE contract: [`backend_job-pipeline.md`](./backend_job-pipeline.md) (restates [`../../v2-screens/applicants-pipeline.md`](../../v2-screens/applicants-pipeline.md)).

## Layout & components (shell → mockup region map)

**Shell:** signed-in `.app` (`CompanyShell`) → `.side` (**Jobs & applicants** `aria-current`) + `.main` → `.topbar` (crumb `Jobs / Senior Backend Engineer` + `.searchbox` "Search applicants" + Export `.btn-ghost.btn-sm` + `.avatar`) + `.content`.

| Mockup region | `@ip/ui` class | Existing component |
|---|---|---|
| Page head (job title + meta + **Advisory gate** badge) + tabs | `.page-head` (`h2` + `.sub` + `.badge`) + `.tabs[role=tablist]` | `JobDetailPage` tabs |
| KPI strip (Applicants / Interviewed / Pass gate / Median response) | `.kpis` → `.kpi` (`.k-label`/`.k-val.tnum`/`.k-delta`) | derived counts (render-only) |
| Funnel-stage filter chips (All/Interviewed/Passed gate/Shortlisted) + Sort | `.toolbar` + `.chip-toggle[aria-pressed]` | client filter over `ListApplicants` |
| Selection bar (N selected → Message/Reject/Advance) | `.selbar` (inverted ink bg) + `.btn-primary.btn-sm`/`.btn-ghost.btn-sm` | `BatchDecisionBar` |
| Applicants table | `.table-wrap` + `table.data` (checkbox col + Candidate/Score/Integrity/Stage/Applied/Gate/·) | `applicants-table.tsx` |
| Candidate cell | `.who`(`.avatar`/`.nm`/`.sub`) | row |
| Score / Applied cells | `.tnum` | row |
| Integrity / Stage / Gate cells | `.pill` (`.pill-good` Clean/Pass · `.pill-warn` flags · `.pill-bad` Terminated/Below bar · `.pill-accent` Interviewed · `.pill-neutral` In review/Borderline) | `StatusPill` / `applicationStatus` |
| `assessment_review` advisory cluster ("AI recommended — you decide" + Advance/Decline) | `.badge` + `.btn-sm` cluster | advisory cluster |
| Ranked / Reports / Scores tabs | `.tabs` content | `ranked-panel`/`reports-panel`/`score-distribution-panel` |
| Settings (gate-mode) | `.card` + gate-mode control | `gate-mode-toggle` + Settings tab |
| Row check / select-all | `td .check` / `th .check` (`.on` when checked) | `Checkbox` + selection reducer |

**New vs reused:** no new logic. The selection bar maps `BatchDecisionBar` to `.selbar`; status/integrity/gate cells map `StatusPill`/`applicationStatus` to `.pill-*`; the advisory cluster + gate-mode control keep their existing handlers. Reskin only.

## Data wiring (kept identical to today)
- **Applicants:** `api.applications.listApplicants({ jobId })` — query key `["applicants", jobId]`; rows `ApplicationResponse { applicationId, candidateUserId, state, ... }` (incl. `state === "assessment_review"`).
- **Ranked:** `api.recommendations.getJobRankedCandidates({ jobId })` — key `["ranked", jobId]`; `matches[] { candidateUserId, score, reasons[] }`.
- **Decide / advance:** `Decision.DecideApplication({ applicationId, outcome })` (`shortlisted|hired|rejected`) + `Decision.OverrideGate({ applicationId })` — both audited, notify the candidate. **Batch** = `Promise.allSettled` fan-out over `DecideApplication` (no new RPC); invalidates `["applicants"]`/`["ranked"]`/`["reports"]`/`["score-dist"]`/`["analytics"]`.
- **Selection:** the pure `lib/selection.ts` reducer (`toggle`/`toggleAll`/`selectableIds`; decidable = `scored|shortlisted|assessment_review`) — **unchanged** (its tests still pass).
- **Gate mode:** seeded from `job.data?.aptitudeConfig?.gateMode ?? "auto"`; save → `api.jobs.updateJob({ jobId, gateMode })`; invalidates `["job", id]`. Compiles before `UpdateJob` lands (optional-chain default). See [`backend_job-pipeline.md`](./backend_job-pipeline.md).

## Tasks (bite-sized; reskin only — pure reducers/helpers unchanged) · **mockup ✓ → skip Task 0**

> Per-task: `--filter @ip/company build` (+ `--filter @ip/ui typecheck` when touching `@ip/ui`) → browser-verify → explicit-path commit.

### Task 1: Shell + page head + tabs + KPI strip
- [ ] Wrap `JobDetailPage` in `CompanyShell`; `.page-head` = job `h2` + `.sub` (Remote · Full-time · Published Nd ago) + `.badge` "Advisory gate" (when `gate_mode==="advisory"`); tabs → `.tabs[role=tablist]` (Pipeline/Report/Schedule/Messages — keep the existing tab set + their content). Render the KPI strip as `.kpis`/`.kpi` from existing derived counts (render-only — no new query).
- [ ] Verify build; commit `app/jobs/[id]/page.tsx`.

### Task 2: Filter chips + selection bar
- [ ] Funnel-stage filter `.toolbar` of `.chip-toggle[aria-pressed]` (All/Interviewed/Passed gate/Shortlisted + Sort) — client filter over the fetched applicants (counts from the list). Reskin `BatchDecisionBar` → `.selbar` (inverted `--ink` bg) shown when `sel.size>0`: "N selected" + Message/Reject `.btn-ghost.btn-sm` + Advance `.btn-primary.btn-sm`. Keep the `Promise.allSettled` fan-out + invalidations verbatim.
- [ ] Verify: selecting decidable rows reveals the bar; "Apply to selected" decides the set + rows update. Commit `components/batch-decision-bar.tsx` + `applicants-table.tsx`.

### Task 3: Applicants table → `.table-wrap`
- [ ] Reskin `applicants-table.tsx` to `.table-wrap`/`table.data`: leading checkbox col (`th .check`/`td .check.on`), Candidate `.who`, Score `.tnum`, Integrity/Stage/Gate `.pill-*` (via `StatusPill`/`applicationStatus`), Applied `.tnum`, trailing `View` `.btn-ghost.btn-sm` Link → `/company/jobs/[id]/applicants/[appId]`. Keep loading/empty/error branches, the poll/`override` logic, the mobile-card ↔ desktop-table lockstep, and the selection checkboxes (`selectableIds`) **unchanged**.
- [ ] Verify: rows render with correct pills; checkboxes select decidable rows only; poll continues for non-terminal. Commit `components/applicants-table.tsx`.

### Task 4: `assessment_review` advisory cluster (reskin)
- [ ] Reskin the advisory action cluster: a `.badge`/`.pill-warn` "AI recommended — you decide" + **View report** / **Advance** (`OverrideGate` `ConfirmDialog`) / **Decline** (`DecisionControl` → `DecideApplication(rejected)`). Keep the `assessment_review` membership (non-terminal, keeps polling) + the `override` `onSuccess` invalidation of `["ranked", jobId]` **unchanged**.
- [ ] Verify: an `assessment_review` row shows the badge + Advance/Decline; Advance moves it out of the queue. Commit `components/applicants-table.tsx`.

### Task 5: Ranked / Reports / Scores panels
- [ ] Reskin `ranked-panel.tsx` (AI match order — `.card`/`.who`/`.ring` score), `reports-panel.tsx`, `score-distribution-panel.tsx` to Midnight `.card`/`.bar`/`.pill`/`.tnum`. Keep their queries + props identical.
- [ ] Verify each tab renders; commit the three component files.

### Task 6: Gate-mode Settings control
- [ ] Reskin `gate-mode-toggle.tsx` / the Settings tab to a Midnight `.card` with the auto|advisory control (token tiles) + Save `.btn-primary` (disabled until changed). Keep `updateJob` mutation + `["job", id]` invalidation + the optional-chain seed **unchanged**.
- [ ] Verify: persisted value shows, Save disabled until changed, save toasts. Commit `components/gate-mode-toggle.tsx` + `app/jobs/[id]/page.tsx`.

### Task 7: Build + full preview
- [ ] `--filter @ip/company build` green; preview `/company/jobs/[id]`: Pipeline tab (funnel-stage pills, selection bar + batch decide, an `assessment_review` advisory row), Ranked tab (refreshed after a batch action via the `["ranked"]` invalidation), Settings tab (gate-mode persists). Screenshot the Pipeline tab with a mixed funnel + active selection. Commit.

## States & a11y
- **Applicants tab:** `LoadingState` / `EmptyState` "No applicants yet" / `ErrorState`+retry (inherited) / success rows; selection bar iff ≥1 decidable selected; per-action busy via `decide.isPending`/`override.isPending`; toasts on success/error; selection pruned to the decidable set on every refetch.
- **Advisory queue:** "AI recommended — you decide" + Advance (→ `interview_pending`) + Decline (→ `rejected`); the row keeps polling until it transitions.
- **Settings:** gate-mode seeded from the job; Save disabled until changed; success/error toasts.
- **`auto`/legacy jobs:** read `"auto"` (optional-chain default) — no `assessment_review` rows; the advisory cluster is never hit.
- **Responsive:** the checkbox/score columns kept in lockstep across the `sm:hidden` card layout and the `hidden sm:block` table; `.selbar` + chips wrap; Settings card `max-w-md`; readable at ~375px.
- **Dark + light:** tokens only (`.pill-*` tones, `.selbar` `--ink` bg, `.check.on` `--accent`, `.ring`/`.bar`) — no hardcoded color.
- **A11y:** `StatusPill` carries the label as text (not color-only); select-all + per-row checkboxes are real keyboard-operable `Checkbox`es; the gate-mode `Select` gets its name from `Field`; the advisory badge makes the human-decision framing explicit, not color-implied; focus rings via `:focus-visible`; contrast ≥4.5:1.

## Acceptance
- Matches `redesign-v2/applicants-pipeline.html`; `--filter @ip/ui typecheck` + `--filter @ip/company build` + `typecheck` green; **zero functional diff** (same `ListApplicants`/`GetJobRankedCandidates` queries, same `OverrideGate`/`DecideApplication` + batch fan-out, same `selection.ts` reducer + tests, same gate-mode mutation); advisory path default-off (`auto`) so existing jobs are byte-for-byte unchanged; works against existing RPCs today and against `updateJob` + advisory `assessment_review` rows once the BE deltas land.
