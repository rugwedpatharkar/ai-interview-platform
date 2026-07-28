# Performance roadmap

Only `performance-bundle-rendering` findings, grouped by axis. Each item cites a measurement or a file+line.

The build already confirms no per-route `page-*` chunk exceeds Next's 200 kB budget (largest per-route is `/page-*.js` at 26.7 kB, which contains the Dashboard tree — see PF-2). The 320 kB shared vendor chunk (`.next/static/chunks/22-*.js`) is the systemic tax and every axis below chips at it.

---

## Bundle

### P1 — Home route bundles full Dashboard for signed-out visitors (PF-2)
- `app/page-client.tsx:6,27` · `components/dashboard.tsx:1-34`
- Measurement: `.next` build report — `/page-*.js` = 26.7 kB, largest per-route.
- Fix: `dynamic()` the Dashboard import. Expect the chunk to drop to ~5–8 kB; Dashboard becomes a lazy chunk downloaded only by signed-in candidates.

### P1 — AuthProvider drags 313 kB shared chunk onto every marketing route (PF-2 + RF-4)
- `app/layout.tsx:53` · `packages/shared/src/auth.tsx:93` · `packages/api-client/src/index.ts:216`
- Measurement: `static/chunks/22-*.js` = 313 kB, contains `@bufbuild/protobuf` descriptor identifiers + all 28 generated `*_pb` modules.
- Fix: Route group `(authed)` OR lazy `createClients` via `await import("@ip/api-client")` on first `api` access.

### P2 — `optimizePackageImports` misses `@ip/ui`, `@ip/shared`, `@tanstack/react-query`, Radix (PF-10 + AR-5)
- `next.config.ts:11` · `packages/ui/src/index.ts:1-147`
- Fix: extend `optimizePackageImports`. Verify with `next build`; expect 10–30% shared-chunk reduction.

### P3 — ApertureSprite renders 25 SVG symbols on every route (PF-8)
- `app/layout.tsx:52` · `packages/ui/src/aperture-sprite.tsx:8-146`
- Measurement: ~180 lines of SVG inline in every SSR HTML.
- Fix: tree-shake sprite to only referenced glyphs, or hoist into signed-in layouts.

---

## Render (concurrent + component boundaries)

### P0 — Landing page ships 1,600 LOC as one client component (RF-2)
- `components/landing/landing-page.tsx:1` · `components/landing/candidate-body.tsx:1` · `components/landing/company-body.tsx:1`
- Measurement: `company-body.tsx` (866 LOC) has zero client hooks; `candidate-body.tsx` (492 LOC) has three (search form).
- Fix: RSC restructure per RF-2.

### P1 — Aptitude countdown re-renders coding textarea every 500 ms (RF-5)
- `lib/use-countdown.ts:37` · `app/aptitude/[applicationId]/page.tsx:63,357`
- Measurement: setRemaining tick every 500 ms creates fresh onSource closure identity → cascades to `<textarea>`.
- Fix: leaf timer, or React Compiler (RF-9).

### P1 — Marketplace filter blocks INP on router.replace + refetch (RF-6)
- `app/jobs/marketplace.tsx:49,56,123`
- Fix: `startTransition` around `applyParams`.

### P2 — Profile page 674-LOC form re-renders on every keystroke (RF-10)
- `app/profile/page.tsx:89,162,230,375`
- Fix: `startTransition` around setForm OR leaf-component isolation.

### P2 — MessageThreadView renders every message per poll (PF-7)
- `packages/ui/src/message-thread-view.tsx:131` · `packages/shared/src/use-thread-messages.ts:63-88`
- Measurement: threads at 100+ messages start being visibly janky; poll fires every 5–30 s.
- Fix: BE — cursor pagination on `listMessages`; FE — TanStack Virtual or react-virtuoso. Interim FE-only: cap `rows` to last 100.

---

## Network (waterfalls + poll amplification)

### P1 — QueryClient never disables `refetchOnWindowFocus` (PF-1)
- `packages/shared/src/query.ts:3-11`
- Measurement: alt-tab fires 5–8 redundant gRPCs on dashboard/applicant surfaces past 30 s stale time.
- Fix: `refetchOnWindowFocus: false, refetchOnReconnect: 'always', staleTime: 60_000, gcTime: 5 * 60_000`.

### P2 — `/companies/[id]` SSR fetches profile then jobs sequentially (PF-3)
- `app/companies/[id]/page.tsx:42-53` · `app/companies/[id]/company-client.ts:99-116`
- Measurement: ~1 RTT (80–200 ms) on every cold-cache render, including crawler traffic.
- Fix: `Promise.allSettled([companyProfile(id), companyJobs(id)])` preserving 404 handling.

### P2 — Company onboarding createJob → invites sequential (PF-4)
- `app/company/onboarding/page.tsx:118-178`
- Fix: single `Promise.allSettled` fan-out with individual result inspection.

### P3 — Notification bell + feed overlap 30 s polls (PF-9)
- `packages/ui/src/notification-bell.tsx:83-95` · `app/notifications/page.tsx:33-40`
- Fix: `select`/`onSuccess` writeback into badge cache: `qc.setQueryData(notificationKeys.unread(), data.unreadCount)`.

### P3 — CandidateShell fetches full thread list per nav for one integer (PF-11)
- `components/candidate-shell.tsx:77-88`
- Fix: BE — add `getUnreadMessageCount()` returning single int. FE-only interim: raise `staleTime` to ~120 s + reduce poll cadence off `/messages`.

---

## Images / SSR HTML

_No blocking image findings. ApertureSprite (PF-8) is the biggest inline-SVG cost._

---

## Fonts

### P2 — Clash Display 700 not preloaded (PF-5)
- `app/layout.tsx:47-48` · `app/fonts.css:22-27` · `packages/ui/src/styles/primitives.css:64-67`
- Measurement: `.ap-h2` (weight 700) is the marketing hero heading class; 700 file is on disk + declared but not preloaded. 400 + 600 preload today.
- Fix: `<link rel="preload" href="/fonts/clash-display-700.woff2" as="font" type="font/woff2" crossOrigin="" />`. Note `.ap-h1` at 800 has no matching file — decide add or drop to 700.

---

## Caching (SSG / ISR / dynamic-forcing)

### P2 — Root layout `await headers()` forces every route dynamic (PF-6)
- `app/layout.tsx:34-40`
- Measurement: static routes (`/privacy`, `/terms`, `/dpa`, `/trust`, `/compare/*`, `/what-we-dont-do`, `/sample-report`, `/ai-explainability`) all render per-request at ~50–150 ms.
- Fix: move CSP nonce plumbing into a route-group layout that only wraps signed-in / dynamic routes. Middleware only injects nonce on non-static routes. Marketing + legal groups become SSG/ISR.

---

## Virtualization

### P2 — MessageThreadView (PF-7)
See under Render.

---

## Testing / verification

Every fix above should show a diff in `next build` per-route First Load JS + shared-chunk sizes. Land PF-1, PF-2, PF-10 together to make the marketing route delta visible in a single snapshot.
