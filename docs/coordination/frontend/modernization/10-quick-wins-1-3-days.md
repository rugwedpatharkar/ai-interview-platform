# Quick wins (1–3 days each)

All findings with `horizon = quick-win-1-3-days`, sorted `priority DESC, complexity ASC`. Every item has enough anchor + sketch to open a PR without a follow-up read.

Complexity is `low` for all quick-wins.

---

## P0

### CX-1 · Aptitude in-progress answers memory-only
- `app/aptitude/[applicationId]/page.tsx:108,223`
- Mirror `answers` + `results` to `localStorage['aptitude.progress.v1.<applicationId>']` with debounced write; hydrate before rendering questions; clear on `submit.isSuccess`. Same shape as `onboarding/page.tsx:116-123` `PROGRESS_KEY`.

### AI-1 · Dashboard 'Recommended role' placeholders
- `components/dashboard.tsx:83,411,417` · `packages/api-client/src/gen/recommendation_pb.ts:57`
- Batch `useQueries` over top-3 matches calling `api.jobs.getJob({jobId})` (staleTime 5 min). Replace literal "Recommended role" with real title + company; render 2–3 reasons as pill chips.

### AI-2 / RX-1 · Recruiter pipeline never calls `getJobRankedCandidates`
- `app/company/jobs/[id]/page.tsx:60,94,203` · `packages/api-client/src/gen/recommendation_pb.ts:130`
- Parallel `useAuthedQuery(['ranked', id], () => api.recommendations.getJobRankedCandidates({jobId: id}))`. Build `Map<candidateUserId, {score, reasons[]}>`. Sort each lane by score desc. Render `ScoreRing` mini + first reason chip on each card. `['ranked', id]` cache key already invalidated by override mutation (page.tsx:110).

### AY-1 · Timer ARIA on interview + aptitude
- `app/interview/[applicationId]/page.tsx:338` · `components/coding-section.tsx:58` · `lib/use-countdown.ts:22`
- `useCountdown` returns `{display, secondsLeft}`. Wrap timer spans in `role="timer" aria-label="Time remaining"`. Add sr-only `<div role="status" aria-live="polite">` announcing "5 minutes", "1 minute", "30 seconds", "10 seconds" remaining on threshold crossings; throttled by ref.

### AY-2 · Auth Field aria-invalid + focus-to-first-error
- `components/auth/auth-card.tsx:88-148` · `packages/ui/src/field.tsx:11-68`
- Migrate auth-card Field to `@ip/ui`'s Field (already injects aria-invalid + aria-describedby via cloneElement). In each auth page's onSubmit catch, set per-field error map and `document.getElementById(id)?.focus()` on first invalid input.

---

## P1

### RF-1 · Split `aperture-chrome.tsx` — MegaFooter + MarketingShell → RSC
- `packages/ui/src/aperture-chrome.tsx:1,42,231,316`
- Three files: `aperture-chrome/mega-nav.tsx` (`"use client"`), `mega-footer.tsx` (server), `marketing-shell.tsx` (server). Re-export from `aperture-chrome/index.ts`.

### RF-3 · Add `loading.tsx` beside heavy client pages
- New files: `app/aptitude/[applicationId]/loading.tsx`, `app/applications/[id]/loading.tsx`, `app/company/jobs/[id]/applicants/[appId]/loading.tsx`, `app/profile/loading.tsx`, `app/messages/loading.tsx`, `app/onboarding/loading.tsx`, `app/interview/[applicationId]/loading.tsx`
- Each renders the in-page `<Skeleton>` / `<LoadingState>` composition; strip the corresponding in-page loading branch.

### RF-5 · Aptitude countdown cascade
- `lib/use-countdown.ts:37` · `app/aptitude/[applicationId]/page.tsx:63,357`
- Move countdown into a leaf `<CodingTimer />` — or lift `useCountdown` to render only the `mm:ss` `<Badge>` at `coding-section.tsx:59-61`.

### RF-6 · Marketplace filter `startTransition`
- `app/jobs/marketplace.tsx:49,56,123`
- Wrap `applyParams` body in `startTransition`. Use `isPending` from `useTransition` for the "updating" hint alongside existing `placeholderData: (prev) => prev`.

### PF-1 · Disable `refetchOnWindowFocus` in QueryClient
- `packages/shared/src/query.ts:3-11`
- `queries: { staleTime: 60_000, gcTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: 'always' }`.

### PF-2 · Home route lazy-load Dashboard
- `app/page-client.tsx:6,27`
- `const Dashboard = dynamic(() => import('../components/dashboard').then(m => m.Dashboard), { ssr: false, loading: () => null });`

