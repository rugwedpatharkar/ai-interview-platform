# Backend follow-ups the FE modernization needs

All findings with `needs_backend = true`, grouped by service. Each item names the RPC/field/semantics the FE needs and cites the FE finding it unlocks.

The most-blocked FE work: candidate dashboard data-thinness (needs `ApplicationResponse.jobTitle`), recruiter kanban applicant summaries (already unlocked — `getJobRankedCandidates` + `getReport` are shipping), interview recording chapter jumps + captions (needs report DTO widening), and recruiter copilot (needs scoped chat RPC with tools).

---

## AuthService (or a `/auth` HTTP endpoint)

### `/auth/providers` config
- FE finding: **CX-7** — Register + login have no social-login CTAs
- Files: `app/register/page.tsx:55` · `app/login/page.tsx:24` · `app/auth/callback/page.tsx:1`
- Emit provider start-URLs (Google + LinkedIn as MVP) via `/auth/providers` HTTP endpoint or config JSON, with `state` + `nonce` scaffolding matching the existing `/auth/callback` handler.
- LinkedIn: also expose the profile-import path so the callback can pre-fill parsed profile fields (name, work history).

---

## ApplicationService (`admin.application.v1.ApplicationService`)

### `ApplicationResponse` widening — title + company
- FE finding: **CX-4** — Dashboard renders "Job {jobId}"
- Files: `packages/api-client/src/gen/application_pb.ts:101` · `components/dashboard.tsx:351,410` · `components/dashboard-parts.tsx:41`
- Add `job_title: string`, `company_name: string`, `company_id: string` on `ApplicationResponse` (already present on `messaging_pb.ts:110-115` for a similar view). Alternative: separate `listMyApplicationsRich({})` RPC joining with jobs.

### `ApplyRequest` widening — cover letter + screening
- FE finding: **CX-8** — Apply is a 2-click modal for a single checkbox
- Files: `packages/api-client/src/gen/application_pb.ts:22` · `app/jobs/[id]/apply-island.tsx:97,109`
- Add `cover_letter: string` (optional) to `ApplyRequest`. Add `screening_answers: map<string, string>` (optional).
- `JobPosting` gains `screening_questions: repeated string`.

### `DraftCoverLetter(job_id) returns (stream Token)` — new candidate-scoped RPC
- FE finding: **AI-8** — No JD-personalized cover letter draft
- Files: `packages/shared/src/chat-stream.ts:25` (existing pattern to reuse)
- Server reads candidate profile server-side (no PII in request). Stream shape matches existing `ChatService.chat` stream.

### `Application.next_action` — post-advance content
- FE finding: **CX-12** — Outcome "See next steps" loops back
- Files: `app/applications/[id]/outcome/page.tsx:255`
- Add `next_action: string` field ("The hiring team will schedule a second interview within 3 business days" / "Sign the offer at …"). FE renders on outcome + timeline. Alternative: extend Application state past `shortlisted`.

---

## RecommendationService (`admin.recommendation.v1.RecommendationService`)

### `Match` widening — title + company (optional)
- FE finding: **CX-4** (partial) — Dashboard "Recommended role" placeholder
- Files: `packages/api-client/src/gen/recommendation_pb.ts:55` · `components/dashboard.tsx:411`
- Optional but nice-to-have: add `job_title` + `company_name` to `Match` so the FE doesn't need to fan out to `getJob({jobId})` for each recommendation (see AI-1's FE-only path via `useQueries`).

---

## MessagingService

### `listMessages` — cursor pagination
- FE finding: **PF-7** — MessageThreadView renders every message per poll
- Files: `app/messages/messages-client.ts:64-66` · `packages/shared/src/use-thread-messages.ts:63-88`
- Add `{limit: 50, before?: id}` to `listMessages`. Return cursor metadata so FE can request the tail and virtualize.

### `getUnreadMessageCount() returns int`
- FE finding: **PF-11** — CandidateShell fetches full thread list per nav
- Files: `components/candidate-shell.tsx:77-88`
- Lightweight RPC returning a single integer. FE shell reads that instead of the full `listThreads` payload; `/messages` keeps the fat call.

---

## ReportService

