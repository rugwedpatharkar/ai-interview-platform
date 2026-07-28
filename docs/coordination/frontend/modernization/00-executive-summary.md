# Executive Summary — Aptura FE Modernization

109 findings, 8 dimensions. Every bullet cites `dimension.priority.horizon` + primary file anchor.

## Top 5 quick wins (1–3 days each, ranked by impact-to-cost)

1. **Wire `getJobRankedCandidates` into the pipeline board** — flagship AI feature is dark today; recruiter sees only handle + state. `ai-features.P0.qw` + `recruiter-ux.P1.qw` — `app/company/jobs/[id]/page.tsx:94`, `packages/api-client/src/gen/recommendation_pb.ts:130`.
2. **Hydrate dashboard `Recommended role` cards with real title/company** — the single most visible AI surface reads as three identical placeholders. `ai-features.P0.qw` — `components/dashboard.tsx:83`, `components/dashboard.tsx:411`.
3. **Persist aptitude answers to `localStorage` per applicationId** — one-shot proctored bank; a tab crash wipes everything today. `candidate-ux.P0.qw` — `app/aptitude/[applicationId]/page.tsx:108`.
4. **Give the interview + aptitude timers `role="timer"` + polite milestone announcements** — screen-reader users have no clock on either graded flow (WCAG 2.4.3, 4.1.3). `a11y.P0.qw` — `app/interview/[applicationId]/page.tsx:338`, `components/coding-section.tsx:58`, `lib/use-countdown.ts:22`.
5. **Add `aria-invalid` + `aria-describedby` + focus-to-first-error to the auth Field across 7 pages** — every auth screen fails WCAG 3.3.1 today. `a11y.P0.qw` — `components/auth/auth-card.tsx:88`, `packages/ui/src/field.tsx:11`.

Runners-up worth grouping into the same sprint: fix apply-flow deep-link (`?next=` → `?redirect=`; `candidate-ux.P1.qw` — `apply-island.tsx:89`), turn off `refetchOnWindowFocus` in the shared QueryClient (`perf.P1.qw` — `packages/shared/src/query.ts:3`), `dynamic()` the Dashboard on the marketing home (`perf.P1.qw` — `app/page-client.tsx:6`), start-transition the marketplace filters (`react-features.P1.qw` — `app/jobs/marketplace.tsx:49`).

## Top 5 medium wins (1–3 weeks each)

1. **Restructure `/` landing to RSC + client islands** — 1,600 LOC of static prose ships as one client component today; blocks LCP on the primary acquisition surface. `react-features.P0.med` — `app/page.tsx:4`, `components/landing/landing-page.tsx:1`.
2. **Wire the interview lobby's real environment scan / VU meter / bandwidth probe** — the pre-flight lies today (returns `pass` without measuring anything). `candidate-ux.P0.med` — `app/interview/[applicationId]/lobby/page.tsx:113`, `proctor-audio.ts:13`.
3. **Extract post-job/edit-job draft persistence + navigation guard** — highest-stakes recruiter form loses data on any accidental client nav. `recruiter-ux.P1.qw` (grouped with medium-scope shared `useDraftForm` hook) — `app/company/jobs/new/page.tsx:45`, `app/company/jobs/[id]/edit/page.tsx:69`.
4. **Lazy-bind `createClients` inside `AuthProvider`** — 313 kB shared chunk ships to every marketing/legal route today. `react-features.P1.med` + `perf.P2.med` — `packages/shared/src/auth.tsx:93`, `app/layout.tsx:53`.
5. **Add candidate compare (saved-jobs) + recruiter compare (shortlist)** — feature named in brief; recruiter must tab-switch three full-page reports today. `ai-features.P1.med` + `candidate-ux.P2.med` — `app/company/jobs/[id]/applicants/[appId]/page.tsx:135`, `app/saved/page.tsx:129`.

## Top 5 strategic bets (1–3 months)

1. **Recruiter copilot with tool-scoped chat + evidence citations** — `ChatService` streaming is candidate-only; the whole recruiter side has no ask-your-data surface. `ai-features.P1.strat` — `components/company-shell.tsx:120`, `packages/api-client/src/gen/chat_pb.ts:55`.
2. **Interview room reconnect + connection-quality HUD** — one-shot proctored flow has no listener on ICE state; a 15-second Wi-Fi hiccup terminates today. `candidate-ux.P1.strat` — `app/interview/[applicationId]/rtc-room.ts:17`, `app/interview/[applicationId]/page.tsx:179`.
3. **Server Actions for apply/login/aptitude/updateProfile** — needs BE REST proxy behind gRPC; unlocks progressive enhancement + native form flow. `react-features.P3.strat` — `app/login/page.tsx:75`, `app/jobs/[id]/apply-island.tsx:59`.
4. **Interview question navigation + Iris state + auto-clip highlights** — HUD is timer + chips only; candidate has no sense of position, recruiter has no jump-to-evidence on the recording. `candidate-ux.P2.strat` + `ai-features.P1.med` — `app/interview/[applicationId]/page.tsx:326`, `app/company/jobs/[id]/applicants/[appId]/page.tsx:722`.
5. **Practice → interview coaching bridge** — Practice and Interview are semantic siblings but architecturally disconnected; the interview lobby has no personalized readiness signal. `ai-features.P2.med` — `app/practice/page.tsx:1`, `app/interview/[applicationId]/lobby/`.

## Ranking notes (cross-dimension tradeoffs)

- Recruiter pipeline ranking + dashboard recommendation-hydration are P0 despite being 1-day fixes because they turn dark AI plumbing into user-visible product. They beat every P1 in isolation.
- WCAG timer + auth-field a11y are P0 because they block AT users from completing graded flows — legal exposure, not just polish.
- The landing-page RSC restructure (RF-2) is P0 because it directly blocks LCP on the top-of-funnel acquisition page; ranked above the interview lobby stub only because it's shipping to every visitor today, whereas the lobby stub is on a gated flow.
- Recruiter aggregate messages inbox (`RX-3`) is a P1 quick-win but not top-5 because the compounding value shows up alongside `no-ghosting-KPI` render (`RX-2`) — ship them together.
- Every "compare" surface is medium: candidate saved-job compare + recruiter shortlist compare share primitives.
- React Compiler enablement (`RF-9`) is a P2 quick-win with disproportionate downstream benefit; drop into the same sprint as the countdown-cascade fix (`RF-5`).
