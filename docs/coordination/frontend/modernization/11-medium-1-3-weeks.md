# Medium wins (1–3 weeks each)

All findings with `horizon = medium-1-3-weeks`, sorted `priority DESC, complexity ASC`.

---

## P0

### RF-2 · Landing page RSC + islands restructure
- `app/page.tsx:4` · `app/page-client.tsx:23` · `components/landing/landing-page.tsx:1` · `components/landing/candidate-body.tsx:1` · `components/landing/company-body.tsx:1`
- Restructure into: (a) `app/(marketing)/page.tsx` (server) rendering static hero + journey + promise + evidence + FAQ + footer as RSCs; (b) `<LandingChrome/>` client island (~40 LOC) — audience switch + burger; (c) `<HeroSearchForm/>` client island (~20 LOC); (d) `<ScrollReveal/>` (~15 LOC) or CSS `animation-timeline: view()`. `company-body.tsx` becomes RSC.
- Solution sketch verified: `grep -c "useState\|useEffect\|useRef" company-body.tsx` = 0; only three `useState` in candidate-body (hero search form 82-91).

### CX-2 · Interview lobby real environment scan
- `app/interview/[applicationId]/lobby/page.tsx:113,119,278` · `app/interview/[applicationId]/proctor-audio.ts:13`
- Live VU meter driven by `AnalyserNode` (pattern already exists in `startAudioDetector`). Bandwidth/RTT probe via a small connect-web ping RPC or `navigator.connection.downlink` + WebRTC ICE-gathering timing. Rename "Run ID check" / "Run environment scan" to "Coming in v3.2" pills with `warn` gate. Speaker playback tone test.

---

## P1

### RF-4 · AuthProvider route grouping OR lazy `createClients`
- `app/layout.tsx:53` · `app/providers.tsx:13` · `packages/shared/src/auth.tsx:93` · `packages/api-client/src/index.ts:216`
- Two options. (1) Route grouping: move `AuthProvider` into an `(authed)` route group layout so marketing tree doesn't include it. (2) Lazy binding: replace eager `useMemo` at `auth.tsx:93` with getter that dynamically `await import("@ip/api-client")` on first `api` access. Option 2 preserves `useAuth` semantics while making the api-client a separate chunk.

### CX-4 · Dashboard proto extension for `jobTitle` + `companyName`
- `components/dashboard.tsx:351,410` · `packages/api-client/src/gen/application_pb.ts:101`
- BE — extend `ApplicationResponse` with `{jobTitle, companyName, companyId}` (already present on `messaging_pb.ts:110-115` for similar view). Same for `Match` on `recommendation_pb.ts:55`. FE change trivial once fields exist — `dashboard-parts.tsx:41` already threads optional fields.

### CX-7 · Social-login CTAs on login + register
- `app/register/page.tsx:55` · `app/login/page.tsx:24` · `app/auth/callback/page.tsx:1`
- BE — `/auth/providers` (or config JSON) emitting Google + LinkedIn start-URLs with state/nonce. FE — "Continue with Google" and "Continue with LinkedIn" buttons above email field. LinkedIn's profile-import path can pre-fill parsed profile fields (candidate-facing win).

### CX-8 · Apply cover letter + screening questions
- `app/jobs/[id]/apply-island.tsx:99,115` · `packages/api-client/src/gen/application_pb.ts:22`
- FE-only step: inline consent checkbox next to "Apply now" (one-click apply).
- BE — add `cover_letter: string` (optional) and `screening_answers: map<string,string>` to `ApplyRequest`. Job posting declares `screening_questions: repeated string`. FE renders 500-char Textarea in the Dialog.

### CX-10 · Candidate side-by-side compare
- `app/saved/page.tsx:129` · `components/save-job-button.tsx:15` · `app/compare/take-home/page.tsx:1`
- "Compare" checkbox on saved-jobs cards (limit 3 selected). New route `/jobs/compare?ids=a,b,c` renders 3-column table with matched-attribute rows (Salary, Location, Remote, Employment, Posted, Skills-overlap, JD-snippet). Entirely FE against `SavedJobDTO`.

### RX-8 · Pipeline board search + table view + bulk actions
- `app/company/jobs/[id]/page.tsx:94,186,203`
- (1) Search Input above the board client-filtering `applicants.data.applications`. (2) View toggle Board/Table — table iterates the same array with sortable columns (state, handle, score once RX-1 lands). (3) Checkbox column in table view + sticky bottom bar "Reject N / Hold N" bulk buttons fanning out via `Promise.allSettled` over existing `decide.mutate`. No new proto.