### `CompetencyEvidence.start_time_ms: int32`
- FE finding: **RX-12** / **AI-7** — Evidence quotes carry `turnIndex` but no jump-to-timestamp
- Files: `packages/api-client/src/gen/report_pb.ts:154` · `app/company/jobs/[id]/applicants/[appId]/page.tsx:577,722`
- Per-quote start-time in ms. FE renders "Jump to 4:12" anchor button that runs `videoRef.current.currentTime = startTimeMs/1000; videoRef.current.play()`.

### `InterviewReport.transcript_vtt_url: string`
- FE finding: **AY-8** — Session recording has no captions track (also AI-7)
- Files: `app/company/jobs/[id]/applicants/[appId]/page.tsx:717-728` · `components/interview-captions.tsx`
- WebVTT URL for the interview transcript. FE renders `<track kind="captions" srcLang="en" default src={timeline.transcriptVttUrl} />` inside `<video>`. Generated from the live captions already streamed via ProctorEvent.

### `InterviewReport.recommendation_confidence: float` (0..1)
- FE finding: **AI-11** — Verdict pill lacks confidence
- Files: `packages/api-client/src/gen/report_pb.ts:283,287` · `app/company/jobs/[id]/applicants/[appId]/page.tsx:342`
- Optional `repeated CommitteeVote committee = 12` for ensemble breakdown. FE renders confidence bar + committee agreement line.

### `InterviewReport.report_highlights: repeated Highlight` (optional)
- FE finding: **AI-7** — Recording no auto-clip highlights
- Files: `app/company/jobs/[id]/applicants/[appId]/page.tsx:722`
- `Highlight = {start_s: float, end_s: float, label: string}`. Top-3 auto-clip strip above the video seeks by start_s. Feeds the "auto-clip highlights" brief item.

---

## SourcingService

### `CandidateHit.applications: repeated ApplicationRef`
- FE finding: **RX-11** — Talent drawer has no link to open applications
- Files: `packages/api-client/src/gen/sourcing_pb.ts:63` · `app/company/talent/sourcing-types.ts:8` · `app/company/talent/page.tsx:439`
- `ApplicationRef = {application_id, job_id, job_title, state}`. Drawer renders "Applications" list linking to `/company/jobs/{jobId}/applicants/{appId}`.

---

## AnalyticsService

### `FunnelAnalyticsRequest.job_id: optional string`
- FE finding: **RX-17** — Analytics has no per-role dimension
- Files: `packages/api-client/src/gen/analytics_pb.ts:74` · `app/company/analytics/page.tsx:25`
- Optional `job_id` scoping the funnel per role. FE renders a role filter chip row populated from `listJobs`. Note: `GetNoGhostingKpis` + `GetJobScoreDistribution` are already implemented — RX-2 unblocks them FE-only.

---

## PracticeService

### `GrowthFeedback` — severity + next-question suggestions
- FE findings: **CX-13** (severity) · **AI-12** (next questions)
- Files: `app/practice/types.ts:1` · `components/growth-feedback-panel.tsx:54,78`
- Per-strength / per-gap `severity: enum {polish, notable, blocker}`.
- Per-competency `next_question_suggestions: repeated string` so the interview lobby can render a 60-second targeted rehearsal (CX-13 severity does not add a score — matches the verdict-free stance).

---

## ChatService

### Scoped chat RPC with read-only recruiter tools
- FE finding: **AI-10** — No recruiter copilot
- Files: `packages/api-client/src/gen/chat_pb.ts:55` · `packages/shared/src/chat-stream.ts:25` · `components/company-shell.tsx:120`
- New RPC (or extend existing `chat`) that can call read-only tools server-side: `listApplicants`, `listJobs`, `getReport`, `getFunnelAnalytics`, `getNoGhostingKpis`, `getJobScoreDistribution`. Bounded means the tool set is finite + read-only.
- Response citations use the existing `Citation{url, topic}` shape. Every claim links to a fetched resource.
- Phase-1 FE-only fallback (no BE dep): FE consumes the existing `chat` stream for "how do I …" answers with citations pointing to `/ai-explainability` and other docs.

---

## InterviewService / LiveKit data channel

