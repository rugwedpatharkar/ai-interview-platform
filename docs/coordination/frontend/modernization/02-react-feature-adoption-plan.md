# React 18/19 + Next 15 feature adoption plan

Findings whose dimension is `react-features` OR whose `react_features` field is non-empty. Grouped by React feature; ordered by priority within each group.

Cross-dimension items that mention React features (a11y, perf, architecture, DS) are included below and re-anchored to the same file:lines so a single PR touching one primitive can pick up every win at once.

---

## Server Components / islands architecture

### P0 — Landing page: 1,600 LOC static tree → RSC + islands
`react-features.P0.med` — see RF-2 in `01-full-audit.md`.
- `app/page.tsx:4` · `app/page-client.tsx:23` · `components/landing/landing-page.tsx:1` · `components/landing/candidate-body.tsx:1` · `components/landing/company-body.tsx:1`
- Only genuine client islands: audience switch (~40 LOC), hero search form (~20 LOC), optional ScrollReveal (~15 LOC). `company-body.tsx` has ZERO client hooks — convert straight to RSC.

### P1 — MegaFooter + MarketingShell → RSC
`react-features.P1.qw` — see RF-1.
- `packages/ui/src/aperture-chrome.tsx:1,42,231,316`
- Split into `mega-nav.tsx` (client, keeps burger useState), `mega-footer.tsx` + `marketing-shell.tsx` (server). Re-export from `aperture-chrome/index.ts` so `@ip/ui` public surface stays.

### P1 — Route grouping: `AuthProvider` inside `(authed)` layout
`react-features.P1.med` — see RF-4.
- `app/layout.tsx:53` · `app/providers.tsx:13` · `packages/shared/src/auth.tsx:93`
- Alternative to full route regrouping: lazy binding of `createClients` via `await import("@ip/api-client")` on first `api` access.

### P2 — SimilarRoles is async server component + Suspense
`react-features.P2.qw` — see RF-7.
- `app/jobs/[id]/similar-roles.tsx:1,22` · `app/jobs/[id]/page.tsx:94`
- Convert to `async function SimilarRoles({ companyId, excludeJobId })` awaiting `companyJobs(companyId)`. Wrap in `<Suspense fallback={<SimilarRolesSkeleton/>}>`. Only remaining client leaf is `<SaveJobButton>` per `<JobCard>`.

### P2 — Split `@ip/ui/layout.tsx` — pull PageHeader/EmptyState out of the "use client" boundary
`design-system.P2.qw` — see DS-7.
- `packages/ui/src/layout.tsx:1,121,147,174` · `packages/ui/src/index.ts:83`
- Two files: `layout-shell.tsx` ("use client", AppShell only) and `layout-states.tsx` (no "use client", PageHeader/Heading/EmptyState/ErrorState/LoadingState/SuccessState). Re-export from index.ts unchanged.

### P3 — Landing IntersectionObserver → CSS `animation-timeline: view()`
`react-features.P3.qw` — see RF-11.
- `components/landing/landing-page.tsx:39,52`

---

## App Router streaming + Suspense

### P1 — Add `loading.tsx` to seven heavy routes
`react-features.P1.qw` — see RF-3.
- `app/aptitude/[applicationId]/loading.tsx`, `app/applications/[id]/loading.tsx`, `app/company/jobs/[id]/applicants/[appId]/loading.tsx`, `app/profile/loading.tsx`, `app/messages/loading.tsx`, `app/onboarding/loading.tsx`, `app/interview/[applicationId]/loading.tsx`
- Each renders the existing `<Skeleton>` / `<LoadingState>` composition; strip the corresponding in-page loading branch.

---

## Concurrent rendering: `useTransition` / `startTransition` / `useDeferredValue`

### P1 — Marketplace filter click wrapped in `startTransition`
`react-features.P1.qw` — see RF-6.
- `app/jobs/marketplace.tsx:49,56,123` · `components/filter-sidebar.tsx:59`
- Body of `applyParams` moves inside `startTransition`. Checkbox state stays urgent; router replace + query refetch flip to transition. Use `isPending` from `useTransition` for "updating" hint.

