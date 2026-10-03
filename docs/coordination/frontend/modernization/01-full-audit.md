# Full FE Modernization Audit — 109 findings

Grouped by dimension → priority (P0 → P3). Each block preserves every field from the raw discovery.

---

## Dimension 1 — React 18/19 + Next 15 feature adoption

### P0

#### RF-2 — Landing page ships 1,600 LOC of static marketing tree as one client component
- category: server-components
- complexity: medium
- needs_backend: false
- horizon: medium-1-3-weeks
- estimated_improvement: Move ~1,600 LOC of static marketing from client → server tree; landing First Load JS on / trims by the majority of the landing `page-*` chunk (currently the largest per-route chunk at 27 KB) and unblocks LCP for the primary acquisition surface.
- file anchors: `frontend/apps/candidate/app/page.tsx:4`, `frontend/apps/candidate/app/page-client.tsx:23`, `frontend/apps/candidate/components/landing/landing-page.tsx:1`, `frontend/apps/candidate/components/landing/candidate-body.tsx:1`, `frontend/apps/candidate/components/landing/company-body.tsx:1`
- current state: `landing-page.tsx:1` declares `"use client"` and mounts the entire `/` and `/hiring-teams` marketing surface. `candidate-body.tsx` (492 LOC) and `company-body.tsx` (866 LOC) are also `"use client"`. `company-body.tsx` has ZERO client hooks; `candidate-body.tsx` has three `useState` uses only for hero search form (lines 82–91). The rest is static prose + CSS chrome.
- problem: The main SEO/LCP surface — signed-out landing served to every organic visitor — ships every JSON tree as a client component so it can't be prerendered statically as HTML+CSS. The hero search form has three lines of state; the rest is prose that Next 15 could serve as pure HTML with a tiny hydration island.
- root cause: The audience switch, scroll-reveal IntersectionObserver, mobile menu, and announcement dismiss are all in `landing-page.tsx` (lines 42–108), so its `"use client"` pragma leaks to every child, forcing candidate-body and company-body to also be client — even though most of their subtree is purely static.
- recommended solution: Restructure into (a) `app/(marketing)/page.tsx` (server) rendering static hero copy, journey, promise, evidence, FAQ, footer as RSCs; (b) `LandingChrome` client island (~40 LOC) for audience switch + mobile burger; (c) `HeroSearchForm` client island (~20 LOC); (d) `ScrollReveal` client island (~15 LOC), or drop the IO and use CSS `content-visibility: auto` + `animation-timeline: view()`. `company-body.tsx` converts to a bare RSC.
- user impact: LCP of acquisition surface drops because marketing HTML paints before ~200 kB of landing JS parses. Signed-out visitors see the hero copy in the SSR document; signed-in candidates redirect to /dashboard sooner.
- business impact: Organic acquisition surface becomes Google-Search-friendly HTML, and SSR-first paint tells crawlers everything. The signed-out → signed-in flash the file's own comment (`page-client.tsx:21-22`) admits is only fixable with less client work is directly addressed.
- react features: Server Components, islands architecture

### P1

#### RF-1 — MegaFooter + MarketingShell forced client-only by co-location with MegaNav
- category: server-components
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Drops the hydrated subtree on every marketing route to just MegaNav's ~120 LOC; measurable INP/TBT improvement on `/jobs`, `/jobs/[id]`, `/companies/[id]`, `/trust`, `/privacy`, `/accessibility`, `/pilot`, `/ai-explainability`, `/what-we-dont-do`.
- file anchors: `frontend/packages/ui/src/aperture-chrome.tsx:1`, `frontend/packages/ui/src/aperture-chrome.tsx:42`, `frontend/packages/ui/src/aperture-chrome.tsx:231`, `frontend/packages/ui/src/aperture-chrome.tsx:316`
- current state: `aperture-chrome.tsx` starts with `"use client"` (line 1) and exports `MegaNav`, `MegaFooter`, and `MarketingShell` from one file. Only `MegaNav` needs client hooks — a single `useState` for the mobile-menu toggle at line 43. `MegaFooter` (231–305) and `MarketingShell` (316–338) are pure static markup/passthroughs.
- problem: The client boundary is drawn one level too coarse. Next.js hydrates the entire top-and-bottom chrome on every marketing route.
- root cause: `"use client"` at the top of the file pulls two purely-presentational exports into the client boundary because they share a file with the one export using `useState`.
- recommended solution: Split into `aperture-chrome/mega-nav.tsx` (`"use client"`), `mega-footer.tsx` (server), `marketing-shell.tsx` (server). Re-export the three from `packages/ui/src/aperture-chrome/index.ts`; the public `@ip/ui` import surface stays unchanged.
- user impact: Faster first paint and lower main-thread work on 8+ public prose surfaces. Google-Jobs-eligible `/jobs/[id]` and public company profiles ship less hydrated JS below the SSR HTML.
- business impact: Marketing SEO surfaces (entire public sitemap) hydrate a smaller React tree — better Core Web Vitals (INP/TBT) on ranking-relevant pages.
- react features: Server Components