### CX-3 · Signed-out apply deep-link
- `app/jobs/[id]/apply-island.tsx:89`
- Change `?next=/jobs/${jobId}` → `?redirect=/jobs/${jobId}`. Optionally teach `login/page.tsx:57` to fall back to `sp.get('next')`.

### CX-5 · Aptitude MCQ + free-text timer
- `app/aptitude/[applicationId]/page.tsx:63,416` · `lib/assessment.ts:40`
- Global countdown in sticky header near "Assessment" h1 using max `timeLimitS`. Auto-submit on expiry via existing `submit.mutate()`.

### RX-2 · Analytics — wire unused RPCs
- `app/company/analytics/page.tsx:27,149` · `packages/api-client/src/gen/analytics_pb.ts:35,108`
- Add `useQuery(getNoGhostingKpis({}))` rendering 5-stat band above funnel. Per-role `useQuery(getJobScoreDistribution({jobId}))` rendering p25/p50/p75 pills.

### RX-3 · Aggregate messages inbox
- `app/company/messages/page.tsx` (new) reusing `createMessagesClient(api).listThreads()`. Two-pane inbox: thread list left, `MessageThreadView` right. Add sidebar entry to `NAV_WORKSPACE` in `company-shell.tsx` with unread badge.

### RX-4 · Post/Edit job draft persistence + nav guard
- `app/company/jobs/new/page.tsx:45,127` · `app/company/jobs/[id]/edit/page.tsx:69,77`
- Extract `useDraftForm(key, initialValues)` in `lib/use-draft-form.ts` — localStorage mirror + rehydrate + `beforeunload` + Next `useOnBeforeNavigate` guard. Keys `job:new:${identity.id}` and `job:${jobId}:edit:${identity.id}`.

### RX-5 · JD Improve non-destructive
- `app/company/jobs/new/page.tsx:88,214`
- Snapshot `v.jdText` to `previousJdText` ref before improve. After `onSuccess` render `<Notice>` "AI improved your draft. Keep · Revert." Revert restores from ref.