### RX-12 · Evidence turnIndex + video jump
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:577,722` · `packages/api-client/src/gen/report_pb.ts:154`
- FE-only interim: render `Turn ${ev.turnIndex}` as mono pill on each blockquote.
- BE — expose per-turn `start_time_ms: int32` on `CompetencyEvidence`. FE renders "Jump to 4:12" anchor button running `videoRef.current.currentTime = seconds; play()`.

### AI-3 · Recruiter shortlist compare
- `app/company/jobs/[id]/compare?appIds=a,b,c` (new)
- Fan out `api.reports.getReport` for each id in parallel. Three columns of existing report primitives (ScoreRing, executiveSummary, highlights/risks, top-3 competencies with quoted evidence). Add "Compare selected" checkbox affordance to pipeline kanban.

### AI-6 · Applicant kanban card substance
- `app/company/jobs/[id]/page.tsx:212` · `packages/api-client/src/gen/report_pb.ts:249`
- For applicants whose state ∈ `['interviewed','scored','shortlisted','hired','rejected']`, batched `useQueries` over `api.reports.getReport({appId})`. Card renders one-line `executiveSummary.slice(0, 100)` + `ScoreRing` mini (32px). For applied / aptitude_* show top matched skill from ranking join.

### AI-7 · Session recording chapters + evidence jumps
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:664,717-728` · `packages/api-client/src/gen/report_pb.ts:33`
- FE-only interim: integrity flag `at` ISO → chapter pips below video (clickable, `videoEl.currentTime = deltaSeconds; play()`).
- BE — per-quote `start_time_s` on `CompetencyEvidence` and optional `report_highlights: repeated {start_s, end_s, label}` for top-3 auto-clip strip above the video.

### AI-8 · JD-personalized cover letter draft
- `app/jobs/[id]/apply-island.tsx:97,109` · `packages/shared/src/chat-stream.ts:25`
- "Draft with AI" button in apply Dialog opens streamed panel reusing `streamAssistantChat` with scaffolded first message. Candidate reviews + edits before Submit.
- BE — new candidate-scoped `ApplicationService.DraftCoverLetter(job_id) returns (stream Token)` reading candidate's profile server-side. Add `cover_letter: string` to `ApplyRequest`.

### AY-6 · Route announcer
- `app/template.tsx:6-8`
- Client `<RouteAnnouncer />` in template. On pathname change: push `document.title` (or first h1 text) into `aria-live="polite" aria-atomic="true" role="status"` sr-only region. Move focus to `<main>` (already `tabIndex={-1}` in SidebarShell) or first h1. Guard on `prefers-reduced-motion`.