#### RF-3 — No `loading.tsx` in the entire app — App Router streaming completely unused
- category: streaming
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Eliminates the JS-parse-gated blank state on 7 heavy routes; typical improvement is 200–400 ms on mid-range Android.
- file anchors: `frontend/apps/candidate/app/template.tsx:6`, `frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx:304`, `frontend/apps/candidate/app/applications/[id]/page.tsx:1`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:1`, `frontend/apps/candidate/app/profile/page.tsx:1`, `frontend/apps/candidate/app/messages/page.tsx:41`
- current state: `find app -name loading.tsx` returns nothing. Only one `error.tsx` exists. Every route below root paints nothing until its client JS parses; heavy pages (aptitude 465 LOC, applications 474 LOC, applicants 856 LOC, profile 674 LOC, onboarding 621 LOC, messages 323 LOC) each render their own in-component skeleton only after JS executes.
- problem: The user perceives a blank content region until Next hydrates the route's bundle. On 300 kB+ per-route bundles that gap is measurable. Next 15's `loading.tsx` streams a Skeleton in the initial HTML immediately.
- root cause: Convention never adopted. Every page implements its own loading branch inside the client component.
- recommended solution: Add `loading.tsx` beside each big client-heavy page: `aptitude/[applicationId]`, `applications/[id]`, `company/jobs/[id]/applicants/[appId]`, `profile`, `messages`, `onboarding`, `interview/[applicationId]`. Each renders the existing `<Skeleton>`/`<LoadingState>` composition; strip the corresponding in-page loading branch.
- user impact: Perceived load latency drops on every gated candidate + recruiter surface. Aptitude in particular — high-stakes, timer-sensitive — shows a Skeleton before its 300 kB client bundle parses.
- business impact: Faster paint; abandonment on aptitude and applicant surfaces drops.
- react features: App Router streaming, Suspense

#### RF-4 — AuthProvider drags @ip/api-client (313 kB shared chunk) onto every marketing route
- category: bundle-size
- complexity: medium
- needs_backend: false
- horizon: medium-1-3-weeks
- estimated_improvement: Removes ~150–200 kB of api-client + `@bufbuild/protobuf` runtime + protobuf descriptors from the marketing First Load JS.
- file anchors: `frontend/apps/candidate/app/layout.tsx:53`, `frontend/apps/candidate/app/providers.tsx:13`, `frontend/apps/candidate/lib/auth.tsx:10`, `frontend/packages/shared/src/auth.tsx:93`, `frontend/packages/shared/src/transport.ts:186`, `frontend/packages/api-client/src/index.ts:216`
- current state: `layout.tsx` renders `<Providers>` → `<AuthProvider>`. `makeAuth` in `packages/shared/src/auth.tsx:81` synchronously constructs `createClients(...)` via a `useMemo` at line 93. `createClients` calls `clientsFromTransport` which instantiates all 28 admin + AI-agents services (AuthService, JobService, ApplicationService, AptitudeService, DecisionService, ProfileService, ReportService, ...). The largest shared chunk (`static/chunks/22-*.js`, 313 kB) contains `@bufbuild/protobuf` descriptor identifiers plus every generated `*_pb` module.
- problem: The primary SEO surface pays a ~313 kB shared-chunk tax for gRPC service clients it never invokes. protobuf-es descriptor initialization alone is a measurable main-thread cost on mid-range mobile.
- root cause: `AuthProvider` mounts unconditionally at the root and eagerly calls `createClients` — the module graph pins every generated `*_pb.ts` and the whole `@connectrpc/connect-web` transport into the layout's client boundary.
- recommended solution: (1) Route grouping: move `AuthProvider` into an `(authed)` route group's layout so marketing tree doesn't include it. (2) Lazy binding: replace the eager `useMemo` at `auth.tsx:93` with a getter that dynamically `await import("@ip/api-client")` on first access.
- user impact: Marketing pages get much smaller First Load JS; INP and TBT on Google-visible pages improve.
- business impact: Public SEO+SEM surface hydrates less code on organic-acquisition traffic.
- react features: Server Components (route grouping), dynamic import boundaries

#### RF-5 — Aptitude countdown cascades into coding `<textarea>` re-renders every 500 ms
- category: concurrent-rendering
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 500 ms → 0 re-renders of the coding-section subtree while the timer runs; keystroke latency becomes device-CPU-bound only.
- file anchors: `frontend/apps/candidate/lib/use-countdown.ts:37`, `frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx:63`, `frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx:357`, `frontend/apps/candidate/components/coding-section.tsx:87`, `frontend/apps/candidate/components/code-editor.tsx:39`
- current state: `use-countdown.ts:37` calls `setRemaining` every 500 ms. State lives in `CodingSectionWithTimer`. Parent inline arrow `onSource={(v) => setAnswers((m) => ({ ...m, [s.id]: { kind: "coding", source: v, language: s.language ?? "python" } }))}` (lines 357–366) recreates identity every tick → cascades to `<textarea onChange>`.
- problem: On the highest-stakes proctored flow, a candidate typing during a timed section drops keystrokes on slower devices. The timer doesn't need to bring the editor along for the ride.
- root cause: Timer state owned above the leaf displaying it; parent recreates callback props every render.
- recommended solution: Move the countdown into a leaf `<CodingTimer />`, or lift `useCountdown` to render only the `mm:ss` `<Badge>` at `coding-section.tsx:59-61`. Alternately enable React Compiler.
- user impact: No dropped keystrokes during a timed coding assessment on mid-range hardware.
- business impact: The most-scrutinised flow (aptitude gate before interview) stops being susceptible to slow-device jank.
- react features: component isolation, React Compiler (alternate)

#### RF-6 — `startTransition` never used — marketplace filter click blocks on router.replace + refetch
- category: concurrent-rendering
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: INP on filter clicks becomes bounded by React's commit (~1 frame) instead of router + refetch.
- file anchors: `frontend/apps/candidate/app/jobs/marketplace.tsx:49`, `frontend/apps/candidate/app/jobs/marketplace.tsx:56`, `frontend/apps/candidate/app/jobs/marketplace.tsx:123`, `frontend/apps/candidate/components/filter-sidebar.tsx:59`
- current state: Grep across `apps` + `packages/{ui,shared}/src` for `startTransition|useTransition|useDeferredValue|useOptimistic` returns zero user-code hits. `setFilters = (next) => applyParams({ ...next, page: 1 })` synchronously calls `router.replace(...)` + TanStack Query key change + refetch — all on the click handler.
- problem: A checkbox click blocks the interaction paint until router replace + query key rebuild + refetch trigger finishes. On slow networks the checkbox appears stuck for hundreds of ms.
- root cause: URL sync + refetch on the same synchronous update as checkbox visual state.
- recommended solution: Wrap `applyParams` body in `startTransition` — checkbox state stays urgent, URL replace + refetch flip to transition. Use TanStack's `isPlaceholderData` for a subtle "updating" hint via `isPending`.
- user impact: Filter chips + sort tabs flip visually instantly; results catch up in the background.
- business impact: Higher engagement with filters; more accurate search-behaviour data.
- react features: useTransition, startTransition

### P2

#### RF-7 — `SimilarRoles` is a client island fetching data the parent server component already knows
- category: streaming
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Eliminates one client-side network waterfall on every `/jobs/[id]` view; removes ~2 kB of TanStack Query wrapping.
- file anchors: `frontend/apps/candidate/app/jobs/[id]/page.tsx:94`, `frontend/apps/candidate/app/jobs/[id]/similar-roles.tsx:1`, `frontend/apps/candidate/app/jobs/[id]/similar-roles.tsx:22`
- current state: `similar-roles.tsx:1` is `"use client"` and runs a TanStack `useQuery` at line 22 calling `companyJobs(companyId)` — the same function the parent SSR page could import server-side. Parent already fetches job detail server-side.
- problem: JD renders → JS parses → useQuery fires → jobs return → similar strip paints. TanStack Query dedup + retry logic isn't needed; the endpoint has `next: { revalidate: 120 }`.
- root cause: Implemented as a client island because `JobCard` renders `SaveJobButton` (client); whole strip could stream in as server child with Suspense.
- recommended solution: Convert to async server component: `async function SimilarRoles({ companyId, excludeJobId })` awaiting `companyJobs(companyId)`. Wrap in `<Suspense>` at `jobs/[id]/page.tsx:94`. Only remaining client island is `<SaveJobButton>` per card.
- user impact: Strip is in the SSR HTML — no client waterfall.
- business impact: Longer time-on-page for `/jobs/[id]`; Google sees related roles in the HTML immediately.
- react features: Server Components, Suspense boundaries, streaming

#### RF-8 — `useOptimistic` (React 19) opportunity in `useThreadMessages` hand-rolled pattern
- category: modernization
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: ~20 LOC deleted; hook becomes React-19-idiomatic and ready for Server Action migration.
- file anchors: `frontend/packages/shared/src/use-thread-messages.ts:90`, `frontend/packages/shared/src/use-thread-messages.ts:94`, `frontend/packages/ui/src/message-thread-view.tsx:82`
- current state: `useThreadMessages` declares its own optimistic state: `useState<OptimisticMessage[]>([])`, `useRef(false)` inFlight latch, manual try/catch that pushes an optimistic row, awaits send, rolls back on error. `MessageThreadView` concatenates `[...messages, ...optimistic]`.
- problem: Manual pattern is ~25 LOC of state + refs + try/catch that React 19's `useOptimistic` collapses into ~5 LOC.
- root cause: Hook predates React 19 and hasn't been modernized.
- recommended solution: Rewrite `useThreadMessages.send` to use `useOptimistic(messages, (state, next) => [...state, next])` — remove local optimistic array, inFlight ref, manual filter-out-tmpId rollback.
- user impact: No visible change; code becomes fit for later Server Actions migration on message-send.
- business impact: Reduces maintenance surface on a critical candidate-facing communication path.
- react features: useOptimistic

#### RF-9 — React Compiler not enabled — codebase memoizes by hand and pays the countdown cascade
- category: compiler-readiness
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Deletes ~50–100 LOC of hand-authored memoization; eliminates cascade re-renders without touching component code.
- file anchors: `frontend/apps/candidate/next.config.ts:10`, `frontend/apps/candidate/components/dashboard.tsx:124`, `frontend/apps/candidate/components/dashboard.tsx:145`, `frontend/apps/candidate/app/profile/page.tsx:218`, `frontend/apps/candidate/app/jobs/marketplace.tsx:24`
- current state: `next.config.ts:10-12` sets only `optimizePackageImports: ['lucide-react']` — no `reactCompiler: true`. React 19.0.0 + Next 15.1.3 both support the compiler as stable. Meanwhile dashboard hand-authors `useMemo` on list + `useCallback` on withdraw, marketplace uses `sameParams` deep-JSON compares, profile uses `useMemo` on a two-line ring style object. Only 3 exhaustive-deps disables exist across the app source — all compiler-compatible.
- problem: Every hand-written useMemo/useCallback is a place where the compiler would do the same work more thoroughly.
- root cause: Compiler released after codebase was authored, never trialled.
- recommended solution: Add `experimental: { reactCompiler: true }`, install `babel-plugin-react-compiler`. Run build; compiler emits healthcheck. Likely bailouts: `.current +=` in effects (profile:125, use-thread-messages:79) — both effect-internal and safe.
- user impact: Consistent memoization removes re-render-bug class that memo-by-hand misses — including the 500-ms coding-editor cascade.
- business impact: Fewer perf-related incidents on aptitude/coding; less bespoke memoization to review.
- react features: React Compiler

#### RF-10 — Profile page: 674-LOC form re-renders on every keystroke; typing lags on slow devices
- category: concurrent-rendering
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Keystroke handling becomes bounded by input rendering only.
- file anchors: `frontend/apps/candidate/app/profile/page.tsx:89`, `frontend/apps/candidate/app/profile/page.tsx:162`, `frontend/apps/candidate/app/profile/page.tsx:230`, `frontend/apps/candidate/app/profile/page.tsx:375`
- current state: `useState<Form>(EMPTY)` — one big object. `update({ patch })` replaces the whole form; every keystroke rebuilds state and re-renders every child (SkillChips, ExperienceRow, EducationRow, resume block, save button). Validation + `parseStalled` recompute on every render.
- problem: On mid-range devices, typing into a summary field with resume-parsed data drops keystrokes.
- root cause: Every field lives in the same monolithic component sharing one useState. No transition, no field-level state locality, no compiler auto-memo.
- recommended solution: Wrap `setForm` in `startTransition`, OR turn `ExperienceRow`/`EducationRow`/`SkillChips` into leaf components with local state reporting up on blur. Both benefit further from enabling the compiler.
- user impact: Smooth typing on the profile page — critical because this is where a candidate reviews and corrects AI-parsed resume text.
- business impact: Profile completion rate rises when the form doesn't feel slow.
- react features: startTransition, component isolation

### P3

#### RF-11 — Landing IntersectionObserver re-arms on every audience switch across a large DOM
- category: concurrent-rendering
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Removes one useEffect + one IntersectionObserver instance on the main landing surface.
- file anchors: `frontend/apps/candidate/components/landing/landing-page.tsx:52`, `frontend/apps/candidate/components/landing/landing-page.tsx:39`
- current state: `landing-page.tsx:52-73` sets up an IntersectionObserver keyed on `[shown]`. Audience switch → `shown` changes → observer tears down, walks every `.reveal` in `rootRef.current`, re-computes `transitionDelay`, re-observes.
- problem: Audience switch already runs a 260-ms crossfade; layering another synchronous observer teardown+setup on top makes the switch feel heavier.
- root cause: Reveal is a keyed effect over a large DOM subtree; CSS `animation-timeline: view()` could do the same.
- recommended solution: Move reveal into CSS: `animation-timeline: view()` and `animation-range: entry 20% cover 40%` on `.reveal` where supported, fallback to permanently "in" state. Delete the JS observer. Alternate: wrap re-arm in `startTransition`.
- user impact: Faster audience-switch feel; smoother visual quality.
- business impact: Marketing landing feels more premium.
- react features: startTransition (alternate), CSS scroll-driven animations

#### RF-12 — Server Actions candidate: login/register/apply/aptitude submit all use client gRPC
- category: server-actions
- complexity: high
- needs_backend: true
- horizon: strategic-1-3-months
- estimated_improvement: Removes ~30–50 LOC of client-side busy state across ~6 forms; unlocks progressive enhancement.
- file anchors: `frontend/apps/candidate/app/login/page.tsx:75`, `frontend/apps/candidate/app/jobs/[id]/apply-island.tsx:59`, `frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx:170`, `frontend/apps/candidate/app/profile/page.tsx:194`, `frontend/apps/candidate/components/dashboard.tsx:91`
- current state: Every mutating form goes through client-side `useMutation(() => api.<service>.<rpc>(...))`. Ships full auth + api-client transport client-side; every form hand-writes busy state.
- problem: React 19 Actions + `useActionState` remove client-side busy juggling and move mutations server-side — but backend is Python + gRPC and can't receive Server Actions directly.
- root cause: No HTTP + Server Action handler seam today.
- recommended solution: BE handoff — expose thin REST proxies (Next.js Route Handlers under `/app/api/**`) for apply, save, submitAptitude, updateProfile, register, login that forward to gRPC + thread the bearer token. Then convert forms to `<form action={applyAction}>` + `useActionState`. Pair ApplyIsland Dialog with `useOptimistic`.
- user impact: Native form behaviour on cold hydration (form works before JS loads for critical actions). Simpler busy states.
- business impact: Apply/login work on cold/broken JS paths — no longer dependent on the 300 kB shared chunk having parsed. Fewer support tickets on slow devices.
- react features: Server Actions, useActionState, useOptimistic

---

## Dimension 2 — Performance / bundle / rendering

### P1

#### PF-1 — QueryClient never disables `refetchOnWindowFocus`
- category: under-cached-endpoints
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Eliminates 5–8 redundant gRPCs per tab-focus event.
- file anchors: `frontend/packages/shared/src/query.ts:3-11`, `frontend/apps/candidate/components/candidate-shell.tsx:81-87`, `frontend/apps/candidate/components/dashboard.tsx:71-86`, `frontend/packages/ui/src/notification-bell.tsx:83-89`, `frontend/packages/shared/src/use-thread-messages.ts:63-67`
- current state: `makeQueryClient` sets only `staleTime: 30_000` and `retry: false`. `refetchOnWindowFocus`, `refetchOnReconnect`, `gcTime` fall back to defaults. Every route also pins its own `refetchInterval` (messages 60 s, notifications 30 s, threads 5–30 s, dashboard exponential-backoff, applicants 3 s).
- problem: Every alt-tab back re-fires every cached query past staleTime. On `/company/jobs/[id]/applicants/[appId]` that's five gRPCs in one burst; on the dashboard five more.
- root cause: `makeQueryClient` doesn't opt out of TanStack default refetch-on-focus/reconnect.
- recommended solution: `queries: { staleTime: 60_000, gcTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false, refetchOnReconnect: 'always' }`.
- user impact: Alt-tab back no longer stalls the shell; recruiter's applicant-review is the biggest beneficiary.
- business impact: Cuts gRPC RPS from open tabs by 30–50%.
- react features: tanstack-query-defaults

#### PF-2 — Home route bundles the full Dashboard tree for signed-out visitors
- category: bundle-size
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: `/page` chunk drops from ~27 kB to ~5–8 kB; Dashboard moves to a lazy chunk.
- file anchors: `frontend/apps/candidate/app/page-client.tsx:6`, `frontend/apps/candidate/app/page-client.tsx:27`, `frontend/apps/candidate/components/dashboard.tsx:1-34`
- current state: `page-client.tsx` synchronously imports `Dashboard`. Dashboard statically imports `CandidateShell` (which imports `CommandPalette`, `NotificationBell`, `SidebarShell`, 7 lucide icons), `CandidateChecklist`, `DashboardApplicationRow`, `StatCell`, `useCountUp`. Only `AssistantChat` is lazy.
- problem: Homepage serves signed-out marketing to most visitors. The compiled `/page` chunk (26.7 kB, largest per-route) includes the whole candidate signed-in surface.
- root cause: Sync `import { Dashboard }` at page-client.tsx line 6.
- recommended solution: `const Dashboard = dynamic(() => import('../components/dashboard').then(m => m.Dashboard), { ssr: false, loading: () => null });`.
- user impact: Faster TTI on the homepage for signed-out visitors and crawlers.
- business impact: Marketing acquisition surface loads faster; LCP on `/` improves.
- react features: next-dynamic, code-splitting

### P2

#### PF-3 — `/companies/[id]` SSR fetches profile then jobs sequentially
- category: waterfall-fetch
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: ~1 RTT (80–200 ms) faster TTFB on cold-cache renders.
- file anchors: `frontend/apps/candidate/app/companies/[id]/page.tsx:42-53`, `frontend/apps/candidate/app/companies/[id]/company-client.ts:99-116`
- current state: Line 42 `await companyProfile(id)` fully resolves before line 48 `await companyJobs(id)` starts. Both hit independent public REST endpoints.
- problem: TTFB bounded by profile-RTT + jobs-RTT. Google crawls via sitemap — every crawl pays this cost.
- root cause: Two independent awaits instead of one `Promise.all`.
- recommended solution: `const [profileR, jobsR] = await Promise.allSettled([companyProfile(id), companyJobs(id)])` with existing 404-notFound handling on profile.
- user impact: Cuts ~1 RTT off TTFB for every `/companies/[id]` view.
- business impact: Faster company pages → better crawl coverage, lower cost per SSR render.
- react features: server-components, promise-all

#### PF-4 — Company onboarding runs `createJob` then invites sequentially
- category: sequential-await
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: ~50% reduction in finish-onboarding wait time when both a first-role and 1+ invites supplied.
- file anchors: `frontend/apps/candidate/app/company/onboarding/page.tsx:118-178`
- current state: After profile upsert, wizard awaits `createJob(...)` at line 147 to complete before entering the `Promise.allSettled` invite block at line 169.
- problem: For 5 invites + 1 first-role: spinner holds for `create_job_rtt + invite_rtt` instead of `max(create_job_rtt, invite_rtt)`.
- root cause: `createJob` and invites have no data dependency; treated as sequential because written as separate try blocks.
- recommended solution: Collect createJob + invite promises into one `Promise.allSettled([...])`; preserve individual failure reporting.
- user impact: Perceived latency on the last screen of company onboarding drops by roughly half.
- business impact: Faster onboarding completion, less abandonment at "Finish".
- react features: promise-all-settled

#### PF-5 — Marketing hero font weight (Clash Display 700) not preloaded
- category: fonts-lcp
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Removes one render blocker on the LCP element.
- file anchors: `frontend/apps/candidate/app/layout.tsx:47-48`, `frontend/apps/candidate/app/fonts.css:22-27`, `frontend/packages/ui/src/styles/primitives.css:64-67`
- current state: Layout preloads `general-sans-400.woff2` + `clash-display-600.woff2`. `.ap-h2 { font-family: var(--font-display); font-weight: 700 }` is what marketing hero uses; the 700 file is on disk + declared but not preloaded.
- problem: LCP element font waits for CSSOM discovery. `font-display: swap` masks with a visible layout shift.
- root cause: Preload list was written for 400 + 600.
- recommended solution: Add `<link rel="preload" href="/fonts/clash-display-700.woff2" as="font" type="font/woff2" crossOrigin="" />` to head. Note: `.ap-h1` at 800 has no matching file (synthesized bold) — decide whether to add 800 or drop `.ap-h1` to 700.
- user impact: Marketing hero paints its true typeface on first paint; stabilizes LCP.
- business impact: Cleaner LCP on the highest-visibility route.
- react features: —

#### PF-6 — Root layout awaits `headers()` so every route is dynamically rendered
- category: ssr-static
- complexity: medium
- needs_backend: false
- horizon: medium-1-3-weeks
- estimated_improvement: Static routes drop to ~10 ms TTFB (CDN edge) from ~50–150 ms (Node runtime).
- file anchors: `frontend/apps/candidate/app/layout.tsx:34-40`, `frontend/apps/candidate/app/(marketing)/applicants-landing.tsx`, `frontend/apps/candidate/app/(legal)`
- current state: `await headers()` at line 39 required for CSP nonce stamping. Applies to every route — `/privacy`, `/accessibility`, `/trust`, `/terms`, `/dpa`, `/pilot`, `/compare/*`, `/what-we-dont-do`, `/sample-report`, `/ai-explainability`.
- problem: Marketing/legal pages that would be prerendered now render per-request; also blocks ISR for `/jobs` and `/companies/[id]`.
- root cause: Per-request nonce contract lives at layout level; simplest way forces dynamic rendering everywhere.
- recommended solution: Move CSP nonce plumbing into a route group layout that only wraps signed-in/dynamic routes; let `(marketing)` + `(legal)` group render statically. Needs middleware to only inject nonce on non-static routes.
- user impact: Static-content routes serve instantly from CDN edge.
- business impact: Lower serverless invocation count, lower cost, better CDN hit ratio.
- react features: server-components, ssg, isr

#### PF-7 — `MessageThreadView` renders every message per poll (no virtualization)
- category: un-virtualized-list
- complexity: medium
- needs_backend: true
- horizon: medium-1-3-weeks
- estimated_improvement: Poll cycle in a 500-message thread drops from full-list render to ~50-row virtualized window.
- file anchors: `frontend/packages/ui/src/message-thread-view.tsx:131`, `frontend/apps/candidate/app/messages/messages-client.ts:64-66`, `frontend/packages/shared/src/use-thread-messages.ts:63-88`
- current state: `rows.map((m) => ...)` renders the entire thread. `listMessages(applicationId)` has no pagination. Poll cadence 5s → 15s → 30s.
- problem: On busy hiring cycles threads accumulate 100+ messages. Every poll re-renders entire list; composer INP suffers >200 messages.
- root cause: API returns full history; view has no virtualization; hook has no cursor.
- recommended solution: BE — add cursor/pagination to `listMessages` (`limit: 50, before?: id`). FE — swap the map for TanStack Virtual or react-virtuoso. FE-first fallback: cap `rows` to last 100 in the hook.
- user impact: Long-history threads stay smooth to scroll; composer INP under 200 ms budget even at 500+ rows.
- business impact: Messaging is the core anti-ghosting touchpoint; jank there degrades trust.
- react features: virtualization, cursor-pagination

#### PF-10 — `optimizePackageImports` covers only `lucide-react`
- category: bundle-size
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Shared vendor chunk drops 10–30% depending on unused Radix primitives per route.
- file anchors: `frontend/apps/candidate/next.config.ts:10-12`, `frontend/packages/ui/src/index.ts:1-147`
- current state: Only `lucide-react` optimized. 320 kB shared vendor chunk contains `@radix-ui/*`, sonner, motion, `@ip/ui` barrel — none participate in optimizePackageImports.
- problem: Barrel imports pull whole tree unless deep-imported.
- root cause: `@ip/ui` transpiled but not in `optimizePackageImports`; same for Radix primitives.
- recommended solution: Extend config: `optimizePackageImports: ['lucide-react', '@ip/ui', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select', '@radix-ui/react-tabs', '@radix-ui/react-tooltip', '@radix-ui/react-checkbox', '@radix-ui/react-radio-group', '@radix-ui/react-label']`.
- user impact: Smaller per-route JS payloads across the app; TTI improves.
- business impact: Better Web Vitals FID/INP across all routes; less bandwidth per session.
- react features: next-optimizePackageImports

### P3

#### PF-8 — `ApertureSprite` renders 25 inline SVG symbols on every route
- category: bundle-size
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Removes ~2–3 kB of inline SVG from marketing/legal HTML.
- file anchors: `frontend/apps/candidate/app/layout.tsx:52`, `frontend/packages/ui/src/aperture-sprite.tsx:8-146`
- current state: `<ApertureSprite />` mounted unconditionally at top of every page. Contains 25 SVG `<symbol>` definitions + ap-mark geometry (~180 lines).
- problem: Every route's HTML carries inline SVG block even when no `<ApIcon>` referenced. Biggest offender: landing (which uses its own SVGs + ApertureLens instead).
- root cause: Sprite lives in root layout for simplicity; no route-level opt-out.
- recommended solution: (a) minimal — tree-shake to only ship glyphs referenced by `<ApIcon>`; (b) surgical — hoist into signed-in layouts, drop from marketing/legal groups.
- user impact: Marketing/legal pages ship less inline SVG.
- business impact: Smaller SSR HTML on marketing routes; slight LCP improvement.
- react features: —

#### PF-9 — Notification bell + feed poll unread count on overlapping timers
- category: under-cached-endpoints
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Removes one duplicate 30 s poll while `/notifications` is open.
- file anchors: `frontend/packages/ui/src/notification-bell.tsx:83-95`, `frontend/apps/candidate/app/notifications/page.tsx:33-40`
- current state: Bell polls `unreadCount()` every 30 s. `/notifications` page polls `list({page:1, pageSize:50})` every 30 s and derives unread count from payload. On the page, both fire in parallel with separate cache keys.
- problem: When user is on `/notifications`, the badge poll is redundant. Two separate cache keys → fresh feed doesn't update the bell badge until its own tick.
- root cause: `notificationKeys.unread()` and `notificationKeys.feed(false)` are separate keys with separate poll cycles.
- recommended solution: Feed's `select`/`onSuccess` writes back into badge cache: `qc.setQueryData(notificationKeys.unread(), data.unreadCount)`. Alternately, disable bell poll when feed is mounted.
- user impact: Bell stays in real-time sync with visible inbox; one fewer RPC/30s on `/notifications`.
- business impact: Small but constant reduction in notification-service load.
- react features: tanstack-query-cache

#### PF-11 — `CandidateShell` fetches full thread list on every route mount
- category: under-cached-endpoints
- complexity: medium
- needs_backend: true
- horizon: medium-1-3-weeks
- estimated_improvement: One less full-thread-list fetch per navigation.
- file anchors: `frontend/apps/candidate/components/candidate-shell.tsx:77-88`, `frontend/apps/candidate/app/messages/messages-client.ts:61-63`
- current state: CandidateShell fires `listThreads()` once + polls 60 s. Shared query key with `/messages` (dedups within session), but every fresh navigation refetches full thread list to compute one integer.
- problem: 30 threads × navigation = ~4-6 kB per fetch to derive one number.
- root cause: No dedicated `unreadCount` RPC for messages (notifications has one).
- recommended solution: BE — add `getUnreadMessageCount()` returning single integer. FE — shell reads that; `/messages` keeps fat `listThreads`. FE-only fallback: raise `staleTime` to ~120 s + reduce poll to 120 s off-`/messages`.
- user impact: Faster nav-to-nav transitions; badge stays accurate.
- business impact: Lower gRPC traffic on messaging service.
- react features: tanstack-query-cache

---

## Dimension 3 — Candidate journey UX + conversion

### P0

#### CX-1 — Aptitude in-progress answers are memory-only — a tab crash wipes the one-shot bank
- category: correctness-conversion
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Eliminates lost-answer failure on aptitude crash/refresh; double-digit reduction in aptitude-abandonment support cases.
- file anchors: `frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx:108`, `frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx:223`, `frontend/apps/candidate/app/onboarding/page.tsx:116`
- current state: `answers` in `useState` only. `beforeunload` sets `returnValue` but never persists. Coding source, free-text bodies, MCQ selections all in memory. No localStorage mirror. Onboarding mirrors to `PROGRESS_KEY = 'aptitude.onboarding.progress.v1'` — the aptitude page doesn't.
- problem: Wi-Fi hiccup / OS crash / Cmd-Q wipes every answer typed in a proctored one-shot assessment. For a 45-minute mixed bank, unrecoverable UX failure.
- root cause: Persistence pattern from onboarding was never applied to aptitude.
- recommended solution: Mirror `answers` + `results` to localStorage under `aptitude.progress.v1.<applicationId>` with debounced write on every change; hydrate on mount before rendering questions. Clear on `submit.isSuccess`.
- user impact: Zero-cost recovery from crashes, hiccups, accidental navigation during the highest-stakes assessment.
- business impact: Prevents the worst-case candidate experience on a page users can never retake; removes "the platform ate my work" pathway.
- react features: —

#### CX-2 — Interview lobby 'environment scan' and 'ID check' are no-op stubs that always pass
- category: trust-integrity
- complexity: medium
- needs_backend: false
- horizon: medium-1-3-weeks
- estimated_improvement: Eliminates the biggest known false-pass surface in interview pre-flight.
- file anchors: `frontend/apps/candidate/app/interview/[applicationId]/lobby/page.tsx:113`, `frontend/apps/candidate/app/interview/[applicationId]/lobby/page.tsx:119`, `frontend/apps/candidate/app/interview/[applicationId]/lobby/page.tsx:278`, `frontend/apps/candidate/app/interview/[applicationId]/proctor-audio.ts:13`
- current state: `runEnvironmentScan = useCallback(() => setGates((g) => ({...g, environment: 'pass'})))`. Same for `runIdCheck`. Both gated behind visible "Run environment scan" / "Run ID check" buttons with "Placeholder · selfie capture wires up in v3.2" text. CAM/MIC pass on `getUserMedia` succeeding — no VU meter, no bandwidth/RTT probe.
- problem: Candidate told "Room, browser, signal check" passed when nothing was measured. 3 Mbps DSL, broken mic, hearing loss (no playback test) see a green "Pass" pill.
- root cause: Lobby built as UX shell before detector wiring; no `ap-pill--warn` fallback.
- recommended solution: Live VU meter driven by `AnalyserNode` (pattern exists in `startAudioDetector`). Bandwidth/RTT via small connect-web ping or `navigator.connection.downlink` + WebRTC ICE-gathering timing. Rename ID/environment buttons to "Coming in v3.2" with `warn` gate. Add speaker playback tone test.
- user impact: Real confidence entering proctored room. Mic-issue failures at minute 3 (currently unrecoverable) drop to near-zero.
- business impact: Reduces auto-terminated interviews from preventable setup issues; strengthens "proctored interview is real" positioning.
- react features: —

### P1

#### CX-3 — Signed-out apply flow drops the deep-link — `/login` ignores `?next=`
- category: correctness-conversion
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: One-line fix restores deep-link on 100% of signed-out apply attempts.
- file anchors: `frontend/apps/candidate/app/jobs/[id]/apply-island.tsx:89`, `frontend/apps/candidate/app/login/page.tsx:57`, `frontend/packages/shared/src/guards.ts:22`
- current state: `apply-island.tsx:89` emits `<Link href={\`/login?next=/jobs/${jobId}\`}>`. `login/page.tsx:57` reads `sp.get('redirect')` only; `next` not aliased.
- problem: Prospect on JD clicks "Sign in to apply", enters credentials, lands on candidate dashboard — not the job.
- root cause: Apply-island uses different query-param than the redirect convention.
- recommended solution: Change `?next=` to `?redirect=` in `apply-island.tsx:89`. Optionally teach `login/page.tsx:57` to fall back to `next`.
- user impact: Prospect lands back on JD after login. Two saved clicks per signed-out application.
- business impact: Measurable lift on crawler-source signed-out apply funnel.
- react features: —

#### CX-4 — Dashboard renders 'Interview · Job {id}' — proto lacks title + company
- category: data-thinness
- complexity: medium
- needs_backend: true
- horizon: medium-1-3-weeks
- estimated_improvement: Eliminates opaque-ID display on ~100% of dashboard tiles + tracker rows + Up-Next CTA.
- file anchors: `frontend/apps/candidate/components/dashboard.tsx:351`, `frontend/apps/candidate/components/dashboard.tsx:410`, `frontend/apps/candidate/components/dashboard-parts.tsx:41`, `frontend/packages/api-client/src/gen/application_pb.ts:101`, `frontend/packages/api-client/src/gen/recommendation_pb.ts:55`
- current state: Renders `Interview · Job {nextInterview.jobId}` and literal "Recommended role". `app.jobTitle ?? \`Job ${app.jobId}\`` — fallback always fires because `ApplicationResponse` carries only applicationId/jobId/candidateUserId/state.
- problem: Candidate with 8 applications sees `Job abc12345`, `Job def67890` with no way to tell them apart. Up-Next tile — highest-intent CTA — says "Interview · Job {opaque-id}".
- root cause: Proto written before FE needed rendered tracker; candidate-side `ListMyApplications` is minimal.
- recommended solution: BE — extend `ApplicationResponse` with `{jobTitle, companyName, companyId}` (present already on messaging_pb.ts:110-115). Same for `Match` on recommendation_pb.ts. FE change trivial once fields exist.
- user impact: Tracker becomes readable at a glance. Up-next reads "Interview · Senior Backend Engineer · Northwind".
- business impact: Removes most-visible data-thinness artifact on candidate's daily home surface. Directly supports "you always know which company" brand promise.
- react features: —

#### CX-5 — Aptitude MCQ + free-text sections have no timer — only coding uses `useCountdown`
- category: high-stakes-flow-gap
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: MCQ candidates gain timer visibility + safe auto-submit at 0:00.
- file anchors: `frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx:63`, `frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx:416`, `frontend/apps/candidate/lib/assessment.ts:40`, `frontend/apps/candidate/lib/use-countdown.ts:18`
- current state: `CodingSectionWithTimer` calls `useCountdown(section.timeLimitS, onExpire)`. MCQ branch (416–449) + free-text (382–410) render no timer, no auto-submit at zero. `timeLimitS?` typed on every section kind but only coding reads it.
- problem: 15-question MCQ-only bank with 30-minute deadline shows no clock. Backend enforces deadline; candidate can be silently gated out.
- root cause: `CodingSectionWithTimer` was added for new section kind; MCQ + free-text render inline in main sections.map.
- recommended solution: Global countdown using max `timeLimitS` shown in sticky header near "Assessment" h1. Auto-submit on expiry via existing `submit.mutate()`. Alt: per-section timers using existing hook.
- user impact: Candidate paces themselves during MCQ.
- business impact: Removes unforced UX loss on aptitude gate; MCQ parity with coding.
- react features: —

#### CX-6 — Interview room has no reconnect / connection-quality UI on RTC drop
- category: high-stakes-flow-gap
- complexity: high
- needs_backend: true
- horizon: strategic-1-3-months
- estimated_improvement: Recovers interview completions across mobile/hotspot/café-Wi-Fi segment.
- file anchors: `frontend/apps/candidate/app/interview/[applicationId]/page.tsx:179`, `frontend/apps/candidate/app/interview/[applicationId]/rtc-room.ts:17`, `frontend/apps/candidate/app/interview/[applicationId]/page.tsx:85`
- current state: `rtc-room.ts:31` returns `makeFakeRoom` (real LiveKit deferred per comment). Page only handles `ConnectError.Code.Unavailable` at boot. Once live, no listener on ICE, no reconnect banner, no network state pill.
- problem: 15-second Wi-Fi hiccup in a fullscreen-locked one-shot interview leaves a frozen self-view with no recovery path.
- root cause: RTC transport is a stub; real LiveKit adaptive-stream + reconnect events aren't wired.
- recommended solution: When LiveKit swap lands, subscribe to `ConnectionQualityChanged`, `Reconnecting`, `Reconnected`, `Disconnected`; mirror to a network pill in HUD; show soft-blocking "Reconnecting…" overlay with max-wait cap. BE — server-side saves partials on `Reconnecting` >30s.
- user impact: Brief network wobble no longer terminates a real interview.
- business impact: Directly reduces auto-terminated interviews from network transients — currently unrecoverable.
- react features: —

#### CX-7 — Register + login have no social-login CTAs — SSO wired at `/auth/callback` but unreachable
- category: friction-conversion
- complexity: medium
- needs_backend: true
- horizon: medium-1-3-weeks
- estimated_improvement: Adds one-tap signup + LinkedIn profile-prefill; likely the single largest signup-completion lift.
- file anchors: `frontend/apps/candidate/app/register/page.tsx:55`, `frontend/apps/candidate/app/login/page.tsx:24`, `frontend/apps/candidate/app/auth/callback/page.tsx:1`
- current state: `/auth/callback` exists and processes SSO returns. Login has "SSO is on the roadmap" comment. Register exposes email/password + strength meter only. No "Continue with Google/Apple/LinkedIn" button.
- problem: Highest-friction signup shape. Industry standard is one-tap social + LinkedIn profile import.
- root cause: SSO CTA deliberately deferred pre-launch. Provider start-URLs + state/nonce await BE.
- recommended solution: BE — emit provider start-URLs via `/auth/providers` or config JSON with state/nonce. FE — "Continue with Google" above email; "Continue with LinkedIn" with profile-import pre-fill. Keep email as fallback.
- user impact: One-tap signup with prepopulated name + work history.
- business impact: Signup-completion rate lift; passive profile enrichment reduces onboarding step-1 abandonment.
- react features: —

#### CX-8 — Apply-to-a-job is a 2-click modal for a single-checkbox consent — no cover letter or screening slot
- category: conversion-flow
- complexity: medium
- needs_backend: true
- horizon: medium-1-3-weeks
- estimated_improvement: Cuts apply clicks from 3 to 1 (or 2 with cover); adds cover-letter data field.
- file anchors: `frontend/apps/candidate/app/jobs/[id]/apply-island.tsx:99`, `frontend/apps/candidate/app/jobs/[id]/apply-island.tsx:115`, `frontend/packages/api-client/src/gen/application_pb.ts:22`
- current state: "Apply now" button → Dialog with single consent checkbox → "Submit application". Apply RPC takes `{jobId, consent}` only. No cover-letter, no screening-question slot, no attach-portfolio, no "Why this role?".
- problem: Intentionally two-click for one checkbox AND thinner in signal than every competitor. Candidate applying to 8 roles submits 8 identical applications.
- root cause: Consent-modal chosen to keep UI clean; apply RPC scoped narrowly.
- recommended solution: (1) FE-only: inline consent checkbox next to "Apply now" — one click. (2) BE — add optional `coverLetter: string` and `screeningAnswers: map<string,string>` to `ApplyRequest`; job posting declares `screeningQuestions: repeated string`. FE renders "Say something about your fit (optional, 500 chars)" Textarea.
- user impact: One-click apply for candidates who don't want to write; optional narrative for candidates who do.
- business impact: Higher apply completion + higher per-application signal quality.
- react features: —

### P2

#### CX-9 — Onboarding step 3 disables Continue when the copy tells the user to skip
- category: conversion-flow
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Recovers onboarding-abandonment for the "no resume yet" segment.
- file anchors: `frontend/apps/candidate/app/onboarding/page.tsx:288`, `frontend/apps/candidate/app/onboarding/page.tsx:486`, `frontend/apps/candidate/app/onboarding/page.tsx:563`
- current state: `canAdvance` step 3 = `Boolean(profile.data?.resumeUploaded)`. Copy: "Don't have a resume handy? You can skip this and add one later." Only "Skip for now" fully abandons the wizard (routes to `/`).
- problem: Candidate told they can skip → sees disabled Continue → only exit is Skip for now → loses all wizard progress.
- root cause: `canAdvance` requires `resumeUploaded`; skip copy contradicts that.
- recommended solution: `canAdvance = step === 3 ? true : ...`. Update Continue button copy to "Skip this step" when no resume uploaded; or distinct "Skip resume" next to Continue.
- user impact: Onboarding completes even without a resume.
- business impact: Onboarding completion rate lift on resume-not-available segment (mobile signups, first-timers).
- react features: —

#### CX-10 — No side-by-side job comparison — the brief lists 'comparison' but only marketing exists
- category: discovery-flow
- complexity: medium
- needs_backend: false
- horizon: medium-1-3-weeks
- estimated_improvement: Fills the compare gap explicitly named in modernization brief.
- file anchors: `frontend/apps/candidate/app/saved/page.tsx:129`, `frontend/apps/candidate/components/save-job-button.tsx:15`, `frontend/apps/candidate/app/compare/take-home/page.tsx:1`
- current state: `/compare` route contains only `/compare/take-home` (marketing). Saved-jobs list has no multi-select, no "Compare selected" CTA, no compare view.
- problem: Candidates evaluating 2–3 similar roles have to eyeball-diff separate tabs. `SavedJobDTO` already carries salary/remote/employment/skills/JD snippet.
- root cause: Primitive never built. Routing name `/compare` already taken by marketing page.
- recommended solution: Add "Compare" checkbox on saved-jobs cards (limit 3). New route `/jobs/compare?ids=a,b,c` renders 3-column table with matched-attribute rows (Salary, Location, Remote, Employment, Posted, Skills-overlap, JD-snippet). Entirely FE.
- user impact: Candidate on the fence between 3 roles gets clear side-by-side.
- business impact: Strengthens "evaluate roles seriously" positioning.
- react features: —

#### CX-11 — Marketplace has no active-filter chip strip — mobile users can't see their filters
- category: discovery-flow
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Mobile filter-visibility parity + one-click per-filter dismiss.
- file anchors: `frontend/apps/candidate/app/jobs/marketplace.tsx:82`, `frontend/apps/candidate/app/jobs/marketplace.tsx:101`, `frontend/apps/candidate/components/filter-sidebar.tsx:183`
- current state: FilterSidebar in a `<details>` accordion on mobile. Once closed, no chip strip above results. "Clear filters" is nuclear.
- problem: Mobile candidate who set Remote + Full-time + Berlin sees zero indication after scroll. Can't remove one filter without re-opening accordion.
- root cause: FilterSidebar owns filter state; no shared summary component driven from `params`.
- recommended solution: Chip strip above results near sort tabs. One dismissable chip per active facet (`remote`, `type`, `level`, `q`, `location`) with X to clear just that one.
- user impact: Mobile always sees active filters; can drop one without opening accordion.
- business impact: Reduces filter-abandonment on mobile.
- react features: —

#### CX-12 — Outcome page 'See next steps' CTA loops back to the same journey — no post-advance content
- category: growth-content
- complexity: medium
- needs_backend: true
- horizon: medium-1-3-weeks
- estimated_improvement: Fixes broken promise on advance CTA; enables downstream scheduling flow.
- file anchors: `frontend/apps/candidate/app/applications/[id]/outcome/page.tsx:255`, `frontend/apps/candidate/app/applications/[id]/page.tsx:194`
- current state: On verdict advance renders `<Link href={\`/applications/${id}\`}>See next steps</Link>` — same timeline. No post-advance content anywhere.
- problem: Advance verdict is peak-emotion moment. "See next steps" delivers same tracker. Candidate wonders what happens now.
- root cause: Applications flow ends at "advanced"; no next-stage content.
- recommended solution: (a) Rewrite CTA to "Message the reviewer" / "Return to applications". (b) BE — extend Application with `next_action` string ("Team will schedule a second interview within 3 business days"). FE renders on outcome + timeline.
- user impact: Clear next-action to take, or honest "you're done, wait to hear back".
- business impact: Reinforces "no ghosting" promise on shortlist/hire path.
- react features: —

#### CX-13 — Growth feedback panel is flat gaps + no cohort/benchmark — reads as pure criticism
- category: growth-content
- complexity: medium
- needs_backend: true
- horizon: medium-1-3-weeks
- estimated_improvement: Adds severity gradient without a score.
- file anchors: `frontend/apps/candidate/components/growth-feedback-panel.tsx:54`, `frontend/apps/candidate/components/growth-feedback-panel.tsx:78`, `frontend/apps/candidate/app/practice/types.ts:1`
- current state: "Areas to grow" numbered badges, no magnitude, no comparison. `suggested_topics` chip cloud without expected uplift.
- problem: 5 gaps listed as flat criticism. No sense of severity — is #1 polish or role-blocker?
- root cause: `PracticeFeedbackResult` carries strings only. Scores stripped by design (right for verdict-free stance) but resulting UX has no gradient.
- recommended solution: BE — add per-strength/per-gap `severity: 'polish' | 'notable' | 'blocker'`. FE renders three visual tones. Optionally cohort anchor "Common area — 60% of candidates work on this" on biggest gap. Do not add a score.
- user impact: Reads as constructive with clear "work on this first" signal.
- business impact: Improves growth-feedback tone; increases practice-repeat rate.
- react features: —

#### CX-14 — Interview room has no question-navigation or Iris state indicators — HUD is timer + chips only
- category: live-ui-clarity
- complexity: medium
- needs_backend: true
- horizon: strategic-1-3-months
- estimated_improvement: Adds question nav + Iris state without violating strict-two-controls invariant.
- file anchors: `frontend/apps/candidate/app/interview/[applicationId]/page.tsx:326`, `frontend/apps/candidate/app/interview/[applicationId]/rtc-room.ts:7`, `frontend/apps/candidate/components/interview-captions.tsx:1`
- current state: HUD renders topbar + stage + strip (Face/Gaze/Mic/Integrity). No "Question 3 of 12". No Iris state. Captions show only current line.
- problem: Candidate has no idea how far through interview they are.
- root cause: RTC data channel didn't include structured question-index/total-questions.
- recommended solution: BE — LiveKit data channel emits `{type:'question_meta', index:N, total:M}`. FE renders "Question 3 of 12" in HUD near timer + Iris state pill (listening/thinking/speaking) driven by remoteSpeaking + short thinking inference. Keep read-only.
- user impact: Candidate knows where they are + Iris state at every silence.
- business impact: Addresses two brief bullets; interview NPS gains without changing invariants.
- react features: —

### P3

#### CX-15 — `components/device-precheck.tsx` is a redundant fallback that undercuts the strict lobby
- category: dead-scaffolding
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Eliminates duplicate precheck; ensures 100% hit strict lobby.
- file anchors: `frontend/apps/candidate/app/interview/[applicationId]/page.tsx:321`, `frontend/apps/candidate/components/device-precheck.tsx:15`, `frontend/apps/candidate/app/interview/[applicationId]/lobby/page.tsx:130`
- current state: Interview page renders `<DevicePrecheck onReady mock={MOCK}>` on `phase === 'precheck'`. Component is a mini pre-check with plain "Enable camera & microphone" button + ack checkbox. Candidate deep-linking to `/interview/{id}` skips strict lobby.
- problem: Two pre-checks exist. Loose one runs whenever lobby is bypassed via typed URL/notification.
- root cause: Lobby was added after; room's own precheck never removed. No router enforcement.
- recommended solution: At `/interview/{id}` phase=precheck: if no lobby-completed session marker, replace to `/interview/{id}/lobby`. Delete `device-precheck.tsx` and import (-100 LOC).
- user impact: One consistent pre-check for every candidate.
- business impact: Removes strictness-bypass path.
- react features: —

---

## Dimension 4 — Recruiter journey UX + productivity

### P1

#### RX-1 — Pipeline cards hide fit score — `GetJobRankedCandidates` RPC exists but is unused
- category: unused-backend-capability
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Pipeline triage from N-clicks-per-lane to zero clicks for the strongest cards.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/page.tsx:94`, `frontend/apps/candidate/app/company/jobs/[id]/page.tsx:110`, `frontend/packages/api-client/src/gen/recommendation_pb.ts:120`, `frontend/packages/api-client/src/gen/application_pb.ts:101`
- current state: Kanban card shows masked handle + state pill only. `ApplicationResponse` only carries {applicationId, jobId, candidateUserId, state}. Meanwhile `RecommendationService.getJobRankedCandidates` is fully generated and returns per-candidate score + reasons. Override mutation even invalidates `['ranked', id]` — ranked query was planned.
- problem: Recruiter with 40 applicants scanning six lanes sees 40 identical cards.
- root cause: Pipeline query calls only `listApplicants`. Ranking RPC never wired.
- recommended solution: Second query keyed `['ranked', id]` calling `getJobRankedCandidates({jobId: id})`, index by candidateUserId, render `score` as ap-ring + first `reason` as muted subtitle.
- user impact: Recruiters rank cards at a glance.
- business impact: The "AI-matched hiring" promise becomes visible; without this the value prop is aspirational.
- react features: useQuery join, component composition

#### RX-2 — Analytics ignores two already-generated RPCs (no-ghosting + score distribution)
- category: unused-backend-capability
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Adds 3 measured metrics with zero new proto work.
- file anchors: `frontend/apps/candidate/app/company/analytics/page.tsx:27`, `frontend/apps/candidate/app/company/analytics/page.tsx:149`, `frontend/packages/api-client/src/gen/analytics_pb.ts:35`, `frontend/packages/api-client/src/gen/analytics_pb.ts:108`, `frontend/packages/api-client/src/gen/analytics_pb.ts:209`
- current state: `/company/analytics` calls only `getFunnelAnalytics({})`. `GetNoGhostingKpis` returns pendingReview/staleOverSla/medianResponseHours/responseRate/decidedLast7d. `GetJobScoreDistribution` returns count/min/max/mean/p25/p50/p75 per job. Neither called anywhere.
- problem: Analytics page is two-tile funnel + one conversion %. Recruiters can't see median response, stale-over-SLA count, or per-role score distribution.
- root cause: Page scoped to funnel RPC only.
- recommended solution: `useQuery` for `getNoGhostingKpis({})` + per-role `getJobScoreDistribution({jobId})`. Compact 5-stat band above funnel. Per-role histogram (p25/p50/p75 pills) on anchor cell.
- user impact: "Am I ghosting?" and "is this role converting?" answered directly.
- business impact: Anti-ghosting product promise gets its measurement layer.
- react features: useQuery parallel

#### RX-3 — Recruiter has no aggregate messages inbox — conversations buried per-applicant
- category: missing-surface
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Reduces time to spot a new candidate message from O(n applicants) clicks to 1.
- file anchors: `frontend/apps/candidate/components/company-shell.tsx:49`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:194`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:511`, `frontend/apps/candidate/app/messages/page.tsx`
- current state: Company sidebar intentionally omits `/company/messages` after broken-link removal. Only path today is per-applicant Messages tab, which links out to candidate-side `/messages/{appId}`. No aggregation.
- problem: Recruiter with 5 open roles × 30+ applicants has to open each applicant to discover replies.
- root cause: Messaging scoped to applicant detail. `listThreads` returns every thread but is never aggregated.
- recommended solution: Add `/company/messages/page.tsx` reusing `createMessagesClient(api).listThreads()`, two-pane inbox. Add sidebar entry with badge count. Zero new backend.
- user impact: One-click access to every waiting conversation.
- business impact: Directly moves `medianResponseHours` down.
- react features: route reuse, two-pane layout

#### RX-4 — Post/Edit job forms lose all fields on any client-side nav (no draft, no guard)
- category: data-loss-ux
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Eliminates "I typed 400 words of JD and it vanished" regressions on the highest-stakes recruiter form.
- file anchors: `frontend/apps/candidate/app/company/jobs/new/page.tsx:45`, `frontend/apps/candidate/app/company/jobs/new/page.tsx:127`, `frontend/apps/candidate/app/company/jobs/[id]/edit/page.tsx:69`, `frontend/apps/candidate/app/company/jobs/[id]/edit/page.tsx:77`
- current state: Both forms hold entire 5-section form in local `useState<JobFormValues>`. No `beforeunload`, no localStorage mirror, no navigation guard, no dirty-flag. Client sidebar nav loses everything.
- problem: Highest-stakes recruiter form. JD drives aptitude AND interview. Cmd-click sidebar → everything gone with no confirmation.
- root cause: Monolithic single-mount state machine. Candidate profile has same issue (already flagged).
- recommended solution: Extract `useDraftForm(key, initialValues)` — localStorage mirror + rehydrate on mount + `beforeunload` + Next `useOnBeforeNavigate` guard. Apply with keys `job:new:${identity.id}` + `job:${jobId}:edit:${identity.id}`.
- user impact: Post a job across a coffee-break refresh; Cmd-click stops being a landmine.
- business impact: Removes largest silent-abandonment risk on recruiter funnel.
- react features: custom hook, useEffect + localStorage, useOnBeforeNavigate

#### RX-5 — JD 'Improve with AI' clobbers the recruiter's draft in place — no diff, no undo
- category: destructive-ai-ux
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Removes destructive-replace risk on highest-value AI touch point.
- file anchors: `frontend/apps/candidate/app/company/jobs/new/page.tsx:88`, `frontend/apps/candidate/app/company/jobs/new/page.tsx:214`, `frontend/packages/api-client/src/gen/jd_pb.ts:35`
- current state: Improve mutation `onSuccess` runs `set('jdText', draft.jdText)`, replacing whatever recruiter typed. Only feedback is toast. Response includes both `jdText` AND `suggestions` but FE forgets original brief.
- problem: Recruiter with 60% good draft clicks Improve → sees re-worded output that lost nuance → cannot recover.
- root cause: Mutation treats AI response as truth; no diff/revert.
- recommended solution: Snapshot `v.jdText` into `previousJdText` ref before improve; render `<Notice>` "AI improved your draft. Keep · Revert." Revert restores from ref. Better: side-by-side diff dialog before commit.
- user impact: Safely experiment with Improve; recovery is one click.
- business impact: Increases usage — the feature only works if it's safe to try.
- react features: useRef snapshot, conditional Notice

#### RX-6 — Advance decision collects no reason, but Hold/Reject do — asymmetric audit trail
- category: decision-flow-inconsistency
- complexity: low
- needs_backend: true
- horizon: quick-win-1-3-days
- estimated_improvement: Closes 33% gap in decision-audit coverage.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:449`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:754`, `frontend/apps/candidate/app/company/audit/audit-client.ts:8`
- current state: Advance uses `ConfirmDialog` with `{action:'advance'}` only. Hold/Reject use `ReasonDialog` gated on reason + supporting `freeText`. Audit page lists both `shortlist` and `advance` — with empty `reasonSnippet`.
- problem: "Every decision on the record" promise, but Advance rows always have blank reasons.
- root cause: Advance treated as symmetric with Reject in audit but asymmetric in UI.
- recommended solution: Reuse `ReasonDialog` with `ADVANCE_REASONS = ['strong_fit', 'proceed_with_reservation', 'strategic_role', 'other']`. Keep confirm enabled without picking a code so speed preserved for high-confidence advances.
- user impact: Advance decisions carry rationale in audit log.
- business impact: Audit-log promise becomes truthful for every decision type.
- react features: Dialog reuse

#### RX-8 — Pipeline board has no search, no bulk actions, no sort, no keyboard nav
- category: productivity-scale
- complexity: medium
- needs_backend: false
- horizon: medium-1-3-weeks
- estimated_improvement: Bulk actions reduce N clicks to 1 for common triage.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/page.tsx:94`, `frontend/apps/candidate/app/company/jobs/[id]/page.tsx:186`, `frontend/apps/candidate/app/company/jobs/[id]/page.tsx:203`
- current state: Fixed 6-lane grid. No text-search, no checkbox column, no "select all in lane", no bulk-decision, no sort chip, no keyboard nav. Kanban cards `<Link>` only.
- problem: 80 applicants → visual scan six lanes. Bulk operations impossible.
- root cause: Ported from earlier recruiter app with polling parity as the goal.
- recommended solution: (1) Search Input filtering `applicants.data.applications` by handle/candidateId prefix. (2) View toggle "Board · Table" — table iterates same array with sortable columns. (3) Checkbox column + sticky bottom bar "Reject N / Hold N" fanning out over existing decide mutation with `Promise.allSettled`.
- user impact: Select 15 in one gesture, reject with shared reason. Time to close obvious no's from 15 clicks to 2.
- business impact: Turns pipeline from browsing to working surface.
- react features: view toggle, controlled selection, Promise.allSettled

#### RX-10 — Talent search asymmetric — Stage applies instantly, keyword doesn't; Stage ignored on empty
- category: search-ux
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Removes hidden-behavior class of talent-search confusion.
- file anchors: `frontend/apps/candidate/app/company/talent/page.tsx:52`, `frontend/apps/candidate/app/company/talent/page.tsx:59`, `frontend/apps/candidate/app/company/talent/page.tsx:118`
- current state: `draft` and `params.query` separate. Typing keyword updates draft only; Stage's `onValueChange={(v) => submit({stage: v})}` commits instantly. Worse: when `active = params.query.trim().length > 0` is false, page renders `PoolList` regardless of stage filter.
- problem: Two invisible rules: (a) stage fires immediately, keyword doesn't; (b) stage is silently ignored when keyword is blank.
- root cause: PoolList added as empty-query default before stage was on RPC.
- recommended solution: `active = params.query.trim().length > 0 || Boolean(params.stage)`. Debounce keyword (250 ms). Remove Search button as required commit.
- user impact: Filter behavior becomes predictable and instant.
- business impact: Talent search stops being hidden-mode UI.
- react features: useDeferredValue or debounce

#### RX-11 — Talent detail drawer has no link to open the candidate's applications
- category: dead-end
- complexity: low
- needs_backend: true
- horizon: quick-win-1-3-days
- estimated_improvement: Removes terminal dead-end of sourcing flow.
- file anchors: `frontend/apps/candidate/app/company/talent/page.tsx:439`, `frontend/apps/candidate/app/company/talent/sourcing-types.ts:8`, `frontend/packages/api-client/src/gen/sourcing_pb.ts:63`
- current state: Drawer renders Fit, Stage, Applications count, Matched skills. No button/link to any application. `CandidateHitDTO` doesn't carry applicationId list.
- problem: Recruiter searches → finds strong candidate → drawer → zero next action.
- root cause: DTO on FE seam doesn't carry `applications[]` array. BE `CandidateHit` also only carries `applicationCount`.
- recommended solution: BE — widen `CandidateHit` with `repeated ApplicationRef applications = 6` where `ApplicationRef = {application_id, job_id, job_title, state}`. Drawer renders Applications list linking to applicant report.
- user impact: Search → find → review closes the loop.
- business impact: Talent search becomes productive tool instead of read-only browse.
- react features: conditional list

#### RX-12 — Evidence quotes carry `turnIndex` but FE offers no jump-to-timestamp on recording
- category: evidence-scannability
- complexity: medium
- needs_backend: true
- horizon: medium-1-3-weeks
- estimated_improvement: Verify AI claims in seconds instead of scrubbing.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:577`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:722`, `frontend/packages/api-client/src/gen/report_pb.ts:154`
- current state: `Evidence.turnIndex` is documented int32; `CompetencyCard` renders only `ev.quote` and `ev.note` — `ev.turnIndex` never read. Recording is `<video controls>` with no `currentTime` seek.
- problem: Recruiter reading "I'd choose CQRS" as evidence for Tradeoff Reasoning has no way to hear it.
- root cause: Video added before per-turn timestamps existed on report shape.
- recommended solution: BE — expose per-turn `startTimeMs` on `Evidence`. FE — "Jump to 4:12" anchor button on each blockquote running `videoRef.current.currentTime = seconds; play()`. FE-only interim: render `Turn ${ev.turnIndex}` as mono-styled pill.
- user impact: Evidence goes from quoted claim to verifiable clip.
- business impact: "Proof, not vibes" brand promise becomes true.
- react features: video ref control, currentTime seek

### P2

#### RX-7 — Post-a-job and Edit-job forms are ~200 lines of copy-paste duplication
- category: refactor
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: -200 LOC; every future field is a one-file change.
- file anchors: `frontend/apps/candidate/app/company/jobs/new/page.tsx:128`, `frontend/apps/candidate/app/company/jobs/new/page.tsx:347`, `frontend/apps/candidate/app/company/jobs/[id]/edit/page.tsx:207`, `frontend/apps/candidate/app/company/jobs/[id]/edit/page.tsx:348`
- current state: Both files define REMOTE, EMPLOYMENT constants, all Section 1..5 JSX, `GateRadio` component, `statusPill`/`statePillJobStatus` helpers. ~200 lines duplicated.
- problem: Any add (new gate mode, work mode, rubric picker) applied twice. The 07-28 audit already caught the create form dropping fields.
- root cause: Edit page cloned from new; convergence deferred.
- recommended solution: Extract `<JobForm value onChange onSubmit submitLabel status? />` into `app/company/jobs/job-form.tsx`. Both pages become 30-line shells.
- user impact: None immediately.
- business impact: Create/edit stay in sync across every future field.
- react features: component extraction

#### RX-9 — Talent search: `min_score` filter is in the proto and DTO but has no UI
- category: unused-search-capability
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Turns decorative metric into usable filter.
- file anchors: `frontend/apps/candidate/app/company/talent/page.tsx:100`, `frontend/apps/candidate/app/company/talent/sourcing-client.ts:78`, `frontend/packages/api-client/src/gen/sourcing_pb.ts:33`
- current state: `SearchCandidatesRequest.minScore` is 0..1 fit floor; `SearchCandidatesParams.minScore?` exists; client forwards it. UI exposes only Keyword + Stage.
- problem: Recruiter searching "react" can't say "fit>=0.75". 22%-fit candidate appears alongside 91%-fit.
- root cause: Talent page ported from smaller draft; third filter never landed.
- recommended solution: `<Field label='Min fit'>` with `<Select>` (Any / >=50% / >=70% / >=85%) setting `params.minScore` in same `submit()` path.
- user impact: Filter to fit threshold without visual scanning.
- business impact: Fit score gets a use.
- react features: Select

#### RX-13 — No undo grace period on Advance/Reject decisions
- category: decision-safety
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Every decision gets 5s reversal window.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:218`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:449`
- current state: Decisions fire synchronously through `decideApplication`/`holdApplication`/`rejectApplication`. `onSuccess` runs toast; no cancel window. Reject dialog notes "candidate not notified automatically" — server-side has a graceful window; FE doesn't use it.
- problem: Accidental reject committed and audit-logged. Only recourse is Advance anyway — audit shows both.
- root cause: Decision pattern ported from lower-stakes surface.
- recommended solution: Wrap in 5-second delayed commit — toast "Rejecting Alice · Undo" with countdown; RPC fires after 5s if not cancelled. Toast in @ip/ui supports action buttons; use `setTimeout` + `AbortController`.
- user impact: One-click mistakes recoverable for 5 seconds.
- business impact: Reduces "we rejected the wrong person" incidents.
- react features: setTimeout with AbortController, toast action

#### RX-14 — Jobs list has no title search or sort — 5 status chips are the only filter
- category: productivity-scale
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Search: O(scroll) → O(type).
- file anchors: `frontend/apps/candidate/app/company/jobs/page.tsx:110`, `frontend/apps/candidate/app/company/jobs/page.tsx:170`
- current state: Filter chips only: all/published/draft/paused/closed. No title search, no sort by date/applicant-count. `listJobs` returns unbounded.
- problem: Recruiter with 40 roles scrolls table.
- root cause: Filter chip pattern picked as minimum; search + sort deferred.
- recommended solution: Client-side `<Input placeholder='Search roles by title...'>` filtering `list` on `job.title.toLowerCase().includes(q)`, and `<Select>` for sort ('Most recent · Most applicants · A–Z').
- user impact: Instant navigation to a role by name.
- business impact: Jobs surface scales past 10 open roles.
- react features: controlled input + useMemo filter

#### RX-15 — Dashboard 'Latest postings' relies on undefined server order
- category: correctness
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 3-line change, correctness win.
- file anchors: `frontend/apps/candidate/app/company/page.tsx:181`, `frontend/packages/api-client/src/gen/job_pb.ts:322`
- current state: `jobList.slice(0, 4).map(...)`. Proto ListJobsRequest empty; FE never asserts a sort.
- problem: Dashboard shows 4 jobs; recruiter believes newest. May not be.
- root cause: Assumption server sorts newest-first without contract.
- recommended solution: Sort client-side by `postedAt` desc before slicing. Or ask BE to formalize sort in RPC contract.
- user impact: "Latest postings" is actually latest.
- business impact: Removes subtle trust bug.
- react features: useMemo sort

#### RX-16 — Rubric descriptors are silently dropped even within a session on rubric switch
- category: silent-data-loss
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Removes silent within-session data loss on rubric edits.
- file anchors: `frontend/apps/candidate/app/company/rubrics/page.tsx:75`, `frontend/apps/candidate/app/company/rubrics/page.tsx:311`, `frontend/apps/candidate/app/company/rubrics/page.tsx:340`
- current state: `CompRow.descriptor` textarea; disclaimer "local-only today". `loadForEdit` always resets `descriptor: ''` on load — switching rubrics wipes descriptors typed just now. No warning, no autosave.
- problem: Descriptor input present, caption warns no server persist, but even within one session it evaporates. Two rubrics in, recruiter has lost 15 minutes of thought.
- root cause: Added ahead of BE schema; intra-session persistence skipped.
- recommended solution: Persist descriptors keyed by `${identity.id}:rubric:${editingId ?? 'new'}` in localStorage. Two effects: save on change; hydrate on `loadForEdit`. BE picks up the field when ready.
- user impact: Descriptors survive rubric switching.
- business impact: Rubric creation stops being a "do it in one sitting or lose your work" task.
- react features: localStorage sync

#### RX-17 — Analytics has no per-role dimension — funnel is company-wide only
- category: analytics-shape
- complexity: medium
- needs_backend: true
- horizon: medium-1-3-weeks
- estimated_improvement: Adds per-role dimension to funnel analytics.
- file anchors: `frontend/apps/candidate/app/company/analytics/page.tsx:25`, `frontend/packages/api-client/src/gen/analytics_pb.ts:74`, `frontend/packages/api-client/src/gen/analytics_pb.ts:203`
- current state: `getFunnelAnalytics({})` returns tenant-wide. `FunnelAnalyticsRequest` has NO `job_id`. `GetJobScoreDistribution` DOES accept jobId.
- problem: Recruiter running 5 roles sees blended funnel; can't answer "which role is bleeding at interview?".
- root cause: Funnel RPC request shape defined empty; per-role breakdown never surfaced.
- recommended solution: BE — add `optional string job_id = 1` to `FunnelAnalyticsRequest`. FE — role filter chip row (from `listJobs`). Immediate FE-only interim: stack `getJobScoreDistribution` panel per role.
- user impact: Per-role funnel drop-off surfaces the weak stage.
- business impact: Analytics becomes daily decision surface.
- react features: per-role query fan-out

### P3

#### RX-18 — Post-a-job form is 5 stacked sections with no sticky TOC or anchor navigation
- category: long-form-navigation
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Better wayfinding on highest-stakes form.
- file anchors: `frontend/apps/candidate/app/company/jobs/new/page.tsx:129`, `frontend/apps/candidate/app/company/jobs/new/page.tsx:194`
- current state: Single vertical stack of 5 sections. Each has section-tag but no id, no scroll-spy, no clickable jump. ~700px tall at desktop.
- problem: Recruiter loses place. No jump to Rubric, no progress indicator, no "this section incomplete" hint.
- root cause: Design puts section metadata in a tag but doesn't surface as navigation.
- recommended solution: Add `id='section-1'..'section-5'` to each section. Sticky left rail (lg+, sticky top-24) with 5 anchor links + IntersectionObserver scroll-spy. Mobile keeps vertical stack.
- user impact: Form feels like a checklist.
- business impact: Anchored navigation lifts long-form completion rate.
- react features: IntersectionObserver hook, sticky nav

#### RX-19 — `parseSkills(skillsRaw)` runs 3x per keystroke on the job form
- category: micro-perf
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 3 calls per keystroke → 1.
- file anchors: `frontend/apps/candidate/app/company/jobs/new/page.tsx:240`, `frontend/apps/candidate/app/company/jobs/new/page.tsx:242`, `frontend/apps/candidate/app/company/jobs/[id]/edit/page.tsx:263`
- current state: `parseSkills(skillsRaw)` called twice inside JSX + once in mutation body. Same pattern in edit page.
- problem: Not user-visible bug. Any future add to parseSkills (canonicalization, spell-check) compounds by 3x.
- root cause: Direct call rather than memoized derivation.
- recommended solution: `const skills = useMemo(() => parseSkills(skillsRaw), [skillsRaw])`.
- user impact: None immediately.
- business impact: None.
- react features: useMemo

#### RX-20 — Schedule note field has no live character counter until cap is exceeded
- category: input-affordance
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Removes post-hoc validation surprise.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/schedule/page.tsx:410`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/schedule/page.tsx:420`
- current state: Note textarea Field shows error only after exceeding 1024 chars. No live counter.
- problem: Recruiter can't see how close to cap while composing.
- root cause: Written as error-on-overflow, not live-affordance.
- recommended solution: Add `hint` prop to Field rendering `{value.length} / {max}`. Reuse across rubric descriptor, JD text, reason freeText.
- user impact: Live counter guides composition.
- business impact: Reduces trial-and-error.
- react features: controlled input length

---

## Dimension 5 — AI-driven UX features

### P0

#### AI-1 — Dashboard 'Recommended' cards ship as 'Recommended role' placeholders
- category: correctness
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Large CTR jump when the differentiator becomes readable.
- file anchors: `frontend/apps/candidate/components/dashboard.tsx:83`, `frontend/apps/candidate/components/dashboard.tsx:402`, `frontend/apps/candidate/components/dashboard.tsx:411`, `frontend/apps/candidate/components/dashboard.tsx:417`, `frontend/packages/api-client/src/gen/recommendation_pb.ts:57`
- current state: `getCandidateRecommendations({})` maps matches into cards. Card title is literal "Recommended role". `Match` proto carries only jobId + score + reasons. Card also renders only `reasons[0]`.
- problem: Three identical placeholder rows. Users can't decide which of 3 "Recommended role" cards to open.
- root cause: RecommendationService returns matches keyed by jobId; FE never fans out to `getJob` to hydrate title/company/salary.
- recommended solution: `useQueries` batch calling `getJob({jobId: m.jobId})` (staleTime 5 min, keyed by jobId). Replace "Recommended role" with real title, add company name as secondary line, show 2–3 reasons as pill chips.
- user impact: Candidates see which role is being recommended and compare titles + reasons at a glance.
- business impact: Direct improvement in dashboard→job→apply funnel. Recommendation impression → click is the primary AI activation event.
- react features: useQueries, Suspense per row

#### AI-2 — Recruiter kanban never calls `GetJobRankedCandidates` — no rank, score, or why
- category: missing-feature
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Recruiter effort-per-hire substantially down.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/page.tsx:60`, `frontend/apps/candidate/app/company/jobs/[id]/page.tsx:94`, `frontend/apps/candidate/app/company/jobs/[id]/page.tsx:186`, `frontend/apps/candidate/app/company/jobs/[id]/page.tsx:203`, `frontend/packages/api-client/src/gen/recommendation_pb.ts:130`
- current state: `listApplicants` returns applicationId/jobId/candidateUserId/state. Card renders `candidateHandle(a.candidateUserId).slice(0,8).toUpperCase()` + state pill. `grep -rn getJobRankedCandidates` = zero hits.
- problem: Recruiter's core surface presents 200 anonymous handles with no ranking signal.
- root cause: Pipeline built against applications list; never joined ranking service.
- recommended solution: Parallel `useAuthedQuery(['ranked', id], () => api.recommendations.getJobRankedCandidates({jobId: id}))`. Build `Map<candidateUserId, {score, reasons[]}>`. Sort within each lane by score desc. Add compact `ScoreRing` mini (32px) + top reason chip on each card.
- user impact: Time-to-first-report-open drops from N clicks to 1.
- business impact: The flagship "AI helps you decide" recruiter feature; today entirely dark.
- react features: useAuthedQuery, useMemo for ranked-map join

**Note:** Dedupe with RX-1 (same defect surface); different priority stamps.

### P1

#### AI-3 — No side-by-side candidate compare — tab-switching between reports is the only path
- category: missing-feature
- complexity: medium
- needs_backend: false
- horizon: medium-1-3-weeks
- estimated_improvement: Shortlist review time down to a fraction.
- file anchors: `frontend/apps/candidate/app/compare/take-home/page.tsx:1`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:135`, `frontend/apps/candidate/app/company/jobs/[id]/page.tsx:186`, `frontend/packages/api-client/src/gen/report_pb.ts:249`
- current state: Only `/compare` route is `/compare/take-home` (marketing). Recruiter has one detail view. `api.reports.getReport` idempotent + safely parallelizable.
- problem: Comparing 2–3 finalists requires tab-switching between full-page report screens. Copy-paste to spreadsheet.
- root cause: Route doesn't exist.
- recommended solution: `/company/jobs/[id]/compare?appIds=a,b,c` (up to 3). Fan out to `getReport` for each in parallel. Three columns of existing report primitives. "Compare selected" from pipeline kanban checkbox.
- user impact: Three finalists in one glance; quote-cite evidence into decision meeting.
- business impact: Direct time savings + defensible decision artifact.
- react features: Parallel useAuthedQuery via Promise.all, Route-level query state

#### AI-4 — CompanyShell has no ⌘K / global search while CandidateShell has one
- category: missing-feature
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Recruiter clicks per pipeline switch: 3 → 0.
- file anchors: `frontend/apps/candidate/components/candidate-shell.tsx:92`, `frontend/apps/candidate/components/candidate-shell.tsx:229`, `frontend/apps/candidate/components/company-shell.tsx:149`, `frontend/apps/candidate/components/command-palette.tsx:14`
- current state: `candidate-shell.tsx` registers ⌘K listener + renders `CommandPalette`. `company-shell.tsx` has neither.
- problem: Recruiter reviewing candidate on job A can't jump to job B without clicking through.
- root cause: Palette added to CandidateShell only.
- recommended solution: Extract ⌘K keydown effect + CommandPalette into shared hook, or duplicate the 20-line block into `company-shell.tsx` (nav list = `NAV_HIRING + NAV_WORKSPACE`). Feed palette a recent-viewed jobs/candidates index (localStorage or `['job', id]` cache keys).
- user impact: One shortcut opens fuzzy jump across every recruiter route.
- business impact: Everyday productivity win.
- react features: Shared hook for keyboard shortcut, React Query cache read for recent items

#### AI-5 — Job detail hides skill-gap against candidate's profile even though both sides ship
- category: missing-feature
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Higher applicant fit → fewer gated_out → less recruiter waste.
- file anchors: `frontend/apps/candidate/app/jobs/[id]/job-detail-sidebar.tsx:42`, `frontend/apps/candidate/app/jobs/[id]/apply-island.tsx:97`, `frontend/apps/candidate/app/profile/page.tsx:476`, `frontend/apps/candidate/components/job-card.tsx:125`
- current state: `/jobs/[id]` shows title/JD/salary/employment/Apply. No personalized profile-vs-job skills comparison. Profile has `SkillChips`; `JobDetailDTO` exposes `job.skills` (used only in JobCard).
- problem: The AI feature "skill-gap analysis, application guidance" has no surface; both sides of the join exist client-side.
- root cause: Apply flow built as public SSR; personalization requiring auth was never added.
- recommended solution: JobDetailSidebar client island: `useAuthedQuery` for `getProfile`, compute `matched = intersection(profile.skills, job.skills)` and `missing = difference(...)`, render "You match {matched.length}/{job.skills.length}" with matched chips + missing chips + "Add {missing[0]} to your profile" link. Render nothing when signed-out.
- user impact: Candidates self-assess fit before applying; nudges profile-completion loop.
- business impact: Application quality up; recruiter noise down.
- react features: useAuthedQuery inside client island, Set intersection memoized

#### AI-6 — Applicant kanban cards carry zero substance — no summary or top skill
- category: ux
- complexity: medium
- needs_backend: false
- horizon: medium-1-3-weeks
- estimated_improvement: Report open rate down (skip cards dismissable from summary); shortlist decisions faster.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/page.tsx:212`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:149`, `frontend/packages/api-client/src/gen/report_pb.ts:249`
- current state: Card = Avatar with 2-char handle + mono "Applicant" text + state pill. Even 'scored'/'interviewed' applicants — with `executiveSummary + overallScore` in `getReport` — show nothing.
- problem: 20 applicants in 'scored' → can't tell strong Python from polite-but-weak without opening each report.
- root cause: Report data not hydrated at pipeline level.
- recommended solution: For `state in ['interviewed','scored','shortlisted','hired','rejected']` prefetch `getReport` via batched `useQueries`. Render one-line `executiveSummary.slice(0, 100)` + `ScoreRing` mini. For applied/aptitude_* show top matched skill from ranking join.
- user impact: Each kanban card carries distinct summary + score.
- business impact: Turns kanban from container into decision-support surface.
- react features: useQueries batch prefetch, Suspense skeleton per card

#### AI-7 — Session recording is a raw HTML5 video with no chapters or evidence jumps
- category: ux
- complexity: medium
- needs_backend: true
- horizon: medium-1-3-weeks
- estimated_improvement: Time-to-verify-a-competency-quote from ~1 min to ~5s.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:664`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:717`, `frontend/packages/api-client/src/gen/report_pb.ts:33`
- current state: `<video src={timeline.recordingUrl} controls>` with no chapters, no `<track>`, no time-coded links. Integrity flags have `at` ISO; competency evidence has `quote`.
- problem: Recruiter has to scrub through session to find moment behind a quote or flag.
- root cause: Recording opaque asset; transcript timestamps not in report DTO.
- recommended solution: FE-only interim: for every integrity flag render clickable chapter pip below video calling `videoEl.currentTime = deltaSeconds; play()`. Full: BE returns per-quote `start_time_s` + top-3 auto-highlight timeline `{start_s, end_s, label}`. FE renders "jump to strongest answer" strip above video.
- user impact: Click competency quote or flag → land on exact moment.
- business impact: "Proof, not vibes" becomes true in the review surface.
- react features: Refs to HTMLVideoElement, Controlled currentTime + Play on click

#### AI-8 — No JD-personalized cover letter draft in the Apply flow
- category: missing-feature
- complexity: medium
- needs_backend: true
- horizon: medium-1-3-weeks
- estimated_improvement: Apply conversion up (blank-page abandonment down); recruiter signal per application up.
- file anchors: `frontend/apps/candidate/app/jobs/[id]/apply-island.tsx:97`, `frontend/apps/candidate/app/jobs/[id]/apply-island.tsx:109`, `frontend/packages/shared/src/chat-stream.ts:25`, `frontend/packages/api-client/src/gen/application_pb.ts:18`
- current state: Dialog captures single consent checkbox + Submit. No free-text, no cover letter, no "why me" pitch. No chat/streaming call from apply surface.
- problem: Every application ships identical name+resume+consent, defeating personalization.
- root cause: ApplyRequest has only jobId + consent. Chat gRPC stream exists but no cover-letter entry point.
- recommended solution: "Draft with AI" button opening streamed panel reusing `streamAssistantChat` with scaffolded first message. Candidate reviews/edits before Submit. BE — add `cover_letter` to ApplyRequest + candidate-scoped `DraftCoverLetter(job_id) returns (stream Token)` reading profile server-side.
- user impact: First draft to edit; removes blank-page problem at highest-anxiety moment.
- business impact: Application quality up; durable differentiator.
- react features: Dialog + streaming Textarea binding, Optimistic edit on stream tokens

#### AI-9 — Onboarding promises match score on every card but JobCard renders none
- category: correctness
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Marketplace → apply conversion up.
- file anchors: `frontend/apps/candidate/components/onboarding/candidate-checklist.tsx:59`, `frontend/apps/candidate/components/job-card.tsx:49`, `frontend/apps/candidate/app/jobs/marketplace.tsx:1`, `frontend/apps/candidate/components/dashboard.tsx:83`
- current state: Checklist nudge: "your match score is on every card." JobCard renders company initial, title, remote/employment/salary, skills chips, posted date + optional `bestMatch` violet border — no numeric match. `matches[]` fetched in dashboard only.
- problem: Onboarding promises a UI that doesn't exist.
- root cause: Recommendations wired only into dashboard rail; marketplace's JobCard never consumes matches.
- recommended solution: Fetch `getCandidateRecommendations` in marketplace (cached), build `Map<jobId, {score, reasons[]}>`. Pass `matchScore` + `topReason` into JobCard. Render `ap-pill '{Math.round(score*100)}% match'` + one reason. Add "Sort by: Best match" toolbar option.
- user impact: Every marketplace card is real personalized rank.
- business impact: Removes trust breach; marketplace becomes ranked surface.
- react features: useQuery shared across marketplace + dashboard, Memoized jobId→match Map

#### AI-10 — No recruiter copilot — shared `ChatService` is candidate-only
- category: missing-feature
- complexity: medium
- needs_backend: true
- horizon: strategic-1-3-months
- estimated_improvement: Time-to-answer for recruiter policy/how-to collapses from doc search to citation-anchored chat.
- file anchors: `frontend/apps/candidate/components/assistant-chat.tsx:11`, `frontend/apps/candidate/components/dashboard.tsx:31`, `frontend/apps/candidate/components/dashboard.tsx:455`, `frontend/apps/candidate/components/company-shell.tsx:120`, `frontend/packages/shared/src/chat-stream.ts:25`, `frontend/packages/api-client/src/gen/chat_pb.ts:55`
- current state: `streamAssistantChat` + `AssistantChat` live in @ip/ui and shared. CandidateShell mounts `<AssistantChat/>` lazily on dashboard. CompanyShell mounts nothing similar. Chat proto carries `Citation` with url + topic.
- problem: "Chat-with-your-data recruiter copilot (bounded, evidence-cited)" has zero FE presence.
- root cause: Candidate variant was scoped to dashboard-only.
- recommended solution: `<RecruiterCopilot/>` reusing `SharedAssistantChat` with recruiter copy. Mount in CompanyShell as bottom-anchored dock. Wire to same chat stream. Full 'show React candidates who passed aptitude' queries need BE: scoped chat RPC with read-only tools (listApplicants, listJobs, getReport) returning citations.
- user impact: Always-on ask surface across recruiter workspace.
- business impact: Bounded, evidence-cited recruiter copilot is a headline product feature.
- react features: Reusable SharedAssistantChat, Stream-with-citations UI

### P2

#### AI-11 — Verdict pill lacks confidence — 51/49 borderline looks like 95/5 clear-yes
- category: ux
- complexity: medium
- needs_backend: true
- horizon: medium-1-3-weeks
- estimated_improvement: Borderline decisions become visibly borderline.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:96`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:342`, `frontend/packages/api-client/src/gen/report_pb.ts:283`, `frontend/packages/api-client/src/gen/report_pb.ts:287`
- current state: Single binary tag `<span>Recommended · {capitalize(dto.recommendation)}</span>`. Proto has overallScore + recommendation, no confidence.
- problem: 51/49 borderline looks identical to 95/5 clear-yes.
- root cause: Report DTO has no confidence signal.
- recommended solution: BE — add `float recommendation_confidence = 11` (0..1) + optional `repeated CommitteeVote committee = 12`. FE renders confidence bar next to pill + "Aptura and 2 reviewers agree; 1 disagrees" on large spread. Interim FE-only: approximate 'borderline' when `|overallScore-0.5| < 0.1`.
- user impact: Recruiter calibrates own confidence against model's.
- business impact: Better decisions on borderline cases + defensibility.
- react features: Simple derived UI, Progressive enhancement when field lands

#### AI-12 — Practice → real-interview loop is not connected — lobby has no coaching
- category: missing-feature
- complexity: medium
- needs_backend: true
- horizon: medium-1-3-weeks
- estimated_improvement: Interview score distribution shifts up; interview lobby abandonment down.
- file anchors: `frontend/apps/candidate/app/practice/page.tsx:1`, `frontend/apps/candidate/app/interview/[applicationId]/lobby`, `frontend/apps/candidate/components/growth-feedback-panel.tsx:1`, `frontend/apps/candidate/app/interview/[applicationId]/page.tsx:73`
- current state: Practice runs private text runner and stores growth feedback. Interview lobby starts DevicePrecheck and dumps candidate into proctored room. No bridge; lobby never surfaces "your weakest last time was tradeoff reasoning".
- problem: Practice + Interview are semantic siblings but architecturally disconnected.
- root cause: Two surfaces built in isolation.
- recommended solution: Lobby: if `practiceClient.list()` returns sessions, add "Warm-up snapshot" cell with last-run gaps as chips + "Recap growth notes" link + "Do-One-More-Round" 3-question private run. FE-only against existing practice-client. BE — extend GrowthFeedback with per-competency 'next-question suggestions' for 60-second targeted rehearsal.
- user impact: Candidates enter proctored room warmed up on exact weakest competency.
- business impact: Interview quality per candidate up.
- react features: Cross-surface data hydration via TanStack cache, Inline practice sub-flow

---

## Dimension 6 — Accessibility (WCAG 2.2 AA)

### P0

#### AY-1 — Interview + aptitude countdown timers have no ARIA — unreadable to screen readers
- category: a11y-aria
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Class-A a11y defect on both stakes-critical flows eliminated; WCAG 2.4.3 (Focus Order) + 4.1.3 (Status Messages).
- file anchors: `frontend/apps/candidate/app/interview/[applicationId]/page.tsx:338`, `frontend/apps/candidate/components/coding-section.tsx:58-62`, `frontend/apps/candidate/lib/use-countdown.ts:22-60`
- current state: Interview HUD elapsed clock `<span className="ap-hud-timer">{formatElapsed(elapsed)}</span>` — no role, no aria-label, no aria-live. Aptitude coding `<Badge tone="neutral" variant="subtle">{timeLeft}</Badge>`. `useCountdown` returns a bare `mm:ss` string with no numeric seconds.
- problem: Two graded, one-shot flows both auto-submit at zero, and remaining budget is inaccessible.
- root cause: Timer UI never wore WAI-ARIA `timer` pattern. `useCountdown` returns only display string.
- recommended solution: (1) `useCountdown` returns `{display, secondsLeft}`. (2) Wrap timer spans in `role="timer" aria-label="Time remaining"`. (3) Separate `<div role="status" aria-live="polite" className="sr-only">` announcing "5 minutes remaining", "1 minute remaining", "30 seconds", "10 seconds" when secondsLeft crosses each threshold; throttled by ref.
- user impact: Screen-reader candidates get audible warnings at same visual thresholds; deaf-blind/low-vision users complete without auto-submit surprise.
- business impact: Closes class-A WCAG 2.2 gap on a graded flow. High legal exposure (EAA 2025).
- WCAG: 2.4.3, 4.1.3

#### AY-2 — Auth Field lacks aria-invalid + aria-describedby across 7 auth screens
- category: a11y-forms
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: All 7 auth screens under WCAG 3.3.1, 3.3.3, 4.1.3.
- file anchors: `frontend/apps/candidate/components/auth/auth-card.tsx:88-148`, `frontend/apps/candidate/components/auth/auth-card.tsx:150-174`, `frontend/apps/candidate/app/login/page.tsx:98-135`, `frontend/apps/candidate/app/register/page.tsx:62-100`, `frontend/apps/candidate/app/forgot/page.tsx:80`, `frontend/apps/candidate/app/reset/page.tsx:106`, `frontend/packages/ui/src/field.tsx:11-68`
- current state: Field primitive renders plain `<input>` with only id/name/type/required/value/onChange — no aria-invalid, no aria-describedby, no error slot. Login/register/forgot/reset/verify/callback/company-register all import. Each form surfaces top-of-form Notice with `role={tone === 'danger' ? 'alert' : undefined}` — no linkage to invalid input, no focus movement. Every form has `noValidate`. `@ip/ui` Field already does this correctly via cloneElement — auth-card Field is separate older primitive.
- problem: AT user submits `/login` with wrong password → single "already exists" alert; input not marked invalid; focus stays on Sign in button; no path back to failing field.
- root cause: `auth-card.tsx` scaffolded before `@ip/ui` Field landed; parallel primitives survive.
- recommended solution: Replace auth-card Field with `@ip/ui`'s Field, OR extend auth-card Field with `error?: string`, render linked `<p id="${id}-error" role="alert">`, set `aria-invalid` + `aria-describedby`. Move focus to first invalid input on submit failure.
- user impact: Screen reader hears "Email, invalid, An account with this email already exists"; keyboard users taken back to invalid field.
- business impact: Registration + login are funnel entry for both audiences.
- WCAG: 3.3.1, 3.3.3, 4.1.3

### P1

#### AY-3 — Proctored interview + aptitude routes ship no skip-to-content link
- category: a11y-landmarks
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Cuts tab-count-to-first-actionable from 6-8 to 1 on both graded flows.
- file anchors: `frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx:242,284`, `frontend/apps/candidate/app/interview/[applicationId]/page.tsx:261`, `frontend/apps/candidate/app/interview/[applicationId]/lobby/page.tsx:166`, `frontend/apps/candidate/app/interview/[applicationId]/done/page.tsx:31`, `frontend/packages/ui/src/app-shell.tsx:98-103`
- current state: SidebarShell + MarketingShell correctly ship visually-hidden skip link. Interview/aptitude pages use `<main>` directly, no SidebarShell, no skip link.
- problem: `/accessibility` publicly promises a skip link — absent on flows where it matters most.
- root cause: Focused-room routes opted out of SidebarShell without re-implementing the skip-link piece.
- recommended solution: Extract `<SkipToContent targetId="main" />` into `@ip/ui`, add to interview page, lobby, done, aptitude. Add `id="main" tabIndex={-1}` to each `<main>`.
- user impact: Keyboard-only candidates skip directly to question 1 / captions / End interview.
- business impact: Aligns implementation with `/accessibility` promise.
- WCAG: 2.4.1 (Bypass Blocks)

#### AY-4 — Alert always uses `role="alert"` — info + success banners interrupt screen readers
- category: a11y-aria
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: One 5-line change downgrades ~40+ live-region interrupts per session to polite.
- file anchors: `frontend/packages/ui/src/alert.tsx:87-98`
- current state: Every tone (info/success/warning/danger) wraps in `<div role="alert">` — implicit `aria-live="assertive"`. Dashboard, marketplace, applications, aptitude, DevicePrecheck, marketing hero all mount info/success Alerts that barge in.
- problem: Blind candidate opening `/aptitude` gets HUD description cut off. AT users learn to distrust the app.
- root cause: One-size-fits-all role.
- recommended solution: In alert.tsx pick role by tone: `role="alert" aria-live="assertive"` for danger, `role="status" aria-live="polite"` for success/info/warning. Optional `announce={false}` escape hatch for danger alerts already visible from initial paint.
- user impact: Screen readers stop being interrupted for static info banners.
- business impact: Reduces AT-user friction across dozens of surfaces.
- WCAG: 4.1.3

#### AY-5 — Badge solid variant pairs white text with mid-luminance fills below AA 4.5:1
- category: a11y-contrast
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 3 tone × 1 color-mix change; measured with Chrome DevTools contrast checker.
- file anchors: `frontend/packages/ui/src/badge.tsx:20-50`, `frontend/packages/ui/src/styles/tokens.css:40-42,117-130`
- current state: badge.tsx defaults `variant: { solid: "text-white" }`; compound variants set `bg-info`, `bg-success`, `bg-danger` without foreground override. Tokens: `--good=oklch(0.60 0.14 150)`, `--danger=oklch(0.58 0.20 25)`, `--info=oklch(0.55 0.13 230)`. White on those lands ~3.0–4.9:1 — sub-4.5:1 for 12px badge text.
- problem: Solid-danger Badge ("Rejected", "Auto-terminated") unreadable for low-vision users. Same for solid-success on messages/notification badges.
- root cause: Palette tuned for text-on-surface pills; solid-fill Badge inherited default text-white without foreground pair.
- recommended solution: Replace three bare compound variants with explicit foreground pairs on darker fill: add `--danger-strong`/`--success-strong`/`--info-strong` tokens at ~L=0.42–0.44. Alternately force outline variant on small text and reserve solid for larger UI.
- user impact: Status pills readable at low vision.
- business impact: Closes WCAG 1.4.3 on audit table + pipeline.
- WCAG: 1.4.3

#### AY-6 — Route change fires no page-title announcement or focus reset
- category: a11y-focus
- complexity: medium
- needs_backend: false
- horizon: medium-1-3-weeks
- estimated_improvement: One `<RouteAnnouncer />` covers all ~40 routes.
- file anchors: `frontend/apps/candidate/app/template.tsx:6-8`, `frontend/apps/candidate/app/providers.tsx:13-24`, `frontend/packages/ui/src/app-shell.tsx:148`
- current state: `template.tsx:6-8` wraps every route in `<div className="animate-fade-in">` — no title announcement, no `document.title` push into live region, no focus reset to new main heading. Next 15 App Router doesn't auto-announce.
- problem: AT candidate navigates Jobs → Job detail; screen reader keeps saying the previously-clicked link. Focus stays on old Link.
- root cause: SPA transitions rely on app to announce navigations; nothing wired.
- recommended solution: `<RouteAnnouncer />` client component in `template.tsx`. On pathname change: (a) push document.title into `aria-live="polite" aria-atomic="true" role="status"` visually-hidden region; (b) move focus to shell's `<main>` (already `tabIndex={-1}` in SidebarShell) or first h1. Guard on `prefers-reduced-motion`.
- user impact: Screen readers announce arrival at new page; focus lands in page content.
- business impact: Closes largest live-region gap in SPA.
- WCAG: 2.4.2 (Page Titled), 2.4.3 (Focus Order)

#### AY-8 — Interview session recording video ships with no captions track
- category: a11y-media
- complexity: medium
- needs_backend: true
- horizon: medium-1-3-weeks
- estimated_improvement: Legally-required captioning on highest-stakes evidence surface.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:717-728`, `frontend/apps/candidate/components/interview-captions.tsx`
- current state: `<video src={timeline.recordingUrl} controls aria-label="Proctored interview session recording" />` — no `<track kind="captions">`, no transcript nearby. `InterviewCaptions` renders live captions during session — same transcript likely available post-hoc.
- problem: Deaf/HoH recruiter reviewing recording gets no access to what candidate said. Candidate revisiting own recording also blocked.
- root cause: Proctor recording pipeline wired without exposing transcript URL / caption track on ReportDTO.
- recommended solution: `<track kind="captions" srcLang="en" default src={timeline.transcriptVttUrl} />` inside video. Requires BE to expose `transcriptVttUrl` on the same report/timeline RPC.
- user impact: Deaf reviewers read transcript inline while scrubbing.
- business impact: Hard EAA/ADA requirement for a hiring product.
- WCAG: 1.2.2 (Captions – Prerecorded)

### P2

#### AY-7 — Applicant detail uses `aria-pressed` buttons instead of `role="tab"` tablist
- category: a11y-aria
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Deletes homegrown TabButton, saves ~20 lines, gains correct ARIA + keyboard.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:540-559`, `frontend/packages/ui/src/tabs.tsx`, `frontend/apps/candidate/app/settings/page.tsx:39-73`
- current state: Local `<button aria-pressed={active}>` for Report/Schedule/Messages tabs; panels are plain `<div>` without role="tabpanel"/aria-labelledby. `@ip/ui` Tabs primitive exists and is used in `/settings`.
- problem: Screen reader announces "Report, toggle button, pressed" instead of "Report, tab, 1 of 3". Keyboard user can't arrow between tabs.
- root cause: Button pattern cheaper than adopting shared primitive.
- recommended solution: Swap three `<TabButton>` renders for `<Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="report">…</TabsTrigger>...</TabsList><TabsContent>…</TabsContent></Tabs>`. Delete local TabButton.
- user impact: Recruiter gets arrow-key navigation + correct tab semantics.
- business impact: Enterprise a11y compliance on the recruiter's core screen.
- WCAG: 4.1.2

#### AY-9 — Company shell mounts no NotificationBell — recruiters lose notification surface
- category: a11y-parity
- complexity: medium
- needs_backend: false
- horizon: medium-1-3-weeks
- estimated_improvement: One helper + one line adds full notification surface.
- file anchors: `frontend/apps/candidate/components/company-shell.tsx:149-176`, `frontend/apps/candidate/components/candidate-shell.tsx:191`, `frontend/packages/ui/src/notification-bell.tsx:63-138`
- current state: CandidateShell mounts `<NotificationBell />` with correct aria-label. CompanyShell has none — topbar goes from pre-launch pill to avatar.
- problem: Application state machine emits recruiter-side notifications; recruiters see none in-app. AT recruiters also lose announced unread count.
- root cause: Parity gap.
- recommended solution: Extract NotificationBell + client-init memo into `<CandidateNotifications />` helper OR reuse `@ip/ui` NotificationBell with company-side `filterItems` prop that drops candidate-only kinds. Mount in `company-shell.tsx:154`.
- user impact: Recruiters see same unread badge candidates see.
- business impact: Feature parity + a11y parity.
- WCAG: 4.1.3

#### AY-10 — Integrity timeline pips carry title-only tooltips — keyboard inaccessible
- category: a11y-keyboard
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 3 minutes of AT-user work replaces title-attribute dead-end.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:664-686`
- current state: Each pip is `<span title="…" />`. HTML `title` is keyboard-inaccessible; the span isn't focusable. Parent is `<div role="img" aria-label="Interview integrity timeline">` — individual signals invisible to AT.
- problem: Timeline's visual affordance is to jump to matching flag; today only usable with mouse.
- root cause: Pips built as pure visual glyphs; never promoted to interactive.
- recommended solution: Replace `<span>` with `<button type="button" aria-label="{signalLabel(f.type)} at {toLocaleTimeString(f.at)}, {sevLabel(f.severity)}" onClick={() => scrollTo(articleRef.current[i])}>`. Wire click to scroll matching article + focus its heading.
- user impact: Keyboard recruiters tab through pips + jump to matching event card.
- business impact: Integrity timeline is the visual centerpiece of the audit story.
- WCAG: 2.1.1 (Keyboard)

#### AY-11 — Onboarding step advance leaves focus on the button, no live announcement
- category: a11y-focus
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: One useEffect + one ref.
- file anchors: `frontend/apps/candidate/app/onboarding/page.tsx:92,255-265,297-303,306-339`
- current state: `advance()` calls `setStep(2/3/4)` inside — no useEffect focuses the new StepShell heading. The `<h1>` at line 297 is fixed; only inner StepShell re-renders. Focus stays on Continue button.
- problem: AT candidate clicks Continue → tab press goes back to Continue. Screen reader hears nothing on step advance.
- root cause: Wizard advance wired state without step-transition focus pattern.
- recommended solution: `stepHeadingRef = useRef<HTMLHeadingElement>(null)` on `<h1>`, `useEffect(() => { stepHeadingRef.current?.focus() }, [step])`. Change ol progress strip to `role="list" aria-label={\`Step ${step} of 4: ${STEP_TITLES[step-1]}\`}`, OR add sr-only live-polite region announcing step title on change.
- user impact: AT hears "Step 2 of 4, Where do you want to work?" on Continue.
- business impact: Onboarding funnel completion for AT users improves.
- WCAG: 2.4.3, 4.1.3

#### AY-12 — Radix Select inside bare `<label>` — label click does not focus trigger
- category: a11y-forms
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 3-line swap per callsite.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:807-833`, `frontend/apps/candidate/app/profile/page.tsx:445-460`, `frontend/packages/ui/src/field.tsx:11-68`
- current state: `<label className="grid gap-1.5"><span>Reason</span><Select>...</Select></label>`. Native `<label>` click delegation only works for input/textarea/select — Radix Select renders `<button>` trigger; label click does nothing.
- problem: Sighted click on "Reason" text → nothing. AT users: no reliable aria-labelledby link.
- root cause: Copy-paste from native `<select>` pattern that doesn't survive Radix swap.
- recommended solution: Use `@ip/ui` `<Field label="Reason" htmlFor="decide-reason">` primitive (already injects id + label association), or `<div><label htmlFor="decide-reason">Reason</label><SelectTrigger id="decide-reason">`. Applies to ReasonDialog + profile Select.
- user impact: Label click opens select; AT hears named combo box.
- business impact: Reason dialog is audit-trail chokepoint.
- WCAG: 1.3.1, 4.1.2

#### AY-14 — Auth submit failure does not move focus or scroll to the top Notice
- category: a11y-forms
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Two-line onError effect per page.
- file anchors: `frontend/apps/candidate/app/login/page.tsx:70-87,100`, `frontend/apps/candidate/app/register/page.tsx:33-51,62-64`, `frontend/apps/candidate/components/auth/auth-card.tsx:150-174`
- current state: Login/register catch onSubmit and `setError(errorMessage(err))`. Notice renders with `role="alert"`. On failure, focus stays on Submit button; page not scrolled.
- problem: Candidate on small viewport submits below-the-fold, sees no visible change, mashes Enter again.
- root cause: Error UX written before error-focus pattern standardized.
- recommended solution: In each auth page's onSubmit catch, after setError: `errorRef.current?.focus()` where errorRef is on Notice (add `tabIndex={-1}` to Notice), or `scrollIntoView({block:'start', behavior:'smooth'})`. Combined with per-field aria-invalid (AY-2) covers both cases.
- user impact: Sighted keyboard users see error banner immediately; AT users get assertive announcement + focus on alert.
- business impact: Fewer duplicate submits.
- WCAG: 3.3.1

### P3

#### AY-13 — NotificationItem is a `<button>` that navigates — wrong semantic
- category: a11y-semantics
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: One primitive swap fixes semantics + gains new-tab support.
- file anchors: `frontend/packages/ui/src/notification-item.tsx:60-84`, `frontend/packages/ui/src/notification-bell.tsx:107-110,169-178`
- current state: Row is `<button type="button" onClick={onClick}>` with aria-label. Parent's onClick calls `onNavigate(link)` → `router.push(link)`. Row IS a navigation link. Screen readers announce "button".
- problem: AT users expect state change; get navigation. No Alt+Click / middle-click / right-click new-tab.
- root cause: Row also marks read; author reached for button.
- recommended solution: Change row to `<a href={link ?? "#"} onClick={(e) => { if (!link) e.preventDefault(); onClick?.(); }}>`. Native link semantics + middle-click behavior AT expects.
- user impact: AT hears "Notification, link"; middle-click opens new tab.
- business impact: Small a11y correctness across notification surfaces.
- WCAG: 1.3.1

---

## Dimension 7 — Design system consistency + scale

### P1

#### DS-5 — Auth surfaces carry a private Field/Notice/PrimaryButton that shadows @ip/ui
- category: consolidation
- complexity: medium
- needs_backend: false
- horizon: medium-1-3-weeks
- estimated_improvement: ~120 LOC deleted, 6 auth pages inherit shared Field/Alert/Button improvements including P1 a11y fix (AY-2).
- file anchors: `frontend/apps/candidate/components/auth/auth-card.tsx:88`, `frontend/apps/candidate/components/auth/auth-card.tsx:150`, `frontend/apps/candidate/components/auth/auth-card.tsx:177`, `frontend/packages/ui/src/field.tsx:11`, `frontend/apps/candidate/app/waitlist/page-client.tsx:118`
- current state: auth-card.tsx defines local Field (88-148), Notice (150-174), PrimaryButton (177-207) used by /login, /register, /company/register, /forgot, /reset, /verify, /auth/callback. `@ip/ui` Field already supports error/hint/aria-invalid/aria-describedby. Local Notice constructs three inline `color-mix` strings — different tones than shared Alert. Waitlist has yet a third Field. Local PrimaryButton is 4 hard-coded classes over shared Button+asChild.
- problem: Any polish on shared Field/Alert/Button has to be re-implemented three places. /forgot success card renders subtly different green than /interview success Alert.
- root cause: auth-card.tsx predates @ip/ui Field getting error handling and Alert getting tone system.
- recommended solution: One PR: import Field from `@ip/ui` with `error={fieldErrors.email}`, replace Notice with `<Alert tone=…>`, replace PrimaryButton with `<Button variant='default' size='lg' loading={busy}>`. Handles the AY-2 aria-invalid fix in the same swap. Delete auth-card's local components; keep AuthShell + PasswordMeter + SsoSlot.
- user impact: Consistent error/success visual across every auth surface AND rest of app; AY-2 fix lands as byproduct.
- business impact: 3-primitive consolidation removes ~120 LOC.

### P2

#### DS-1 — `accent-teal` on gate-mode radios paints stock teal, not brand violet
- category: correctness
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 2 files, ~2 lines each; user-visible on every gate-mode radio.
- file anchors: `frontend/apps/candidate/app/company/jobs/new/page.tsx:375`, `frontend/apps/candidate/app/company/jobs/[id]/edit/page.tsx:376`
- current state: `<input type='radio' className='mt-1 size-4 accent-teal'>`. `accent-teal` is Tailwind stock (green-cyan). Brand token renamed `--teal → --brand` across the system. `--color-teal-*` not declared in `@theme inline`. Selected radio paints Tailwind default teal-500 while surrounding container uses `border-brand bg-brand-soft` (deep violet).
- problem: Recruiter picking gate policy sees a wrong-color dot contradicting violet card border.
- root cause: Post-rename the `accent-teal` utility was left in JSX; Tailwind silently resolved against stock palette.
- recommended solution: Replace with `accent-brand`, or hide the native input (`sr-only`) and let the outer label be the visual — one class change.
- user impact: Consistent violet across gate-mode picker.
- business impact: Removes small "software looks unfinished" cue during vendor demos.

#### DS-2 — Five recruiter tables reimplement thead/td markup around dead `.data` / `.table-wrap`
- category: consolidation
- complexity: medium
- needs_backend: false
- horizon: medium-1-3-weeks
- estimated_improvement: ~5 files migrate to shared Table; ~200 duplicated LOC removed.
- file anchors: `frontend/apps/candidate/app/company/audit/page.tsx:249`, `frontend/apps/candidate/app/company/team/page.tsx:158`, `frontend/apps/candidate/app/company/jobs/page.tsx:172`, `frontend/apps/candidate/app/company/billing/page.tsx:257`, `frontend/apps/candidate/app/company/talent/page.tsx:345`, `frontend/packages/ui/src/table.tsx:9`
- current state: Five surfaces wrap `<table className="data w-full text-sm">` in `<div className="table-wrap">`. Neither class is defined. Each re-copies same thead className with one already drifting (`text-[0.72rem] font-semibold`). `@ip/ui` Table exports exist but no recruiter surface imports.
- problem: Five daily-recruiter surfaces each own private table with drift. Bugs fixed on one page must be fixed on all five.
- root cause: `.data`/`.table-wrap` seem to be plan for shared data-table CSS never landed. `@ip/ui` Table authored generically without recruiter density.
- recommended solution: (1) Delete dead `.data` and `.table-wrap` classnames now. (2) Migrate five tables to `@ip/ui` Table/TableHead/TableCell — add `density?: 'comfortable' | 'compact'` prop. Adopt `density='compact'` in audit + team + talent (see DS-3).
- user impact: One visual table across every workspace surface.
- business impact: Fewer bug-scattering PRs.

#### DS-3 — No compact density on recruiter tables — ~10 rows/viewport where 15+ would fit
- category: density
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 40–70% more rows per viewport on 4 recruiter tables.
- file anchors: `frontend/apps/candidate/app/company/audit/page.tsx:250`, `frontend/apps/candidate/app/company/team/page.tsx:159`, `frontend/apps/candidate/app/company/talent/page.tsx:346`, `frontend/apps/candidate/app/company/billing/page.tsx:257`, `frontend/packages/ui/src/table.tsx:9`
- current state: Every recruiter table uses `px-4 py-3` (48px rows with `text-sm`). `@ip/ui` Table has no density prop; SidebarShell has no density mode.
- problem: Recruiter is density-hungry: audit, talent, applicants reward more rows without scrolling. `py-1.5` compact variant (28px rows) → 17 rows vs 10 in a 1440×900 viewport.
- root cause: Shared component defaulted to candidate footprint; no explicit recruiter density story.
- recommended solution: Add `density?: 'comfortable' | 'compact'` to `@ip/ui` Table. Adopt on audit + talent + team + billing. Optionally broadcast via `CompanyShell` `data-density='compact'`.
- user impact: Recruiter sees 40–70% more rows on log-shaped surfaces.
- business impact: Directly hits "recruiter tables deserve compact" brief item.

#### DS-4 — `StatusPill` primitive is unused (0 imports); `ap-pill` class stamped 96 times inline
- category: consolidation
- complexity: medium
- needs_backend: false
- horizon: medium-1-3-weeks
- estimated_improvement: ~30 call-site migrations; one central tone map; removes 2 local `pillVariant` helpers.
- file anchors: `frontend/packages/ui/src/status-pill.tsx:23`, `frontend/apps/candidate/app/applications/[id]/page.tsx:430`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:96`, `frontend/apps/candidate/app/company/audit/page.tsx:287`, `frontend/apps/candidate/app/company/team/page.tsx:218`, `frontend/apps/candidate/app/company/jobs/[id]/page.tsx:264`
- current state: `@ip/ui` exports `StatusPill` composing `applicationPillStatus(state)` + `statusToneClasses(tone)`. Zero imports across the app. 96 raw `ap-pill ap-pill--good|warn|danger|teal|coral` classNames inline. Applications detail has bespoke `pillVariant`, applicant report has local `recommendationPill()`.
- problem: Three different files can (and do) map same state to different colors (P2 audit already caught withdrawn/expired/abandoned untinted in one place while dashboard tints them).
- root cause: `StatusPill` shipped after `ap-pill` utility was already wired.
- recommended solution: Swap ~15 highest-traffic call sites (dashboard/applications tracker/detail state pills, recruiter kanban state pill, applicant report recommendation pill). Delete local `pillVariant` + `recommendationPill`. Keep `ap-pill--teal/coral` variants for non-state pills OR codify as `<StatusPill token={{label, tone:'brand'}}>`.
- user impact: Application state pills identical across dashboard, list, detail, recruiter surfaces.
- business impact: Kills drift; new states cost 1 line instead of 12.

#### DS-7 — `@ip/ui` `layout.tsx` is `"use client"` — every PageHeader/EmptyState import ships client JS
- category: performance
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: ~30 RSC pages recover server-only status; ~2–5 kB First Load JS shaved per route.
- file anchors: `frontend/packages/ui/src/layout.tsx:1`, `frontend/packages/ui/src/layout.tsx:121`, `frontend/packages/ui/src/layout.tsx:147`, `frontend/packages/ui/src/layout.tsx:174`, `frontend/packages/ui/src/index.ts:83`
- current state: `layout.tsx:1` opens with `"use client"`. Exports AppShell (uses useState for mobile menu), PageHeader (no state), Heading (no state), EmptyState (no state), ErrorState (button onClick if retry), LoadingState (no state), SuccessState (no state). Applies to whole module.
- problem: Every RSC page importing EmptyState/PageHeader from `@ip/ui` is transitively pulled into client tree — ~55+ imports across app routes.
- root cause: AppShell (needs client) grouped with PageHeader/EmptyState/LoadingState (don't) in one module.
- recommended solution: Split into `layout-shell.tsx` (`"use client"`, AppShell only) and `layout-states.tsx` (no `"use client"`, PageHeader/Heading/EmptyState/ErrorState/LoadingState/SuccessState). Re-export from index.ts unchanged.
- user impact: Slightly faster hydration + smaller JS on ~30 product pages.
- business impact: Aligns with brief's "route Y ships X kB because Z imports the whole Aperture package client-side" concern.

#### DS-10 — Applicant report `TabButton` reimplements Radix Tabs — no keyboard arrow nav
- category: consolidation
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: -15 LOC; correct tab a11y on recruiter's most-visited page; free URL deep-link.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:536`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:275`, `frontend/packages/ui/src/tabs.tsx`
- current state: `TabButton({active, onClick, children})` rendered three times. Uses `aria-pressed` (toggle-button semantics) + `border-b-2 border-brand` active state. `@ip/ui` Tabs primitive exists, used in `/settings`.
- problem: Applicant report can't be navigated with arrow keys. Screen readers announce "button, pressed". Focus wraparound doesn't work.
- root cause: Local TabButton was cheaper to write than adopting shared Tabs.
- recommended solution: Swap for `@ip/ui` Tabs/TabsList/TabsTrigger/TabsContent (used in `/settings`). Add `?tab=…` URL sync at the same time (matches `/settings` pattern) — recruiter often shares "applicant's schedule" URL.
- user impact: Recruiter gets ArrowLeft/ArrowRight between Report/Schedule/Messages; deep-linking to specific tab works.
- business impact: Applicant report is where the app most needs to look production-grade.

### P3

#### DS-6 — 41 inline `fontFamily` overrides where Tailwind `font-display` already resolves the same var
- category: token-drift
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 41 sites → codemod; ~1 kB HTML shaved on sample-report; one anti-pattern extinct.
- file anchors: `frontend/apps/candidate/app/sample-report/page.tsx:19`, `frontend/apps/candidate/components/auth/auth-card.tsx:44`, `frontend/apps/candidate/components/auth/auth-card.tsx:62`, `frontend/apps/candidate/app/waitlist/page-client.tsx:39`, `frontend/apps/candidate/app/trust/page.tsx`, `frontend/apps/candidate/app/status/page.tsx`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:598`
- current state: 41 `style={{ fontFamily: 'var(--font-display)' }}` in-JSX overrides. sample-report/page.tsx alone has 9. Tailwind's `font-display` utility is wired to `--font-display` via `@theme inline` — identical CSS.
- problem: Inline `style` breaks Tailwind's CSS extraction — every element ships as an inline-style DOM attribute. Also outranks any class-based override — print/reduced-motion stylesheets silently fail on these elements.
- root cause: `font-display` utility landed after initial marketing pages shipped with inline styles.
- recommended solution: One codemod: replace every `style={{ fontFamily: 'var(--font-display)' }}` and `var(--font-mono)` with a `font-display`/`font-mono` class merge on same element.
- user impact: None visible directly; smaller HTML on cold-loaded marketing/legal pages helps LCP.
- business impact: Consistency hygiene. Marks the codebase as "inline styles for calc()/dynamic only".

#### DS-8 — Local Avatar in `company/jobs/[id]/page.tsx` duplicates `@ip/ui` Avatar with a size drift
- category: consolidation
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 1 file, -10 LOC, consistent avatar across recruiter kanban ↔ team.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/page.tsx:271`, `frontend/packages/ui/src/avatar.tsx:33`
- current state: Local `function Avatar({ handle })` → `<span className='grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft font-mono text-[0.65rem] font-bold text-brand-strong'>`. `@ip/ui` Avatar has same shape (`size='sm'` → `size-7 text-xs`). `company-shell.tsx:157` + `company/team/page.tsx:181` both use shared Avatar.
- problem: Kanban avatar (0.65rem font-bold) drifts from team page (0.75rem font-medium). Local can't take a real avatar URL.
- root cause: Kanban card authored before company-shell.tsx started using shared Avatar.
- recommended solution: Delete local function. Replace call sites with `<Avatar name={candidateHandle(a.candidateUserId)} size='sm' />`. If mono-font look is deliberate, pass `className='font-mono'`.
- user impact: Kanban avatar reads identically to team-members avatar.
- business impact: One less private primitive to keep in sync.

#### DS-9 — Marketing-card shadow expression duplicated verbatim across 5 files
- category: token-drift
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 5 sites → 1 utility; token ramp gains `--elev-4`.
- file anchors: `frontend/apps/candidate/components/auth/auth-card.tsx:58`, `frontend/apps/candidate/app/waitlist/page-client.tsx:68`, `frontend/apps/candidate/app/pilot/page-client.tsx:79`, `frontend/apps/candidate/app/sample-report/page.tsx:33`, `frontend/apps/candidate/app/sample-report/page.tsx:246`, `frontend/packages/ui/src/styles/tokens.css:83`
- current state: `shadow-[0_18px_56px_-28px_color-mix(in_oklch,var(--ink-deep)_28%,transparent)]` verbatim in 5 files. Doesn't match `--elev-2` or `--elev-3` values. Fourth "lifted marketing card" depth with no token.
- problem: Five surfaces each own their own copy of a 76-char shadow expression.
- root cause: "Raised marketing card" concept authored inline before `--elev-*` tokens landed.
- recommended solution: Add `--elev-marketing` (or `--elev-4`) to tokens.css and expose via `@theme inline` as `--shadow-elev-marketing`. Replace all 5 sites with `shadow-elev-marketing`. Drop color-mix. Doc note that four elev classes are the only allowed elevation utilities for cards.
- user impact: None on first paint.
- business impact: Kills a real token drift the design system said "we don't do this".

#### DS-11 — Onboarding uses `bg-[var(--brand*)]` arbitrary refs on the same flow as `bg-brand`
- category: token-drift
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 26 arbitrary refs collapsed to utilities via codemod.
- file anchors: `frontend/apps/candidate/app/onboarding/page.tsx:319`, `frontend/apps/candidate/app/onboarding/page.tsx:360`
- current state: `done ? 'bg-[var(--brand-strong)]' : current ? 'bg-[var(--brand)]' : 'bg-[var(--surface-3)]'`. `@theme inline` exposes `--color-brand`, `--color-brand-strong`, `--color-brand-soft`, `--color-surface-3` — all valid utilities. 26 more sites across the app.
- problem: Arbitrary-value form skips theme map; future rename must find + replace in 26 places.
- root cause: Arbitrary-value refs shipped before `@theme inline` mapping. Nothing lints for `bg-\[var\(--brand`.
- recommended solution: One codemod: `bg-[var(--brand)]` → `bg-brand`, `-strong` → `bg-brand-strong`, `-soft` → `bg-brand-soft`. Same for `text-` / `border-`.
- user impact: None visible.
- business impact: Consistency hygiene.

#### DS-12 — Candidate/company settings TabsList duplicate a 60-char className with token vocab drift
- category: consolidation
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 2 large classNames → 1 shared helper; TabsList gains named variant.
- file anchors: `frontend/apps/candidate/app/settings/page.tsx:43`, `frontend/apps/candidate/app/company/settings/page.tsx:31`, `frontend/packages/ui/src/tabs.tsx`
- current state: Both settings pages render `<TabsList>` with inline ~60-char className. Candidate uses `border-border bg-surface-muted`; company uses `border-line bg-surface-2`. Resolve to same OKLCH but won't stay in sync if either token pair is retuned.
- problem: Two identical Radix Tabs skins carry different classNames.
- root cause: `@ip/ui` Tabs shipped with permissive TabsList expecting caller to pass full skin.
- recommended solution: Add `variant?: 'default' | 'segmented'` to `@ip/ui` TabsList, or export `settingsTabsListClass` string helper.
- user impact: Two visually-identical tab strips stay identical after retunes.
- business impact: Removes drift trap.

#### DS-13 — Both shells hardcode the pre-launch topbar pill copy — no flag to flip at launch
- category: future-proofing
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 1-line ribbon component; 1 env var.
- file anchors: `frontend/apps/candidate/components/company-shell.tsx:151`, `frontend/apps/candidate/components/candidate-shell.tsx`
- current state: `<span>Pre-launch · company workspace</span>` in company-shell; equivalent in candidate-shell. No build flag, env var, or feature-flag guard.
- problem: Launch day requires editing two files.
- root cause: Static JSX rather than shared component or flag-gated block.
- recommended solution: Extract to `<PreLaunchBadge audience='candidate'|'company' />` rendering when `process.env.NEXT_PUBLIC_LAUNCH_PHASE !== 'live'`. No feature-flag infra — matches existing `NEXT_PUBLIC_MOCK` pattern.
- user impact: Both ribbons vanish on single deploy env change.
- business impact: Safe launch-day toggle.

---

## Dimension 8 — Architecture, state, DX

### P1

#### AR-1 — Messages client seam re-instantiated in six places instead of a hook
- category: api-client-seam
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 6 duplicated blocks → 1 hook; ~40 LOC removed + cadence bug fixed.
- file anchors: `frontend/apps/candidate/app/messages/messages-client.ts:54`, `frontend/apps/candidate/components/candidate-shell.tsx:77`, `frontend/apps/candidate/components/message-thread-view.tsx:29`, `frontend/apps/candidate/app/messages/page.tsx:58`, `frontend/apps/candidate/app/messages/[applicationId]/page.tsx:41`, `frontend/apps/candidate/app/applications/[id]/page.tsx:143`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:194`, `frontend/apps/candidate/lib/use-schedule.ts:18`, `frontend/apps/candidate/lib/saved-jobs-client.ts:128`
- current state: `createMessagesClient(api)` + mock. Six consumers each write same 4-line useMemo. Each then repeats same `useQuery` over `listQueryKey()` with different poll cadence (shell 60s, messages 30s, applicant 30s) — five copies.
- problem: Any change (cadence, key, refetch policy) touches six files. Candidate shell + applicant page unread badges already drift.
- root cause: No `useMessagesClient()` or `useThreads()` hook.
- recommended solution: Add `lib/use-messages.ts` exposing `useMessagesClient()` + `useThreads()`. Replace six useMemo blocks + five useQuery blocks with those hooks. Same pattern as `use-schedule.ts` + `use-saved-jobs-client.ts`.
- user impact: Unread badge + thread list consistent across shell + inbox + applicant page.
- business impact: Messages surface mutation blast radius from six files to one.

#### AR-3 — `listMyApplications` query duplicated with divergent poll cadence
- category: state-management
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Two divergent declarations → one hook; poll rate drops from flat 10s to intended 10s→60s backoff.
- file anchors: `frontend/apps/candidate/components/dashboard.tsx:71`, `frontend/apps/candidate/app/applications/[id]/page.tsx:130`, `frontend/apps/candidate/lib/use-schedule.ts:18`
- current state: dashboard.tsx declares `useAuthedQuery({queryKey: ["applications"], queryFn: () => api.applications.listMyApplications({}), refetchInterval: applicationsBackoff(...)})` with exponential 10s→60s. applications/[id]/page.tsx declares same key + queryFn with hard 10_000 ms and no cap.
- problem: Two subscribers with different `refetchInterval` — tanstack query uses whichever mounted last. Opening detail page silently overrides dashboard backoff.
- root cause: No `useApplications()` hook.
- recommended solution: Add `lib/use-applications.ts` with `useApplications()` + `useApplication(id)`. Both consumers import from hook.
- user impact: Dashboard tab stops burning battery on long sessions.
- business impact: Halves applications-listMyApplications RPS during mid-funnel window.

#### AR-4 — Landing bodies marked `"use client"` ship 1,358 lines of static JSX as client JS
- category: performance
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 1,358 LOC of client JSX → ~25 LOC island; verifiable in `next build` diff.
- file anchors: `frontend/apps/candidate/components/landing/company-body.tsx:1`, `frontend/apps/candidate/components/landing/candidate-body.tsx:1`, `frontend/apps/candidate/components/landing/candidate-body.tsx:81`, `frontend/apps/candidate/components/landing/landing-page.tsx:10`
- current state: `company-body.tsx` (866 LOC) opens `"use client"`; grep for useState/useEffect/useRouter/useCallback/onClick/onChange returns zero. `candidate-body.tsx` (492 LOC) has "use client" and one two-input search island (81-83). Both dynamic()-imported from `landing-page.tsx` but each chunk ships as pure client JS.
- problem: Every visitor to `/` downloads + hydrates ~1,358 lines of static JSX plus privacy-panel + ApertureLens 3D even though ~99% renders zero interactivity.
- root cause: Bodies extracted from `use client` page; inherited directive without audit.
- recommended solution: Remove `"use client"` from `company-body.tsx`. Split search bar out of `candidate-body.tsx` into `<LandingSearchIsland>` (~25 LOC); outer `candidate-body.tsx` becomes server. Verify with `next build`.
- user impact: Lower TTI on landing on mid-range mobile.
- business impact: Measurable Core Web Vitals on top-of-funnel page.

**Note:** Overlaps with RF-2; treat as same fix.

#### AR-5 — `optimizePackageImports` covers lucide-react but misses `@ip/ui`, `@ip/shared`, react-query
- category: performance
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 1-line config change; measurable route-by-route bundle drop.
- file anchors: `frontend/apps/candidate/next.config.ts:11`, `frontend/packages/ui/src/index.ts:1`, `frontend/packages/shared/src/index.ts:1`
- current state: Only lucide-react optimized. `@ip/ui/src/index.ts` is 41-export barrel. `@ip/shared/src/index.ts` re-exports scheduling + observability + proctor-runtime. `transpilePackages` compiles per app — cost multiplies.
- problem: `import { Button } from "@ip/ui"` transitively pulls sonner, cva, all Radix, ApertureLens 3D animation source, marketing chrome files.
- root cause: Two workspace packages added to `transpilePackages` but not `optimizePackageImports`.
- recommended solution: Extend to `optimizePackageImports: ["lucide-react", "@ip/ui", "@ip/shared", "@tanstack/react-query"]`. Verify with `next build`.
- user impact: Faster route loads throughout signed-in surface, especially lightweight pages (`/saved`, `/alerts`, `/notifications`) that today ship marketing MegaNav + ApertureLens transitively.
- business impact: Directly measurable savings per route.

**Note:** Overlaps with PF-10; treat as same fix (widen the array).

#### AR-9 — Zero unit-test coverage for seven pure functions that own outcome copy and score band
- category: test-coverage
- complexity: low
- needs_backend: false
- horizon: medium-1-3-weeks
- estimated_improvement: 7 pure functions covered; ~150 LOC of tests in vitest.
- file anchors: `frontend/apps/candidate/app/applications/[id]/page.tsx:70`, `frontend/apps/candidate/app/applications/[id]/page.tsx:446`, `frontend/apps/candidate/app/applications/[id]/outcome/page.tsx:80`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:80`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:123`, `frontend/apps/candidate/app/aptitude/[applicationId]/page.tsx:54`
- current state: Only 6 non-e2e test files exist. Untested pure functions: `buildJourney` (5 state branches driving milestone chain), `labelForEvent` (per-state milestone copy), `verdictFrom` (recommendation→verdict), `toReportDTO` (wire→DTO cast), `pipPosition` (timestamp→track position math), `isAnswered`, `sevClass`/`sevLabel`.
- problem: Every one renders user-facing copy or numeric evidence on P0/P1 pages. Silent regression in `labelForEvent` means "you didn't pass" copy shows on a hired candidate; bug in `pipPosition` puts an integrity flag at wrong time.
- root cause: Test suite is transport-focused; presentational-logic layer has no coverage.
- recommended solution: Add `applications/[id]/page.test.ts` covering `buildJourney` + `labelForEvent` (parametrized over TERMINAL_STATES + funnel states). Add `outcome/page.test.ts` for `verdictFrom`. Add `applicants/[appId]/page.test.ts` (or extract helpers) for `pipPosition` + `toReportDTO` + `sevClass`. Add `aptitude/page.test.ts` for `isAnswered`. Vitest, no framework additions.
- user impact: Prevents "tells you you're rejected when you were shortlisted" class of silent bug.
- business impact: Protects the exact copy that determines whether "you always hear back" survives future refactors.

### P2

#### AR-2 — `type Api = ReturnType<typeof useAuth>["api"]` re-declared in five feature clients
- category: api-client-seam
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 5 duplicated type aliases removed.
- file anchors: `frontend/apps/candidate/app/messages/messages-client.ts:50`, `frontend/apps/candidate/app/notifications/notifications-client.ts:69`, `frontend/apps/candidate/lib/practice-client.ts:39`, `frontend/apps/candidate/lib/job-alerts-client.ts:130`, `frontend/apps/candidate/lib/saved-jobs-client.ts:90`, `frontend/packages/shared/src/index.ts:1`, `frontend/packages/api-client/src/index.ts:209`
- current state: Five files define identical local alias. `@ip/shared` re-exports canonical `ApiClients`; three files (settings/team/branding clients) already use it.
- problem: Each local alias creates hidden import cycle risk. Downstream changes to useAuth signature invalidate every one.
- root cause: Copy-paste.
- recommended solution: Replace with `import type { ApiClients } from "@ip/shared"` in all five. Delete 5 aliases.
- user impact: None user-visible.
- business impact: Cuts type dependency graph.

#### AR-6 — Deep `../../../../../..` relative imports even though `@/*` alias is defined
- category: dx
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: Eight deep-relative sites → alias; one-line lint rule prevents regression.
- file anchors: `frontend/apps/candidate/tsconfig.json:11`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:37`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/schedule/page.tsx:31`, `frontend/apps/candidate/app/company/jobs/[id]/edit/page.tsx:23`
- current state: `tsconfig.json:11` defines `"paths": {"@/*": ["./*"]}`. Grep shows zero uses; eight sites use 5–7-segment relative paths.
- problem: Moving a route breaks every import. Adding a nested route means reviewers eyeball depth count.
- root cause: Alias never enforced; not in CLAUDE.md.
- recommended solution: Codemod every `../../../` chain of depth ≥ 3 to `@/`. Add ESLint `no-restricted-imports` `patterns: ["../../../*"]`. Add `@/*` note to CLAUDE.md.
- user impact: None.
- business impact: Refactor risk drops.

#### AR-7 — Applicant report page is 856 LOC across four concerns that want their own files
- category: file-size-outlier
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 856 LOC → ~350 LOC in page.tsx + three colocated files.
- file anchors: `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:577`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:622`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:754`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/integrity-client.ts:1`
- current state: 856 lines contain: page component with report+integrity queries + decide mutation (135-535), TabButton + ScoreRing + capitalize helpers (536-575), CompetencyCard (577-620), IntegrityBandSection with LegendDot (622-743), ReasonDialog (772-856). Directory already has `integrity-client.ts` + `types.ts`.
- problem: One file drives four independent surfaces. Recent P0 fix (uncap integrity flags) touched a section 500 lines deep in same file that owns decision RPC.
- root cause: Page grew through audit fix cycles without a splitting pass.
- recommended solution: Colocate `_components/integrity-band-section.tsx`, `_components/competency-card.tsx`, `_components/reason-dialog.tsx`. Leading-underscore folders are Next 15-router-ignored, no route change.
- user impact: None visible.
- business impact: Cuts review time for the highest-change recruiter surface.

#### AR-8 — Profile page is 674 LOC of a single form component with four sections inlined
- category: file-size-outlier
- complexity: low
- needs_backend: false
- horizon: medium-1-3-weeks
- estimated_improvement: 674 LOC → ~380 LOC + two shared components; parse-polling deduplicated with onboarding.
- file anchors: `frontend/apps/candidate/app/profile/page.tsx:77`, `frontend/apps/candidate/app/profile/page.tsx:313`, `frontend/apps/candidate/app/profile/page.tsx:546`, `frontend/apps/candidate/app/onboarding/page.tsx:94`, `frontend/apps/candidate/components/profile/experience-row.tsx:1`
- current state: 674 lines. `components/profile/` already contains `experience-row.tsx` + `skill-chips.tsx`. Still inlined: résumé upload cell (313-402), basics form (406-473), education fieldset (546-644). Mutation logic (98-213) is ~115 lines of parse-poll + upload + save. Parse-polling state (`parsePolls` ref, `parseStalled` boolean, `maxPolls`) copy-pasted between profile:77-134 and onboarding:94-151.
- problem: Two of four sections already extracted — pattern understood. Education inlined despite being structurally identical to experience.
- root cause: Refactor stopped before education + upload cell.
- recommended solution: Extract `components/profile/education-row.tsx` (mirror of experience-row) + `components/profile/resume-upload-cell.tsx` (owns upload mutation, parse polling, parsed/parsing/stalled pill). Import both places.
- user impact: Resume-upload UX consistent between profile + onboarding.
- business impact: Parse-polling in one file; fixes propagate automatically.

#### AR-10 — Turbo pipeline missing `outputs` for `lint`/`test`/`typecheck` — no cross-CI cache reuse
- category: dx
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: 3 unchanged tasks → cacheable; typecheck stops requiring a build.
- file anchors: `frontend/turbo.json:15`, `frontend/packages/ui/tsconfig.tsbuildinfo`, `frontend/packages/shared/tsconfig.tsbuildinfo`, `frontend/apps/candidate/tsconfig.tsbuildinfo`
- current state: `turbo.json:15-19` declares `lint: {}`, `test: {}`, `typecheck: { dependsOn: ["^build"] }`. None declare `outputs`. `.tsbuildinfo` files exist per package.
- problem: Unrelated change invalidates typecheck across packages because `^build` looks upstream. Turbo caches only exit code + stdout.
- root cause: Pipeline scaffolded early; never revisited.
- recommended solution: Update turbo.json: `typecheck: { outputs: ["**/*.tsbuildinfo"], inputs: ["src/**", "**/*.ts", "**/*.tsx", "tsconfig*.json"] }` + drop `dependsOn: ["^build"]`. Add `lint: { outputs: [".eslintcache"] }`, `test: { outputs: ["coverage/**"] }`.
- user impact: None user-visible.
- business impact: CI wallclock savings on incremental PRs.

#### AR-11 — 100 inline `ap-btn` string-literal buttons across 37 files with no typed variant surface
- category: public-api-discipline
- complexity: medium
- needs_backend: false
- horizon: medium-1-3-weeks
- estimated_improvement: 100 stringly-typed sites → typed component.
- file anchors: `frontend/packages/ui/src/styles/primitives.css:85`, `frontend/packages/ui/src/button.tsx:1`, `frontend/apps/candidate/app/company/jobs/[id]/applicants/[appId]/page.tsx:269`, `frontend/apps/candidate/app/company/jobs/new/page.tsx:336`, `frontend/apps/candidate/app/jobs/[id]/apply-island.tsx:91`
- current state: `grep -rn "ap-btn "` finds 100 sites in 37 files, each spelling `className="ap-btn ap-btn-primary"` inline. Variants defined in `primitives.css:85-103`. Product tier uses typed `Button` + `buttonVariants`.
- problem: `"ap-btn-primary"` → `"ap-btn-pramary"` typo gives unstyled button with no compile error. `buttonVariants` (CVA) prevents this for product tier.
- root cause: Aperture-marketing tier added as CSS without typed wrapper.
- recommended solution: Add `ApButton` to `@ip/ui` mirroring Button but backed by ap-btn CSS: `variant: "primary"|"ghost"|"coral", size: "sm"|"md"|"lg"`. Codemod 100 sites. Reserve raw literals for landing pages only.
- user impact: Prevents "unstyled button" class of regression on marketing.
- business impact: Refactoring ap-btn tokens becomes one-file change.

#### AR-12 — `messages/page.tsx` `markRead` swallows every error, leaving unread badge stuck
- category: error-handling
- complexity: low
- needs_backend: false
- horizon: quick-win-1-3-days
- estimated_improvement: One 5-line change; adds a logged signal for an invisible failure mode.
- file anchors: `frontend/apps/candidate/app/messages/page.tsx:85`, `frontend/apps/candidate/components/candidate-shell.tsx:84`, `frontend/packages/shared/src/observability.ts:1`
- current state: `messages/page.tsx:85-101` wraps `client.markRead(openId)` in unconditional `try {} catch {}` with comment "Reading is non-blocking and best-effort; the poll will re-converge." Shell badge polls 60 s; inbox thread list polls 30 s.
- problem: If markRead fails (session lapse, network drop, 5xx), nothing surfaces. Bell badge remains ≥60s. Silent forever if token expired — the transport would trigger refresh, and if refresh fails redirects to `/login`… but only fires on NEXT authed RPC.
- root cause: Catch swallows everything, not just AbortError. Comment justifies transient design but wrong for auth errors.
- recommended solution: `catch (err) { if (isAborted(err)) return; recordError(err); }` — `recordError` exists in `@ip/shared observability.ts`. Optionally toast on `!isTransient(err)`.
- user impact: Rare, but surfaced instead of silent.
- business impact: Fewer "the badge never clears" support tickets.