### RX-6 · Advance decision reason
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:449,754`
- Reuse `ReasonDialog` with `ADVANCE_REASONS = ['strong_fit', 'proceed_with_reservation', 'strategic_role', 'other']`. Keep confirm enabled without a reason code so speed preserved.

### RX-10 · Talent search symmetric filters
- `app/company/talent/page.tsx:52,59,118`
- `active = params.query.trim().length > 0 || Boolean(params.stage)`. Debounce keyword 250 ms; remove Search button as required commit.

### RX-11 · Talent drawer link to applications
- `app/company/talent/page.tsx:439`
- BE handoff: widen `CandidateHit` with `repeated ApplicationRef applications = 6`. FE renders Applications list linking to `/company/jobs/{jobId}/applicants/{appId}`.

### AI-4 · CompanyShell ⌘K palette
- `components/company-shell.tsx:149` · `components/candidate-shell.tsx:92,229` · `components/command-palette.tsx:14`
- Extract ⌘K keydown effect + `<CommandPalette/>` into shared hook, or duplicate 20-line block into `company-shell.tsx` (nav = `NAV_HIRING + NAV_WORKSPACE`). Feed palette a recent-viewed jobs/candidates index (localStorage or `['job', id]` cache keys).

### AI-5 · Job detail skill-gap
- `app/jobs/[id]/job-detail-sidebar.tsx:42`
- Client island: `useAuthedQuery(getProfile)`, compute `matched = intersection(profile.skills, job.skills)` and `missing = difference(...)`. Render "You match {matched.length}/{job.skills.length}" + matched/missing chips + "Add {missing[0]} to your profile" link. Render nothing when signed-out.

### AI-9 · JobCard match score in marketplace
- `components/onboarding/candidate-checklist.tsx:59` · `components/job-card.tsx:49` · `app/jobs/marketplace.tsx:1`
- Fetch `getCandidateRecommendations` in marketplace (cached), build `Map<jobId, {score, reasons[]}>`. Pass `matchScore` + `topReason` into JobCard. Render `ap-pill '{Math.round(score*100)}% match'`. Add "Sort by: Best match" toolbar.

### AY-3 · Skip-to-content on interview + aptitude routes
- `app/aptitude/[applicationId]/page.tsx:242` · `app/interview/[applicationId]/page.tsx:261,lobby/page.tsx:166,done/page.tsx:31`
- Extract `<SkipToContent targetId="main" />` into `@ip/ui`. Drop into each of those pages above `<header>`. Add `id="main" tabIndex={-1}` to each `<main>`.

### AY-4 · Alert role by tone
- `packages/ui/src/alert.tsx:87-98`
- Pick role by tone: danger → `role="alert" aria-live="assertive"`; success/info/warning → `role="status" aria-live="polite"`. Optional `announce={false}` escape hatch.

### AY-5 · Badge solid contrast
- `packages/ui/src/badge.tsx:20-50` · `packages/ui/src/styles/tokens.css:40-42,117-130`
- Add `--danger-strong` / `--success-strong` / `--info-strong` at L≈0.42–0.44. Solid variant uses `-strong` fill. Verify via Chrome DevTools contrast checker.

### AR-1 · `useMessagesClient()` + `useThreads()` hook
- `lib/use-messages.ts` (new) wrapping `createMessagesClient(api)` + shared 30 s poll over `listQueryKey()`. Replace six `useMemo` blocks + five `useQuery` blocks in candidate-shell, applications/[id], applicants/[appId], messages pages, message-thread-view.

### AR-3 · `useApplications()` + `useApplication(id)` hook
- `lib/use-applications.ts` (new) wrapping the `listMyApplications` query with the exponential 10s→60s backoff. Consumed by `components/dashboard.tsx:71` and `app/applications/[id]/page.tsx:130`.

### AR-4 · Landing bodies drop `"use client"`
- `components/landing/company-body.tsx:1`, `candidate-body.tsx:1,81`
- Remove `"use client"` from `company-body.tsx`. Split search bar out of `candidate-body.tsx` into `<LandingSearchIsland>` (~25 LOC). Outer becomes RSC. Verify with `next build`.

### AR-5 / PF-10 · Widen `optimizePackageImports`
- `next.config.ts:11`
- `optimizePackageImports: ["lucide-react", "@ip/ui", "@ip/shared", "@tanstack/react-query", "@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-select", "@radix-ui/react-tabs", "@radix-ui/react-tooltip", "@radix-ui/react-checkbox", "@radix-ui/react-radio-group", "@radix-ui/react-label"]`.

---

## P2

### RF-7 · SimilarRoles → async server component
- `app/jobs/[id]/similar-roles.tsx:1,22` · `app/jobs/[id]/page.tsx:94`
- `async function SimilarRoles({ companyId, excludeJobId })` awaiting `companyJobs(companyId)`. Wrap in `<Suspense fallback={<SimilarRolesSkeleton/>}>`. Only client leaf remains `<SaveJobButton>` inside each `<JobCard>`.

### RF-8 · `useOptimistic` for thread messages
- `packages/shared/src/use-thread-messages.ts:90,94`
- `useOptimistic(messages, (state, next) => [...state, next])`. Remove local optimistic state, inFlight ref, manual rollback.

### RF-9 · Enable React Compiler
- `next.config.ts:10-12`
- Add `experimental: { reactCompiler: true }`. Install `babel-plugin-react-compiler`. Run build; verify healthcheck. Once stable, delete hand-authored `useMemo`/`useCallback` in `dashboard.tsx:124-149`, `profile/page.tsx:218`, `marketplace.tsx sameParams`.

### RF-10 · Profile form `startTransition`
- `app/profile/page.tsx:89,162,230,375`
- Wrap `setForm` in `startTransition`. Alt: extract ExperienceRow/EducationRow/SkillChips leaves with local state that reports up on blur.

### PF-3 · `/companies/[id]` parallel fetches
- `app/companies/[id]/page.tsx:42-53`
- `const [profileR, jobsR] = await Promise.allSettled([companyProfile(id), companyJobs(id)])`. Preserve 404 → notFound() on profile.

### PF-4 · Company onboarding parallel finish
- `app/company/onboarding/page.tsx:118-178`
- Collect createJob + invite promises into one `Promise.allSettled([...])`. Preserve individual failure reporting.

### PF-5 · Preload Clash Display 700
- `app/layout.tsx:47-48`
- Add `<link rel="preload" href="/fonts/clash-display-700.woff2" as="font" type="font/woff2" crossOrigin="" />`. Optionally decide `.ap-h1` at 800: add face or drop to 700.

### CX-9 · Onboarding step 3 skip flow
- `app/onboarding/page.tsx:288,486,563`
- `canAdvance = step === 3 ? true : ...`. Rename Continue to "Skip this step" when no resume uploaded.

### CX-11 · Marketplace filter chip strip
- `app/jobs/marketplace.tsx:82,101` · `components/filter-sidebar.tsx:183`
- Chip strip near sort tabs. One dismissable chip per active facet (`remote`, `type`, `level`, `q`, `location`) with X to clear just that one.

### RX-7 · Extract `<JobForm />`
- `app/company/jobs/new/page.tsx:128,347` · `app/company/jobs/[id]/edit/page.tsx:207,348`
- Move REMOTE, EMPLOYMENT, GateRadio, sections 1..5 JSX into `app/company/jobs/job-form.tsx`. Both pages become 30-line shells passing initial value + mutation.

### RX-9 · Talent min_score UI
- `app/company/talent/page.tsx:100` · `app/company/talent/sourcing-client.ts:78`
- `<Field label='Min fit'>` with Select (Any / >=50% / >=70% / >=85%) setting `params.minScore` in submit path.

### RX-13 · Decision undo grace
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:218,449`
- 5-second delayed commit: on click show toast with countdown "Rejecting Alice · Undo"; fire RPC after 5 s if not cancelled. `setTimeout` + `AbortController`.