### P1 — Aptitude countdown cascade: isolate timer to leaf
`react-features.P1.qw` — see RF-5.
- `lib/use-countdown.ts:37` · `app/aptitude/[applicationId]/page.tsx:63,357` · `components/coding-section.tsx:87` · `components/code-editor.tsx:39`
- Move countdown into leaf `<CodingTimer/>` OR lift `useCountdown` to render only the `mm:ss` `<Badge>`. Alternate: enable React Compiler (RF-9).

### P2 — Profile form: `startTransition` around `setForm`
`react-features.P2.qw` — see RF-10.
- `app/profile/page.tsx:89,162,230,375`

### P2 — Talent search keyword: debounce OR `useDeferredValue`
`recruiter-ux.P1.qw` — see RX-10.
- `app/company/talent/page.tsx:52,59,118`

---

## `useOptimistic` (React 19)

### P2 — `useThreadMessages` rewrites hand-rolled optimistic pattern
`react-features.P2.qw` — see RF-8.
- `packages/shared/src/use-thread-messages.ts:90,94` · `packages/ui/src/message-thread-view.tsx:82`
- `useOptimistic(messages, (state, next) => [...state, next])`. Remove local optimistic array, `inFlight` ref, manual filter-out-tmpId rollback.

### P1 — Apply-flow cover-letter streaming pairs with `useOptimistic`
`ai-features.P1.med` — see AI-8.
- `app/jobs/[id]/apply-island.tsx:97,109` · `packages/shared/src/chat-stream.ts:25`

---

## React Compiler

### P2 — Enable `reactCompiler: true`
`react-features.P2.qw` — see RF-9.
- `next.config.ts:10-12`
- Install `babel-plugin-react-compiler`. Run build; verify healthcheck. Likely-safe bailouts: `.current +=` in effects (`profile/page.tsx:125`, `use-thread-messages.ts:79`) — both effect-internal.
- Retire hand-authored memo/callback: `dashboard.tsx:124-149`, `profile/page.tsx:218`, `marketplace.tsx sameParams`.
- Compiler also resolves the RF-5 aptitude countdown cascade automatically.

---

## Server Actions + `useActionState`

### P3 — Migrate apply/login/aptitude/updateProfile
`react-features.P3.strat` — see RF-12.
- `app/login/page.tsx:75` · `app/jobs/[id]/apply-island.tsx:59` · `app/aptitude/[applicationId]/page.tsx:170` · `app/profile/page.tsx:194` · `components/dashboard.tsx:91`
- Backend hand-off: Next.js Route Handlers under `/app/api/**` forwarding to gRPC + threading bearer token.
- Then `<form action={applyAction}>` + `useActionState`. Combines with `useOptimistic` on Apply dialog.

---

## `useId` (form a11y pattern)

### P0 — Auth Field aria-invalid + aria-describedby
`a11y.P0.qw` — see AY-2.
- `components/auth/auth-card.tsx:88-148` · `packages/ui/src/field.tsx:11-68`
- Or migrate auth-card off local Field and consume `@ip/ui` Field (which already uses `useId` correctly).

---

## Route-level primitives (usePathname / template.tsx)

### P1 — `<RouteAnnouncer />` for SPA nav a11y
`a11y.P1.med` — see AY-6.
- `app/template.tsx:6-8` · `app/providers.tsx:13-24`
- `usePathname` + effect → push `document.title` into `aria-live="polite"` sr-only region + move focus to `<main>` (already `tabIndex={-1}` in SidebarShell).

---

## `next/dynamic` code-splitting

### P1 — Home route: `Dashboard` lazy
`perf.P1.qw` — see PF-2.
- `app/page-client.tsx:6,27` · `components/dashboard.tsx:1-34`
- `const Dashboard = dynamic(() => import('../components/dashboard').then(m => m.Dashboard), { ssr: false, loading: () => null })`. Signed-out path already renders the SSR marketing tree via `children`, so no client fallback needed.

---

## `optimizePackageImports`

### P1 — Widen the barrel-shake list
`perf.P2.qw` / `architecture.P1.qw` — see PF-10, AR-5 (same defect).
- `next.config.ts:11`
- `optimizePackageImports: ["lucide-react", "@ip/ui", "@ip/shared", "@tanstack/react-query", "@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-select", "@radix-ui/react-tabs", "@radix-ui/react-tooltip", "@radix-ui/react-checkbox", "@radix-ui/react-radio-group", "@radix-ui/react-label"]`.