### `question_meta` data-channel event
- FE finding: **CX-14** — HUD has no question navigation or Iris state
- Files: `app/interview/[applicationId]/rtc-room.ts:7` · `app/interview/[applicationId]/page.tsx:326` · `components/interview-captions.tsx:1`
- Server emits `{type: 'question_meta', index: N, total: M}` on the LiveKit data channel with every new question. FE HUD renders "Question 3 of 12".

### Reconnect + partial-save contract
- FE finding: **CX-6** — Interview room no reconnect / connection-quality UI
- Files: `app/interview/[applicationId]/rtc-room.ts:17` · `app/interview/[applicationId]/page.tsx:179`
- Server-side saves partial answers on `Reconnecting >30 s` so a session can end gracefully. Optional: expose a "resume-if-possible" endpoint the FE polls after ICE reconnect.
- Depends on real LiveKit swap landing first (rtc-room.ts:31 today returns `makeFakeRoom`).

---

## DecisionService

### Verify `decideApplication` accepts `reasonCode` + `freeText` on Advance
- FE finding: **RX-6** — Advance decision collects no reason
- Files: `app/company/jobs/[id]/applicants/[appId]/page.tsx:449,218` · `app/company/audit/audit-client.ts:8`
- The mutation shape already accepts `{action, reasonCode, freeText}`. Confirm BE persists `reasonCode` + `freeText` on Advance rows and surfaces them in `AuditEntry.reasonSnippet`.

---

## Server Actions bridge (strategic)

### Thin REST proxies under `/app/api/**`
- FE finding: **RF-12** — Migrate apply/login/register/aptitude/updateProfile to Server Actions
- Files: `app/login/page.tsx:75` · `app/jobs/[id]/apply-island.tsx:59` · `app/aptitude/[applicationId]/page.tsx:170` · `app/profile/page.tsx:194` · `components/dashboard.tsx:91`
- Next.js Route Handlers that forward to the existing gRPC endpoints, threading the bearer token. Highest-volume mutations first: apply, save, submitAptitude, updateProfile, register, login.
- Once available, FE converts to `<form action={...}>` + `useActionState` + `useOptimistic` where appropriate.

---

## Summary table

| Service | Change | FE finding | Priority | Horizon |
|---|---|---|---|---|
| Auth | `/auth/providers` config | CX-7 | P1 | medium |
| Application | `ApplicationResponse.{jobTitle, companyName, companyId}` | CX-4 | P1 | medium |
| Application | `ApplyRequest.{coverLetter, screeningAnswers}` + `JobPosting.screeningQuestions` | CX-8 | P1 | medium |
| Application | `DraftCoverLetter(job_id) returns (stream Token)` | AI-8 | P1 | medium |
| Application | `Application.next_action` | CX-12 | P2 | medium |
| Recommendation | `Match.{jobTitle, companyName}` (optional) | CX-4 | P1 | medium |
| Messaging | `listMessages` cursor pagination | PF-7 | P2 | medium |
| Messaging | `getUnreadMessageCount()` | PF-11 | P3 | medium |
| Report | `CompetencyEvidence.start_time_ms` | RX-12/AI-7 | P1 | medium |
| Report | `InterviewReport.transcript_vtt_url` | AY-8/AI-7 | P1 | medium |
| Report | `InterviewReport.recommendation_confidence` + optional `committee` | AI-11 | P2 | medium |
| Report | `InterviewReport.report_highlights` (optional) | AI-7 | P1 | medium |
| Sourcing | `CandidateHit.applications: repeated ApplicationRef` | RX-11 | P1 | quick-win |
| Analytics | `FunnelAnalyticsRequest.job_id` | RX-17 | P2 | medium |
| Practice | `GrowthFeedback.{severity, nextQuestionSuggestions}` | CX-13/AI-12 | P2 | medium |
| Chat | Scoped chat RPC with read-only recruiter tools | AI-10 | P1 | strategic |
| Interview/RTC | `question_meta` data-channel event | CX-14 | P2 | strategic |
| Interview/RTC | Reconnect + partial-save contract | CX-6 | P1 | strategic |
| Decision | Verify Advance `reasonCode` + `freeText` persistence | RX-6 | P1 | quick-win |
| Bridge | REST proxies for Server Actions | RF-12 | P3 | strategic |