### RX-14 · Jobs list search + sort
- `app/company/jobs/page.tsx:110,170`
- `<Input placeholder='Search roles by title...'>` client-filtering `list` on `job.title.toLowerCase().includes(q)`. `<Select>` for sort (Most recent / Most applicants / A–Z).

### RX-15 · Latest postings client sort
- `app/company/page.tsx:181`
- `[...jobList].sort((a,b) => b.postedAt.localeCompare(a.postedAt)).slice(0, 4)`.

### RX-16 · Rubric descriptors localStorage
- `app/company/rubrics/page.tsx:75,311,340`
- Persist descriptors keyed by `${identity.id}:rubric:${editingId ?? 'new'}`. Two effects: save on change; hydrate on `loadForEdit`.

### DS-1 · `accent-brand` fix
- `app/company/jobs/new/page.tsx:375` · `app/company/jobs/[id]/edit/page.tsx:376`
- Rename `accent-teal` → `accent-brand`, or hide `sr-only` native input and use outer label as visual.

### DS-3 · Table density prop
- `packages/ui/src/table.tsx:9`
- Add `density?: 'comfortable' | 'compact'`. Compact = `px-3 py-1.5`. Adopt on audit + team + talent + billing.

### DS-7 · Split `layout.tsx`
- `packages/ui/src/layout.tsx:1`
- Two files: `layout-shell.tsx` ("use client", AppShell only) and `layout-states.tsx` (no directive, PageHeader/Heading/EmptyState/ErrorState/LoadingState/SuccessState). Re-export from `index.ts` unchanged.

### DS-10 · Applicant TabButton → Radix Tabs
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:536,275`
- Swap for `@ip/ui` Tabs/TabsList/TabsTrigger/TabsContent. Add `?tab=…` URL sync (mirrors `/settings`). Delete local `TabButton`.

### AY-7 · Same as DS-10
Ships together.

### AY-10 · Integrity pips → focusable buttons
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:664-686`
- Replace `<span>` with `<button aria-label="{signalLabel} at {toLocaleTimeString}, {sevLabel}" onClick={() => scrollTo(articleRef.current[i])}>`. Wire click to scroll matching article + focus its heading.

### AY-11 · Onboarding step focus + announce
- `app/onboarding/page.tsx:92,255,297`
- `stepHeadingRef = useRef<HTMLHeadingElement>(null)` on `<h1>`; `useEffect(() => { stepHeadingRef.current?.focus() }, [step])`. Add sr-only live-polite announcing step title on change.

