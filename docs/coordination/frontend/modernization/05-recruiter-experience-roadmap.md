# Recruiter experience roadmap

Only `recruiter-journey-ux-productivity` findings, ordered by recruiter-flow step. Full field detail in `01-full-audit.md`.

---

## Create (workspace, team, rubrics)

### P2 — Rubric descriptors silently dropped even within a session (RX-16)
- `app/company/rubrics/page.tsx:75,311,340`
- Persist descriptors keyed by `${identity.id}:rubric:${editingId ?? 'new'}` in localStorage. BE picks up field when schema is ready.

### (Cross-dimension) Company onboarding runs createJob then invites sequentially — see PF-4
- `app/company/onboarding/page.tsx:118-178`

---

## Post (create + edit job)

### P1 — Post/Edit forms lose all fields on any client-side nav (RX-4)
- `app/company/jobs/new/page.tsx:45,127` · `app/company/jobs/[id]/edit/page.tsx:69,77`
- Extract `useDraftForm(key, initialValues)` — localStorage mirror + rehydrate + beforeunload + Next `useOnBeforeNavigate` guard. Keys `job:new:${identity.id}` and `job:${jobId}:edit:${identity.id}`.

### P1 — JD 'Improve with AI' clobbers draft in place, no diff/undo (RX-5)
- `app/company/jobs/new/page.tsx:88,214` · `packages/api-client/src/gen/jd_pb.ts:35`
- Snapshot `v.jdText` into ref before improve; render `<Notice>` "AI improved your draft. Keep · Revert." Better: side-by-side diff dialog before commit.

### P2 — Post/Edit forms ~200 LOC of copy-paste duplication (RX-7)
- `app/company/jobs/new/page.tsx:128,347` · `app/company/jobs/[id]/edit/page.tsx:207,348`
- Extract `<JobForm value onChange onSubmit submitLabel status? />` into `app/company/jobs/job-form.tsx`.

### P3 — Post-a-job has no sticky TOC / anchor navigation (RX-18)
- `app/company/jobs/new/page.tsx:129,194`
- Add ids to sections; sticky left rail on lg+ with IntersectionObserver scroll-spy.

### P3 — `parseSkills(skillsRaw)` runs 3x per keystroke (RX-19)
- `app/company/jobs/new/page.tsx:240,242` · `app/company/jobs/[id]/edit/page.tsx:263`
- `useMemo`.

### (Cross-dimension) `accent-teal` on gate-mode radios paints stock teal — see DS-1
- `app/company/jobs/new/page.tsx:375` · `app/company/jobs/[id]/edit/page.tsx:376`

---

## Discover (jobs list, talent search)

### P1 — Talent search asymmetric (Stage instant, keyword deferred; Stage ignored on empty) (RX-10)
- `app/company/talent/page.tsx:52,59,118`
- `active = params.query.trim().length > 0 || Boolean(params.stage)`. Debounce keyword 250 ms. Remove Search button as required commit.

### P1 — Talent detail drawer has no link to open applications (RX-11)
- `app/company/talent/page.tsx:439` · `app/company/talent/sourcing-types.ts:8` · `packages/api-client/src/gen/sourcing_pb.ts:63`
- BE — widen `CandidateHit` with `repeated ApplicationRef applications = 6` where `ApplicationRef = {application_id, job_id, job_title, state}`. Drawer renders Applications list.

### P2 — Talent search min_score in proto + DTO has no UI (RX-9)
- `app/company/talent/page.tsx:100` · `app/company/talent/sourcing-client.ts:78` · `packages/api-client/src/gen/sourcing_pb.ts:33`
- `<Field label='Min fit'>` with Select (Any / >=50% / >=70% / >=85%) setting `params.minScore`.

### P2 — Jobs list has no title search or sort (RX-14)
- `app/company/jobs/page.tsx:110,170`
- Client-side title-filter Input + sort Select (Most recent / Most applicants / A–Z).

### P2 — Dashboard 'Latest postings' relies on undefined server order (RX-15)
- `app/company/page.tsx:181` · `packages/api-client/src/gen/job_pb.ts:322`
- Client-side sort by `postedAt` desc before slicing.

### (Cross-dimension) CompanyShell has no ⌘K palette — see AI-4
- `components/company-shell.tsx:149`

