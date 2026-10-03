# → Manager: Modernization implementation — waves 1-6 landed

**From:** FE session `claude/candidate-frontend-audit-1ae381`
**Date:** 2026-07-29
**Status:** Six waves of FE-only quick-win implementation shipped; medium and
strategic items scheduled but not implemented in this session.

---

## What ran

The 109-finding modernization audit
([full-audit.md](../frontend/modernization/01-full-audit.md)) surfaced ~40
quick-win items — 1-3 day scope per item, no BE required. Six themed
implementation waves landed the ones that could ship in a single session.

**Verification gate:** typecheck clean across `@ip/shared` + `@ip/ui` +
`@ip/candidate`. `pnpm --filter @ip/candidate build` clean; all 58 routes
compile.

## Waves shipped (each is one commit)

### `07fd159` — Wave 1: candidate + a11y foundation
- CX-1 aptitude answers persisted to localStorage (survive tab-crash on
  one-shot proctored bank)
- CX-5 global aptitude countdown in sticky header, auto-submits at zero
- AY-1 useCountdown returns `{display, secondsLeft}` + onAnnounce; timers
  wired with `role="timer"` and threshold announcements (5m/1m/30s/10s)
- AY-2 auth Field supports `error` prop → aria-invalid + aria-describedby,
  plus `fieldId(name)` helper for focus-to-first-error
- PF-1 QueryClient: `refetchOnWindowFocus: false`, `staleTime 60s`, `gcTime 5m`
- PF-2 Home dynamic-imports Dashboard (signed-out visitors no longer pay for it)
- RF-6 marketplace filter changes wrapped in `useTransition` with pending hint
- AR-5 next.config optimizePackageImports widened to Radix + workspace barrels
- CX-3 apply deep-link uses `?redirect=` (round-trips through login)