### AY-12 · Radix Select label association
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:807-833` · `app/profile/page.tsx:445-460`
- Use `@ip/ui` `<Field label="Reason" htmlFor="decide-reason">` OR `<label htmlFor="decide-reason">` + `<SelectTrigger id="decide-reason">`.

### AY-14 · Auth submit focus
- `app/login/page.tsx:70,100` · `app/register/page.tsx:33,64` · `components/auth/auth-card.tsx:150`
- Add `tabIndex={-1}` to Notice; in each onSubmit catch after `setError` → `errorRef.current?.focus()` or `scrollIntoView({block:'start', behavior:'smooth'})`. Combined with AY-2, either focuses invalid field or top-level banner.

### AR-2 · `ApiClients` type consolidation
- `app/messages/messages-client.ts:50` · `app/notifications/notifications-client.ts:69` · `lib/practice-client.ts:39,job-alerts-client.ts:130,saved-jobs-client.ts:90`
- Replace 5 local `type Api` aliases with `import type { ApiClients } from "@ip/shared"`.

### AR-6 · `@/*` alias codemod
- `tsconfig.json:11` — codemod deep relative chains (depth ≥ 3) to `@/`. Add ESLint `no-restricted-imports` `patterns: ["../../../*"]`. Note in CLAUDE.md.

### AR-7 · Split applicant report page
- `app/company/jobs/[id]/applicants/[appId]/page.tsx:577,622,754`
- Colocate `_components/integrity-band-section.tsx`, `_components/competency-card.tsx`, `_components/reason-dialog.tsx`. Leading-underscore folders are Next 15-router-ignored.

### AR-10 · Turbo pipeline outputs
- `turbo.json:15`
- `typecheck: { outputs: ["**/*.tsbuildinfo"], inputs: [...] }` — drop `dependsOn: ["^build"]`. `lint: { outputs: [".eslintcache"] }`. `test: { outputs: ["coverage/**"] }`.

### AR-12 · markRead error handling
- `app/messages/page.tsx:85`
- `catch (err) { if (isAborted(err)) return; recordError(err); }`. `recordError` from `@ip/shared observability.ts`.

---

## P3

### RF-11 · Landing IO → CSS `animation-timeline: view()`
- `components/landing/landing-page.tsx:39,52`
- Move reveal into CSS with `animation-timeline: view()` + `animation-range: entry 20% cover 40%`. Fallback to permanent "in" state. Delete JS observer.

### PF-8 · ApertureSprite tree-shake
- `app/layout.tsx:52` · `packages/ui/src/aperture-sprite.tsx:8`
- Tree-shake to only glyphs referenced by `<ApIcon>`; move unused into per-component sub-sprites. Or hoist into signed-in layouts and drop from marketing/legal.

### PF-9 · Notification bell + feed cache writeback
- `packages/ui/src/notification-bell.tsx:83` · `app/notifications/page.tsx:33`
- Feed's `select` or `onSuccess` writes back: `qc.setQueryData(notificationKeys.unread(), data.unreadCount)`.

### CX-15 · Delete `device-precheck.tsx` + strict-lobby redirect
- `app/interview/[applicationId]/page.tsx:321` · `components/device-precheck.tsx:15`
- At `/interview/{id}` phase=precheck: replace to `/interview/{id}/lobby` if no lobby-completed session marker. Delete component + import.

### RX-18 · Job form sticky TOC
- `app/company/jobs/new/page.tsx:129,194`
- Add `id='section-1'..'section-5'` to each `<section>`. Sticky left rail on lg+ (top-24) with 5 anchor links + IntersectionObserver scroll-spy.

### RX-19 · `parseSkills` `useMemo`
- `app/company/jobs/new/page.tsx:240,242`
- `const skills = useMemo(() => parseSkills(skillsRaw), [skillsRaw]);` — reuse `skills` in JSX + mutation body.

### RX-20 · Live char counter
- `app/company/jobs/[id]/applicants/[appId]/schedule/page.tsx:410`
- Add `hint` prop to `Field` rendering `{value.length} / {max}` right-aligned mono-numeric.

### DS-6 · `fontFamily` codemod
- 41 sites across the app (`sample-report/page.tsx:19` etc.)
- Codemod: replace `style={{ fontFamily: 'var(--font-display)' }}` and `var(--font-mono)` with `font-display` / `font-mono` class merge.

### DS-8 · Local Avatar delete
- `app/company/jobs/[id]/page.tsx:271`
- Delete `function Avatar({ handle })`. Replace calls with `<Avatar name={candidateHandle(a.candidateUserId)} size='sm' className='font-mono' />` from `@ip/ui`.

### DS-9 · Marketing-shadow token
- Add `--elev-marketing` to `tokens.css`; expose via `@theme inline`. Replace 5 sites with `shadow-elev-marketing`.

### DS-11 · `bg-[var(--brand)]` codemod
- Codemod: `bg-[var(--brand)]` → `bg-brand`; `-strong` / `-soft`; same for `text-` / `border-`. 26 sites.

### DS-12 · TabsList `variant='segmented'`
- `packages/ui/src/tabs.tsx`
- Add `variant?: 'default' | 'segmented'`. Adopt on `settings/page.tsx:43` + `company/settings/page.tsx:31`.

### DS-13 · `<PreLaunchBadge />` env-gated
- `components/company-shell.tsx:151` · `components/candidate-shell.tsx`
- Extract; render when `process.env.NEXT_PUBLIC_LAUNCH_PHASE !== 'live'`.

### AY-13 · NotificationItem `<a>` semantic
- `packages/ui/src/notification-item.tsx:60`
- Change row to `<a href={link ?? "#"} onClick={(e) => { if (!link) e.preventDefault(); onClick?.(); }}>`.
