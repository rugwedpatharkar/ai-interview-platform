# Aptura — Single-App Unification + Fresh UI Redesign · Design

> **Status: design approved (2026-06-20).** Two sequenced sub-projects: **(A)** collapse the two
> frontend apps into one product URL; **(B)** a fresh, non-default UI redesign across all 24 screens.
> **Functionality is frozen** in both — no behavior, data-flow, client, or contract changes. Local-only
> project; commit per step on the current branch with explicit paths (never `git add -A`).

## Why

Today Aptura ships as **two separate Next.js apps on two origins** — `@ip/candidate` (:3000) and
`@ip/company` (:3001). The product is **one thing** ("Aptura") with two audiences (candidates,
companies), and it should present as **one URL** with the landing page as the single front door.

Separately, the UI is recognizably an "AI-default" look — a violet/blue gradient hero, which the
`redesign-existing-projects` skill names as the #1 fingerprint of generic AI design. The product wants
a **fresh visual language** that reads as trustworthy, precise, and premium — fitting its positioning
(proctored, cheat-proof, merit-based, no-ghosting).

## Scope & non-goals

**In scope**
- (A) One Next.js app, one origin, one URL. Landing → role-routed areas under role-guarded segments.
- (B) A fresh design system (tokens + `@ip/ui` primitives) applied across all 24 screens.

**Frozen / non-goals**
- No functionality, behavior, routing-*semantics*, data-flow, auth-*logic*, gRPC, or mock-seam changes.
  URLs change; what each screen *does* does not.
- No backend / `src/` / `.proto` / `pnpm gen` changes.
- No new product features, copy rewrites beyond what a visual pass naturally touches, or scope creep.

## Sequencing (locked)

**A (unify) → B-pilot (lock the system) → B-rollout (skin all screens).** Restructuring routing *after*
redesigning 24 screens would re-touch everything; unify first, then skin once.

---

## A. Single-app unification

### A.1 Target shape
- **Base app = the candidate app**, promoted to "the Aptura app" (it already owns the landing + the
  majority of routes). The **company app is folded into it**, then `@ip/company` is retired.
- **One origin, one dev server, one port** (3000).

### A.2 URL & route structure
- `/` — landing (front door; signed-out marketing, signed-in candidate → dashboard, as today).
- **Candidate area** keeps its current paths (`/jobs`, `/jobs/[id]`, `/dashboard`, `/saved`, `/alerts`,
  `/interview/[id]`, `/aptitude/[id]`, `/practice`, `/feedback/[id]`, `/messages`, `/notifications`,
  `/settings`, `/schedule`, `/companies/[id]`, profile).
- **Company area** moves under a **`/company/*` namespace** (`/company/dashboard`,
  `/company/jobs/[id]`, `/company/jobs/[id]/applicants/[appId]`, `/company/talent`, `/company/branding`,
  `/company/team`, `/company/settings`, `/company/messages`, `/company/notifications`). The prefix is
  **required** — both sides currently own colliding paths (`/settings`, `/messages`, `/notifications`,
  `/jobs/[id]`).
- Implemented with App-Router **route groups** `(candidate)` and `(company)` so the two areas can have
  distinct shells without leaking URL segments beyond the `/company` prefix.

### A.3 Auth & role routing
- **One login.** The role claim on the token decides the post-login home: candidate → `/dashboard`,
  recruiter → `/company/dashboard`.
- **`useRequireRole`** (already exists) guards each area's segment: a wrong-role token is bounced to
  login rather than rendering a screen whose every query 403s. **This route-guard + role-claim
  enforcement replaces the old separate-origin isolation boundary** (the accepted security tradeoff).
- Landing stays publicly reachable signed-out (no redirect), exactly as today.

### A.4 Code moves
- Company screens, components, and lib clients move into the unified app under the `(company)` group.
- Genuinely shared pieces (shell chrome, notification bell, primitives) consolidate into **`@ip/ui`**.
- **Every gRPC/mock client and query moves verbatim.** `NEXT_PUBLIC_MOCK` seams are preserved 1:1.
- `@ip/company` package + its `launch.json` entry + its build target are removed once empty.

### A.5 Acceptance (A)
- One app builds green (`pnpm --filter @ip/<app> build`); `@ip/{ui,shared,api-client}` typecheck green.
- Every previously-reachable screen is reachable at its new URL; candidate paths unchanged, company
  paths under `/company/*`.
- Signed-out `/` = landing; candidate login lands on `/dashboard`; recruiter login lands on
  `/company/dashboard`; cross-role access bounces to login.
- No diff under `src/`, `*.proto`, or `packages/api-client/src/gen/*`.

---

## B. Fresh UI redesign

### B.1 Design-system character (committed; exact tokens locked in the pilot)
- **Off the violet gradient.** Warm near-black dark base (not `#000`); **one** confident, desaturated
  accent that is **not** purple/blue; OKLCH ramps; tinted (not pure-black) shadows; subtle grain/
  texture; light + dark both first-class.
- **Type pairing on a contrast axis** (editorial display + clean grotesk body); tabular figures on
  data-dense screens; line-length capped 65–75ch; display heading ≤ ~96px, tracking ≥ −0.04em.
- **Motion tokens** from `motion-foundations` (spring presets, reduced-motion safe, SSR-safe).
- Delivered as updated **`@ip/ui` design tokens + primitives** so all 24 screens inherit the system
  rather than being restyled one-off.

### B.2 Skills used
- `ui-ux-pro-max` — palette / font-pairing / layout / UX-rule selection (the decision catalog).
- `impeccable` — production-grade execution, OKLCH palette, contrast/typography/layout discipline,
  browser-verified screenshots.
- `redesign-existing-projects` — audit each current screen for generic patterns before fixing.
- `motion-foundations` / `motion-patterns` / `emil-design-eng` — interaction polish.

### B.3 Pilot (locks the system before scale)
Build to sign-off, verified live in the browser:
1. **Landing** (`/`) — brand surface where design *is* the product.
2. **Applicants-pipeline** (`/company/jobs/[id]/applicants/[appId]`) — the most component-dense app
   screen (table + status pills + KPIs + bulk actions); proves the system on real product UI.

Output of the pilot = the **frozen design system** (tokens + primitives + motion) every other screen
inherits.

### B.4 Rollout
Apply the locked tokens + primitives across the remaining 22 screens in **waves mirroring the original
build waves** (landing/auth/profile/dashboards → marketplace → interview/coding/report → messaging/
notifications → settings/team → practice/scheduling). Each screen: audit → reskin → in-browser verify
→ per-screen commit. No two screens invent their own one-off styling.

### B.5 Acceptance (B)
- Updated `@ip/ui` tokens drive every screen; no per-screen hardcoded palette.
- No violet/blue "AI gradient" hero; single non-default accent; contrast ≥ 4.5:1 body / ≥ 3:1 large.
- Every screen renders correctly signed-in for its role (in-browser screenshot proof).
- Builds stay green; **zero functional diff** (same clients, queries, routes' behavior, seams).

---

## Cross-cutting constraints
- **One URL**; landing is the front door.
- **No functionality change** anywhere — visual + routing-location only.
- **Per-step commits on the current branch, explicit paths** (`git add <files>`, never `-A`).
- **Never break builds**; never run `next build` while a `pnpm dev` server is live.
- Backend (`src/`, `.proto`, `pnpm gen`) is out of bounds.

## Open/deferred
- Exact accent hue + type families: chosen in the pilot via the skills, approved live.
- Deferred deps (LiveKit/MediaPipe/Monaco/vitest) remain deferred — unrelated to this work.
