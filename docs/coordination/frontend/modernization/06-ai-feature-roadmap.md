# AI feature roadmap

Only `ai-features` findings, split by side. Full field detail in `01-full-audit.md`. Each item names the RPCs it needs (if any) so BE can pick them up.

---

## Candidate-side

### P0 — Dashboard 'Recommended' cards ship as placeholders (AI-1)
- `components/dashboard.tsx:83,402,411,417` · `packages/api-client/src/gen/recommendation_pb.ts:57`
- RPCs used: `RecommendationService.getCandidateRecommendations` (already exists) + `JobService.getJob({jobId})` (already exists) — batch via `useQueries`.
- BE change: none (FE-only). Optional: extend `Match` on `recommendation_pb.ts` with jobTitle/companyName inline so the fan-out disappears.

### P1 — Onboarding promises match score but JobCard renders none (AI-9)
- `components/onboarding/candidate-checklist.tsx:59` · `components/job-card.tsx:49` · `app/jobs/marketplace.tsx:1`
- RPCs used: `getCandidateRecommendations` (once, cached).
- BE change: none.

### P1 — Job detail hides skill-gap against candidate's profile (AI-5)
- `app/jobs/[id]/job-detail-sidebar.tsx:42` · `app/jobs/[id]/apply-island.tsx:97` · `app/profile/page.tsx:476`
- RPCs used: `ProfileService.getProfile` (already exists), `JobDetailDTO.skills` (already on public REST).
- BE change: none.

### P1 — JD-personalized cover letter draft (AI-8)
- `app/jobs/[id]/apply-island.tsx:97,109` · `packages/shared/src/chat-stream.ts:25` · `packages/api-client/src/gen/application_pb.ts:18`
- BE — add `cover_letter: string` (optional) to `ApplyRequest` (proto: `application.proto`).
- BE — add candidate-scoped RPC `admin.application.v1.ApplicationService.DraftCoverLetter(job_id) returns (stream Token)` reading candidate's profile server-side (no PII in request).
- Until BE lands, FE can let candidates draft against the existing chat stream and paste into the message thread after apply.

### P2 — Practice → interview coaching bridge (AI-12)
- `app/practice/page.tsx:1` · `app/interview/[applicationId]/lobby` · `components/growth-feedback-panel.tsx:1`
- RPCs used: `practiceClient.list()` (already exists on FE).
- BE — extend `GrowthFeedback` (practice pipeline) with per-competency `next_question_suggestions: repeated string` so lobby can render a 60-second targeted rehearsal instead of a generic run.

---

## Recruiter-side

### P0 — Pipeline never calls `GetJobRankedCandidates` (AI-2 / RX-1)
- `app/company/jobs/[id]/page.tsx:60,94,186,203` · `packages/api-client/src/gen/recommendation_pb.ts:130`
- RPCs used: `RecommendationService.getJobRankedCandidates({jobId})` (already exists + generated; unused today across the app — `grep -rn getJobRankedCandidates` = 0).
- BE change: none.

### P1 — CompanyShell has no ⌘K / global search (AI-4)
- `components/candidate-shell.tsx:92,229` · `components/company-shell.tsx:149` · `components/command-palette.tsx:14`
- BE change: none. Recent-viewed feed via localStorage or `['job', id]` cache keys.

### P1 — Applicant kanban cards zero substance (AI-6)
- `app/company/jobs/[id]/page.tsx:212` · `app/company/jobs/[id]/applicants/[appId]/page.tsx:149` · `packages/api-client/src/gen/report_pb.ts:249`
- RPCs used: `ReportService.getReport({applicationId})` (already exists) — batch via `useQueries` for scored+ states.
- BE change: none. Optional interim: expose a lighter `getReportSummary` returning just `{overallScore, executiveSummary}` so the batch is cheaper.

### P1 — Session recording no chapters or evidence jumps (AI-7 / RX-12)
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:664,717-728` · `packages/api-client/src/gen/report_pb.ts:33,154`
- FE-only interim: use existing `Evidence.turnIndex` — render `Turn ${n}` pill next to each blockquote; use `integrity.flags[i].at` ISO to render clickable chapter pips below the video that call `videoEl.currentTime = deltaSeconds`.
- BE — add per-turn `start_time_ms: int32` on `CompetencyEvidence` (report.proto). Optional: top-3 highlight timeline `repeated Highlight report_highlights = N` with `{start_s, end_s, label}` for auto-clip surface.
- BE — expose `transcriptVttUrl` alongside `recordingUrl` so `<track kind="captions">` can render (see AY-8).

### P1 — Recruiter copilot / chat-with-your-data (AI-10)
- `components/assistant-chat.tsx:11` · `components/dashboard.tsx:31,455` · `components/company-shell.tsx:120` · `packages/shared/src/chat-stream.ts:25` · `packages/api-client/src/gen/chat_pb.ts:55`
- FE-only interim: `<RecruiterCopilot/>` reusing `SharedAssistantChat` mounted in CompanyShell as bottom-anchored dock, wired to same `api.chat.chat` stream. Answers 'how do I…' policy questions with citations to `/ai-explainability` and other docs.
- BE — scoped chat RPC or expose read-only "tools" (listApplicants, listJobs, getReport, funnel/no-ghosting KPIs) callable server-side by the chat agent, with citations pointing to the resources it used. Match the existing `Citation{url, topic}` shape on `chat_pb.ts:55`.

### P2 — Verdict pill lacks confidence (AI-11)
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:96,342` · `packages/api-client/src/gen/report_pb.ts:283,287`
- BE — add `float recommendation_confidence = 11` (0..1) to `InterviewReport`. Optional: `repeated CommitteeVote committee = 12` for ensemble breakdown.
- FE renders confidence bar next to pill; "borderline" tone when |score-0.5| < 0.1 as interim FE-only fallback.

---

## Cross-cutting

### P1 — No side-by-side candidate compare (AI-3 / CX-10 dual)
- `app/compare/take-home/page.tsx:1` · `app/company/jobs/[id]/applicants/[appId]/page.tsx:135` · `app/company/jobs/[id]/page.tsx:186` · `packages/api-client/src/gen/report_pb.ts:249`
- **Recruiter side (AI-3):** `/company/jobs/[id]/compare?appIds=a,b,c` — fan out `getReport` for each, render three columns of existing report primitives (ScoreRing, executiveSummary, highlights/risks, top-3 competencies with quoted evidence).
- **Candidate side (CX-10):** `/jobs/compare?ids=a,b,c` — 3-column table of matched-attribute rows from `SavedJobDTO` (Salary, Location, Remote, Employment, Posted, Skills-overlap, JD-snippet).
- RPCs used: `ReportService.getReport` (already exists), `SavedJobsService.list` (already exists).
- BE change: none.

---

## Summary of BE deltas needed for AI surfaces

Grouped for the BE handoff (also in `13-be-followups-for-modernization.md`):

- `ApplicationService.ApplyRequest`: add `cover_letter: string` (optional).
- `ApplicationService.DraftCoverLetter(job_id) returns (stream Token)`: new candidate-scoped RPC reading profile server-side.
- `ReportService.CompetencyEvidence`: add `start_time_ms: int32`.
- `ReportService.InterviewReport`: add `transcript_vtt_url: string`, `recommendation_confidence: float`, optional `report_highlights: repeated Highlight`, optional `committee: repeated CommitteeVote`.
- `PracticeService.GrowthFeedback`: add per-competency `next_question_suggestions: repeated string`.
- `ChatService`: scoped chat RPC with read-only recruiter tools (listApplicants, listJobs, getReport, funnel/no-ghosting KPIs) that return `Citation` responses.