### AY-8 · Interview recording captions track
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:717-728`
- `<track kind="captions" srcLang="en" default src={timeline.transcriptVttUrl} />` inside `<video>`. BE exposes `transcriptVttUrl` on the same report/timeline RPC that serves `recordingUrl` (generated from live captions already streamed via ProctorEvent).

### DS-5 · Auth Field / Notice / PrimaryButton consolidation
- `components/auth/auth-card.tsx:88,150,177`
- One PR: import Field from `@ip/ui` with `error={fieldErrors.email}`; replace Notice with `<Alert tone=…>`; replace PrimaryButton with `<Button variant='default' size='lg' loading={busy}>`. Handles AY-2 fix as byproduct. Delete auth-card local components.

### AR-9 · Vitest coverage for pure functions
- `applications/[id]/page.tsx:70,446` · `outcome/page.tsx:80` · `applicants/[appId]/page.tsx:80,123` · `aptitude/[applicationId]/page.tsx:54`
- `applications/[id]/page.test.ts` for `buildJourney` + `labelForEvent` (parametrized over `TERMINAL_STATES` + funnel states). `outcome/page.test.ts` for `verdictFrom`. `applicants/[appId]/page.test.ts` for `pipPosition` + `toReportDTO` + `sevClass`/`sevLabel`. `aptitude/page.test.ts` for `isAnswered`.

---

## P2

### PF-6 · Move CSP nonce out of root layout
- `app/layout.tsx:34-40`
- Move nonce plumbing into route-group layout wrapping signed-in / dynamic routes. Marketing + legal groups render statically. Middleware only injects nonce on non-static routes.

### PF-7 · Message thread virtualization
- `packages/ui/src/message-thread-view.tsx:131` · `packages/shared/src/use-thread-messages.ts:63-88`
- BE — add cursor pagination to `listMessages` (`limit: 50, before?: id`). FE — swap map for TanStack Virtual or react-virtuoso. FE-first fallback: cap `rows` to last 100 in the hook until BE ships cursor.

### PF-11 · Unread messages count RPC
- `components/candidate-shell.tsx:77-88`
- BE — add lightweight `getUnreadMessageCount()` returning single int. FE — shell reads that; `/messages` keeps fat `listThreads`. FE-only fallback: raise `staleTime` to ~120 s + reduce poll to 120 s off-`/messages`.

### CX-12 · Outcome page next-action content
- `app/applications/[id]/outcome/page.tsx:255`
- Two options. (a) Quick: rewrite CTA to "Message the reviewer" / "Return to applications". (b) BE — extend `Application` state past 'shortlisted' with `next_action: string` ("The hiring team will schedule a second interview within 3 business days" / "Sign the offer at …"). FE renders on outcome + timeline.

### CX-13 · Growth feedback severity
- `components/growth-feedback-panel.tsx:54,78` · `app/practice/types.ts:1`
- BE — per-strength / per-gap `severity: 'polish' | 'notable' | 'blocker'`. FE renders three visual tones. Optional cohort-relative anchor ("60% of candidates work on this"). Do not add a score.

### RX-17 · Analytics per-role dimension
- `app/company/analytics/page.tsx:25` · `packages/api-client/src/gen/analytics_pb.ts:74`
- BE — add `optional string job_id = 1` to `FunnelAnalyticsRequest`. FE — role filter chip row (from `listJobs`). Immediate FE-only step (no BE dep): stack `getJobScoreDistribution` panel per role.

### AI-11 · Verdict confidence
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:96,342` · `packages/api-client/src/gen/report_pb.ts:283`
- BE — add `float recommendation_confidence = 11` to `InterviewReport`. Optional `repeated CommitteeVote committee = 12`. FE renders confidence bar next to pill + "Aptura and 2 reviewers agree; 1 disagrees" on large spread. Interim FE-only: 'borderline' when `|overallScore - 0.5| < 0.1`.

### AI-12 · Practice → interview lobby coaching bridge
- `app/practice/page.tsx:1` · `app/interview/[applicationId]/lobby/`
- On lobby: if `practiceClient.list()` returns any sessions, add "Warm-up snapshot" cell — last-run gaps as chips, "Recap growth notes" link, Do-One-More-Round button starting a 3-question private run via existing `PracticeRunner`. FE-only against existing client. Real coach: BE extends `GrowthFeedback` with per-competency `next_question_suggestions`.

### AY-9 · CompanyShell NotificationBell mount
- `components/company-shell.tsx:149-176` · `packages/ui/src/notification-bell.tsx:63`
- Extract candidate init into `<CandidateNotifications />` helper OR reuse `@ip/ui` NotificationBell with company-side `filterItems` dropping candidate-only kinds. Mount in `company-shell.tsx:154` next to DropdownMenu.

### DS-2 · Recruiter tables → shared Table
- `app/company/audit/page.tsx:249` · `team/page.tsx:158` · `jobs/page.tsx:172` · `billing/page.tsx:257` · `talent/page.tsx:345`
- (1) Delete dead `.data` and `.table-wrap` classnames. (2) Migrate 5 tables to `@ip/ui` Table + `density='compact'` (see DS-3).

### DS-4 · StatusPill migration
- `packages/ui/src/status-pill.tsx:23` · 15+ call sites (applications tracker/detail, recruiter kanban, applicant recommendation pill, audit, team)
- Swap ~15 highest-traffic call sites to `<StatusPill>`. Delete local `pillVariant()` in `applications/[id]/page.tsx:430` and `recommendationPill()` in applicants/[appId]/page.tsx:97.

### AR-8 · Profile split
- `app/profile/page.tsx:77,313,546` · `app/onboarding/page.tsx:94`
- Extract `components/profile/education-row.tsx` (mirror of experience-row) + `components/profile/resume-upload-cell.tsx` (owns upload mutation + parse-poll state). Import from profile + onboarding to dedupe parse-polling.

### AR-11 · Typed `<ApButton>` primitive
- `packages/ui/src/styles/primitives.css:85` · 100 sites in 37 files
- Add `ApButton` to `@ip/ui`: `variant: "primary" | "ghost" | "coral"`, `size: "sm" | "md" | "lg"`. Codemod 100 sites. Reserve raw literals for landing pages only.