### `8514428` — Wave 2: surface dark AI plumbing
- AI-1 dashboard "Recommended" cards batch `getJob` via `useQueries` + render
  real title / company / top-3 reason chips (was three literal "Recommended
  role" strings)
- AI-2 / RX-1 recruiter pipeline calls `getJobRankedCandidates`, paints
  score chip + top-reason line on every card, sorts each lane by score desc
- AI-5 new `SkillGapIsland` on JD sidebar: matched vs missing skills against
  candidate's profile + "Add {missing[0]} to your profile" link
- AI-9 `JobCard` learns `matchScore` + `topReason`; marketplace paints
  "N% match" pill on every card for signed-in candidates

### `98bc85e` — Wave 3: recruiter productivity P1s
- RX-6 Advance decision now uses `ReasonDialog` (optional reason,
  strong_fit / proceed_with_reservation / strategic_role / other); confirm
  stays enabled without a reason to preserve speed
- RX-10 talent search debounced to 250 ms; `active` mode fires on Stage
  picker alone (was keyword-only)
- RX-2 analytics reads `getNoGhostingKpis` and renders a 5-stat band above
  the funnel (pending review / stale > SLA / median response / response
  rate / decided last 7 days)
- RX-4 new `useDraftForm(key, initial)` hook — localStorage + debounced +
  beforeunload guard; post-a-job wraps its state under `job:new:${identity.id}`
- RX-5 JD Improve non-destructive: snapshots pre-improve JD in a ref,
  paints "Revert to my draft" button while snapshot is live
- RX-14 /company/jobs list gains title search + sort select
  (recent / oldest / A–Z)

### `47f276b` — Wave 4: cross-cutting infra
- RF-1 `aperture-chrome.tsx` split into `mega-nav.tsx` (client),
  `mega-footer.tsx` (server), `marketing-shell.tsx` (server). Existing
  facade re-exports so no importer had to change
- AR-4 `company-body.tsx` becomes Server Component (had no client-only
  code); `candidate-body.tsx` extracts search bar to
  `<LandingSearchIsland/>` so its ~900-LOC marketing tree ships as HTML
- RF-3 seven `loading.tsx` files added — aptitude, applications/[id],
  applicants/[appId], profile, messages, onboarding, interview

### `41dc085` — Wave 5: a11y batch
- AY-4 `Alert` picks role by tone (danger → assertive, others → polite);
  new `announce={false}` escape hatch
- AY-13 `NotificationItem` gains optional `href` → renders as `<a>` for
  screen-reader "link" semantic + Cmd/middle-click behaviour
- AY-3 new `SkipToContent` primitive in `@ip/ui`, adopted by
  MarketingShell + interview + aptitude routes
- AY-14 login page focuses the error banner on submit failure
- AY-11 onboarding wizard focuses H1 + announces "Step N of 4" on every
  transition; step 3 drops the resume-required gate and relabels to
  "Skip this step" (CX-9)

### `b02e423` — Wave 6: DS + polish
- PF-3 `/companies/[id]` runs profile + jobs fetches in parallel via
  Promise.allSettled (was serial)
- RX-15 company dashboard "Latest postings" sorts postedAt desc before slicing
- PF-5 preload `clash-display-700.woff2` (backs `.ap-h1` above the fold)
- RX-19 `parseSkills(skillsRaw)` memoised in post-a-job (was recomputed
  three sites + on submit)
- AR-2 replaced 5 local `type Api = ReturnType<typeof useAuth>["api"]`
  aliases with `import type { ApiClients } from "@ip/api-client"`
- AR-12 `markRead` catch now `recordError(err, { component: "..." })`
  instead of silently swallowing
- DS-8 local `Avatar` in pipeline page replaced by `@ip/ui`'s Avatar

## Measured wins

Bundle-size deltas from `next build` output (First Load JS):

| Route | Before | After | Δ |
|---|---:|---:|---:|
| /pilot, /waitlist, /status, /dpa, /privacy, /terms, /trust, /sample-report, /what-we-dont-do, /hiring-teams | 238-256 kB | ≤108 kB | **≥130 kB per route** |
| /login | 243 kB | 156 kB | -87 kB |
| /jobs | 250 kB | 198 kB | -52 kB |
| /jobs/[id] | 247 kB | 205 kB | -42 kB |
| /interview/[applicationId] | 246 kB | 174 kB | -72 kB |
| Shared chunk floor | 103 kB | 103 kB | (unchanged) |

Every marketing/legal surface now sits below the shared-chunk + a few kB.
That's the RSC split (Wave 4) + optimizePackageImports widening (Wave 1)
compounding.

## What's still open

**FE-only, not implemented this session** — good candidates for the next
FE run:

- Medium-scope P1s the audit called out: `RX-3` aggregate messages inbox
  (new `/company/messages` route + shell entry), `AI-4` command palette
  (`components/command-palette.tsx` already exists, needs `⌘K` binding on
  CompanyShell), `RF-5` countdown cascade (move `useCountdown` into a
  leaf `<CodingTimer/>`), `RF-8` `useOptimistic` for thread messages.
- Additional quick-wins the doc lists that I skipped for scope: `AY-10`
  integrity pips as focusable buttons, `AY-12` Radix Select label
  association across profile + applicant decision UI, `RX-11` talent
  drawer applications list (BE-blocked — needs `ApplicationRef` widening),
  `RX-13` decision undo grace (5s AbortController), `RX-16` rubric
  descriptor localStorage, `RX-20` char counter, `DS-3` Table density
  prop, `DS-7` split `layout.tsx`.
- Medium (1-3 week) items: JobForm extraction (`RX-7`), applicant report
  page split (`AR-7`), interview lobby real environment scan (`CX-10`),
  MessageThreadView virtualisation.

**Strategic (1-3 month) bets** — deferred to their own initiatives:
recruiter copilot, interview reconnect + connection-quality HUD, Server
Actions migration, interview question navigation + auto-clip highlights,
practice → interview coaching bridge.

**BE-blocked** — no FE action possible until BE lands the RPCs listed in
[13-be-followups](../frontend/modernization/13-be-followups-for-modernization.md).
The Wave 3 advance-reason dialog UI ships, but the reason is dropped on
the wire until `decideApplication` widens.

## Merge

Branch is `0 behind, 6 ahead` of `origin/main` since this session's opener,
`24 ahead` total including the previous audit + fixes. Ready to fast-
forward-push per project convention:

```bash
git push origin claude/candidate-frontend-audit-1ae381:main
```

## Suggested next FE priorities (in this order)

1. `RX-3` aggregate messages inbox — new route + sidebar entry with unread
   badge; the deferred `/company/messages` I dropped in the last session is
   the exact placeholder.
2. `AI-4` command palette — `⌘K` opens the existing CommandPalette on
   both shells with a recent-viewed jobs/candidates index.
3. `RF-5` countdown cascade fix — one file, drops re-renders on every
   aptitude tick.
4. `RF-8` `useOptimistic` for thread messages — cleans out the manual
   optimistic + rollback in `use-thread-messages.ts`.
5. `AY-10` integrity pips as buttons — makes the audit evidence
   keyboard-navigable, one file.

---

Standing by.
