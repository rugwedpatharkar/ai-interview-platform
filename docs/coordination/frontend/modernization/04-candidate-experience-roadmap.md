# Candidate experience roadmap

Only `candidate-journey-ux` findings, ordered by candidate-flow step. Each block cites its full audit anchor.

---

## Register (signup / auth)

### P1 — No social-login CTAs on register + login (CX-7)
- `app/register/page.tsx:55` · `app/login/page.tsx:24` · `app/auth/callback/page.tsx:1`
- SSO wired at callback; no entry. LinkedIn profile-import would populate onboarding step 1 automatically.
- BE — emit provider start-URLs via `/auth/providers` with state/nonce.

### P1 — Signed-out apply flow drops deep-link on `/login` (CX-3)
- `app/jobs/[id]/apply-island.tsx:89` · `app/login/page.tsx:57` · `packages/shared/src/guards.ts:22`
- One-line fix: `?next=` → `?redirect=` in apply-island.

---

## Profile / onboarding

### P2 — Onboarding step 3 disables Continue when copy says skip (CX-9)
- `app/onboarding/page.tsx:288,486,563`
- `canAdvance = step === 3 ? true : ...`. Rename Continue to "Skip this step" when no resume uploaded.

### (Cross-dimension) Profile 674-LOC form re-renders on every keystroke — see RF-10 / AR-8
- `app/profile/page.tsx:89` · `components/profile/experience-row.tsx:1`
- `startTransition` around setForm; extract education-row.tsx + resume-upload-cell.tsx.

---

## Discovery (marketplace, saved, alerts)

### P2 — No side-by-side job comparison (CX-10)
- `app/saved/page.tsx:129` · `app/compare/take-home/page.tsx:1`
- Add "Compare" checkbox on saved-jobs cards (limit 3). New route `/jobs/compare?ids=a,b,c` with 3-column matched-attribute table. No BE.

### P2 — Marketplace has no active-filter chip strip (CX-11)
- `app/jobs/marketplace.tsx:82,101` · `components/filter-sidebar.tsx:183`
- Chip strip near sort tabs; dismissable per facet.

### (Cross-dimension) Onboarding promises match score on every card but JobCard renders none — see AI-9
- `components/onboarding/candidate-checklist.tsx:59` · `components/job-card.tsx:49`

### (Cross-dimension) Job detail hides skill-gap against candidate's profile — see AI-5
- `app/jobs/[id]/job-detail-sidebar.tsx:42`

---

## Apply

### P1 — Apply-to-a-job is a 2-click modal for a single-checkbox consent (CX-8)
- `app/jobs/[id]/apply-island.tsx:99,115` · `packages/api-client/src/gen/application_pb.ts:22`
- FE-only quick fix: inline consent next to "Apply now" — one click.
- BE — add `coverLetter: string` + `screeningAnswers: map<string,string>` to `ApplyRequest`; `JobPosting.screeningQuestions: repeated string`. FE renders 500-char Textarea.

### (Cross-dimension) No JD-personalized cover letter draft — see AI-8
- `app/jobs/[id]/apply-island.tsx:97` · `packages/shared/src/chat-stream.ts:25`

---

## Aptitude

### P0 — In-progress answers memory-only; tab crash wipes bank (CX-1)
- `app/aptitude/[applicationId]/page.tsx:108,223` · `app/onboarding/page.tsx:116`
- Mirror `answers` + `results` to localStorage under `aptitude.progress.v1.<applicationId>`, debounced write, hydrate on mount. Same pattern already proven in onboarding.

### P1 — MCQ + free-text sections have no timer (CX-5)
- `app/aptitude/[applicationId]/page.tsx:63,416` · `lib/assessment.ts:40` · `lib/use-countdown.ts:18`
- Global countdown in sticky header using max `timeLimitS`. Auto-submit on expiry via existing `submit.mutate()`.

---

## Interview

### P0 — Lobby environment scan + ID check are no-op stubs (CX-2)
- `app/interview/[applicationId]/lobby/page.tsx:113,119,278` · `app/interview/[applicationId]/proctor-audio.ts:13`
- Live VU meter via AnalyserNode (pattern exists in `startAudioDetector`). Bandwidth/RTT probe via connect-web ping OR `navigator.connection.downlink` + WebRTC ICE timing. Rename ID/environment buttons to "Coming in v3.2" with `warn` gate until wired. Speaker playback tone test.

### P1 — Interview room no reconnect / connection-quality UI (CX-6)
- `app/interview/[applicationId]/page.tsx:179` · `app/interview/[applicationId]/rtc-room.ts:17,85`
- When LiveKit swap lands, subscribe to `ConnectionQualityChanged`/`Reconnecting`/`Reconnected`/`Disconnected`. Add network pill to HUD. Soft-blocking "Reconnecting…" overlay with max-wait cap. BE — save partials on `Reconnecting` >30 s.

### P2 — Interview room has no question-navigation or Iris state (CX-14)
- `app/interview/[applicationId]/page.tsx:326` · `app/interview/[applicationId]/rtc-room.ts:7` · `components/interview-captions.tsx:1`
- BE — LiveKit data channel `{type:'question_meta', index:N, total:M}` event per question. FE renders "Question 3 of 12" + Iris state pill (listening/thinking/speaking) driven by remoteSpeaking + short thinking inference.

### P3 — `components/device-precheck.tsx` is redundant fallback (CX-15)
- `app/interview/[applicationId]/page.tsx:321` · `components/device-precheck.tsx:15` · `app/interview/[applicationId]/lobby/page.tsx:130`
- At `/interview/{id}` phase=precheck: if no lobby-completed marker in session, replace to `/interview/{id}/lobby`. Delete `device-precheck.tsx` and import.

---

## Outcome / growth

### P1 — Dashboard renders 'Interview · Job {id}' — proto lacks title + company (CX-4)
- `components/dashboard.tsx:351,410` · `components/dashboard-parts.tsx:41` · `packages/api-client/src/gen/application_pb.ts:101` · `packages/api-client/src/gen/recommendation_pb.ts:55`
- BE — extend `ApplicationResponse` with `{jobTitle, companyName, companyId}` (pattern exists on `messaging_pb.ts:110-115`). Same for `Match`.

### P2 — Outcome "See next steps" loops back to same journey (CX-12)
- `app/applications/[id]/outcome/page.tsx:255` · `app/applications/[id]/page.tsx:194`
- Rewrite CTA honestly ("Message the reviewer" / "Return to applications") OR BE — extend Application with `next_action: string`. FE renders on outcome + timeline.

### P2 — Growth feedback flat gaps, no cohort/benchmark (CX-13)
- `components/growth-feedback-panel.tsx:54,78` · `app/practice/types.ts:1`
- BE — per-strength/per-gap `severity: 'polish' | 'notable' | 'blocker'`. FE three visual tones. Optional cohort anchor "60% of candidates work on this". No score.
