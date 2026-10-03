# Strategic bets (1–3 months each)

All findings with `horizon = strategic-1-3-months`, sorted `priority DESC, complexity ASC`. Each is a multi-team, multi-PR effort.

---

## P1

### CX-6 · Interview room reconnect + connection-quality UI
- `app/interview/[applicationId]/page.tsx:179,85` · `app/interview/[applicationId]/rtc-room.ts:17`
- Depends on the real LiveKit swap landing (rtc-room.ts:31 today returns `makeFakeRoom`).
- FE work after LiveKit lands: subscribe to `ConnectionQualityChanged`, `Reconnecting`, `Reconnected`, `Disconnected`. Mirror to a network pill in the HUD strip alongside face/gaze/mic/integrity. Soft-blocking "Reconnecting…" overlay during transient drops (adaptive-stream typically <5 s) with max-wait cap.
- BE — save partials on `Reconnecting` >30 s so a session can end gracefully; expose a "resume-if-possible" endpoint the FE polls on reconnect.
- Complexity is high because it's a mid-flow-recovery contract across three surfaces (client RTC handler, server proctor pipeline, audit posture). But it directly addresses the brief's "interview reconnect" item on the hardest-stakes flow.

### AI-10 · Recruiter copilot (chat-with-your-data, bounded, citation-anchored)
- `components/company-shell.tsx:120` · `packages/shared/src/chat-stream.ts:25` · `packages/api-client/src/gen/chat_pb.ts:55`
- FE-only phase-1: `<RecruiterCopilot/>` reusing `SharedAssistantChat` mounted in CompanyShell as bottom-anchored dock, wired to same `api.chat.chat` stream. Answers 'how do I …' with citations pointing to `/ai-explainability` and other docs.
- BE phase-2: scoped chat RPC that can call read-only tools server-side (listApplicants, listJobs, getReport, getFunnelAnalytics, getNoGhostingKpis, getJobScoreDistribution). Response citations use the existing `Citation{url, topic}` shape. Bounded means the tool set is finite + read-only; evidence-cited means every claim links to a fetched resource.
- Phase-3: extend with "why is this candidate ranked N?" prompts that call `getReport` + `getJobRankedCandidates` and quote executive-summary text.

---

## P2

### CX-14 · Interview question navigation + Iris state indicators + auto-clip highlights
- `app/interview/[applicationId]/page.tsx:326` · `app/interview/[applicationId]/rtc-room.ts:7` · `components/interview-captions.tsx:1` · `app/company/jobs/[id]/applicants/[appId]/page.tsx:722`
- BE — on LiveKit data channel, emit `{type: 'question_meta', index: N, total: M}` with every new question. Recruiter-side: emit `report_highlights: repeated {start_s, end_s, label}` on the report/timeline for the top-3 auto-clip moments.
- FE — HUD stage top-bar renders "Question 3 of 12" next to the timer. Iris state pill ('listening' / 'thinking' / 'speaking') driven by `remoteSpeaking` + short 'thinking' inference (silence + pending agent answer). Recruiter-side: "jump to strongest answer" strip above the video seeks by `start_s`.
- Keep strict-two-controls invariant — these are read-only indicators.

---

## P3

### RF-12 · Server Actions for apply / login / register / aptitude / updateProfile
- `app/login/page.tsx:75` · `app/jobs/[id]/apply-island.tsx:59` · `app/aptitude/[applicationId]/page.tsx:170` · `app/profile/page.tsx:194` · `components/dashboard.tsx:91`
- Backend transport is Python + gRPC and cannot receive Server Actions directly. Bridge required.
- BE — expose thin REST proxies (Next.js Route Handlers under `/app/api/**`) that forward to the existing gRPC endpoints and thread the bearer token through. Highest-volume mutations first: apply, save, submitAptitude, updateProfile, register, login.
- FE — convert affected forms to `<form action={applyAction}>` + `useActionState`. Client-side `inFlight` refs + manual busy states disappear. Apply Dialog pairs with `useOptimistic` for instant paint.
- Only pursue if the transport team is willing to expose REST-shaped equivalents. Alternative: keep client-side `useMutation` + adopt `useActionState` for progressive-enhancement patterns where possible.