---

## Review (pipeline board, applicant report)

### P1 — Pipeline cards hide fit score (RX-1 / AI-2 same defect)
- `app/company/jobs/[id]/page.tsx:94,110` · `packages/api-client/src/gen/recommendation_pb.ts:120` · `packages/api-client/src/gen/application_pb.ts:101`
- Parallel `useAuthedQuery(['ranked', id], () => api.recommendations.getJobRankedCandidates({jobId: id}))`. Build `Map<candidateUserId, {score, reasons[]}>`. Sort within lane by score desc. Render ScoreRing mini + top reason chip.

### P1 — Pipeline no search, no bulk, no sort, no keyboard nav (RX-8)
- `app/company/jobs/[id]/page.tsx:94,186,203`
- (1) Search Input filtering `applicants.data.applications` by handle prefix. (2) View toggle Board/Table — table iterates same array with sortable columns. (3) Checkbox column + sticky bottom bar "Reject N / Hold N" bulk fan-out via `Promise.allSettled` over existing `decide.mutate`.

### P1 — Evidence quotes carry turnIndex but no jump-to-timestamp on recording (RX-12 / AI-7)
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:577,722` · `packages/api-client/src/gen/report_pb.ts:154`
- FE-only interim: render `Turn ${ev.turnIndex}` as mono pill. Full: BE exposes per-turn `startTimeMs`; FE "Jump to 4:12" seeks video.

### P2 — Applicant kanban cards zero substance (AI-6 in ai-features file — same pipeline surface)
- `app/company/jobs/[id]/page.tsx:212` · `app/company/jobs/[id]/applicants/[appId]/page.tsx:149`
- Prefetch `getReport` via batched `useQueries` for scored+ states. Render one-line `executiveSummary.slice(0, 100)` + ScoreRing mini.

### (Cross-dimension) Session recording has no chapters/captions — see AI-7 + AY-8
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:664,717-728`

### (Cross-dimension) Applicant page 856-LOC, TabButton reimplements Radix Tabs — see AR-7 + DS-10 + AY-7
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:536-559,577`

---

## Decide (Advance / Hold / Reject)

### P1 — Advance decision collects no reason (RX-6)
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:449,754` · `app/company/audit/audit-client.ts:8`
- Reuse `ReasonDialog` with `ADVANCE_REASONS`. Keep confirm enabled without picking a code so speed preserved.

### P2 — No undo grace period on Advance/Reject (RX-13)
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:218,449`
- 5-second delayed commit via `setTimeout` + `AbortController`. Toast "Rejecting Alice · Undo".

### (Cross-dimension) Verdict pill lacks confidence — see AI-11
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:96,342`

---

## Hire / offer

_No P0 gaps here — the flow ends at "advanced" today (see CX-12 for the candidate-side outcome CTA that promises next-steps content that doesn't exist)._

---

## Cross-cutting recruiter surfaces

### P1 — No aggregate messages inbox (RX-3)
- `components/company-shell.tsx:49` · `app/company/jobs/[id]/applicants/[appId]/page.tsx:194,511` · `app/messages/page.tsx`
- Add `/company/messages/page.tsx` reusing `createMessagesClient(api).listThreads()` — two-pane inbox. Add sidebar entry with badge count.

### P1 — Analytics ignores two already-generated RPCs (RX-2)
- `app/company/analytics/page.tsx:27,149` · `packages/api-client/src/gen/analytics_pb.ts:35,108,209`
- Add `useQuery` for `getNoGhostingKpis({})` (5-stat band above funnel) + per-role `getJobScoreDistribution({jobId})` (p25/p50/p75 pills on anchor cell).

### P2 — Analytics no per-role dimension (RX-17)
- `app/company/analytics/page.tsx:25` · `packages/api-client/src/gen/analytics_pb.ts:74,203`
- BE — add `optional string job_id = 1` to `FunnelAnalyticsRequest`. FE — role filter chip row from `listJobs`.

---

## Scheduling

### P3 — Schedule note has no live char counter (RX-20)
- `app/company/jobs/[id]/applicants/[appId]/schedule/page.tsx:410,420`
- Add `hint` prop to `Field` rendering `{value.length} / {max}`. Reuse across rubric descriptor, JD text, reason freeText.
