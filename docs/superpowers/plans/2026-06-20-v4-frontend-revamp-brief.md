# Aptura — Complete Frontend Revamp (v4) · New-Session Brief / Prompt

> **Paste everything below the line into the new session.** It is self-contained: it tells the new session
> what Aptura is, what to read, what went wrong before, the exact design→implement workflow that guarantees
> fidelity, the hard constraints, and the definition of done.

---

You are taking over the **frontend** of **Aptura**, an AI-driven hiring + proctored-interview platform. We are
doing a **complete, ground-up revamp of the entire product UI** — every screen, from the landing page through
every authenticated screen — to the quality of a **top-tier international SaaS product** (think Linear, Stripe,
Vercel, Ramp, Ashby, Mercor, Gusto/Rippling — premium, confident, trustworthy, AI-forward, hiring-domain).

This is **NOT** an accent-color tweak or a reskin. The previous attempt reskinned in place and the result is
not good enough. **We are rebuilding the UI from start to end.**

## The product (one paragraph)
Aptura is a unified hiring marketplace + **strict proctored AI-interview** product. Candidates discover jobs,
apply, take ONE live proctored video+voice AI interview, and **always** get an answer ("no ghosting"). Companies
post jobs, review **evidence-based** interview reports with an integrity timeline, and decide (advisory gate —
human decides). Positioning: **proctored, cheat-proof, merit-based, transparent, trustworthy.** Tagline:
*"Get seen. Get interviewed. Get hired."* (candidate) / *"Hire on proven merit."* (company). Brand name
**Aptura**; mark is an **aperture/lens**.

## Repo & stack (facts)
- Monorepo root: `/Users/rugwedpatharkar/Projects/Project`. Frontend lives in **`frontend/`** (pnpm@9.15.0 +
  Turbo). Next.js 15 (App Router) · React 19 · Tailwind **v4** (CSS-first `@theme` in `app/globals.css`) ·
  TanStack Query · `@connectrpc/connect-web` (gRPC-web). Shared packages: `@ip/ui`, `@ip/shared`, `@ip/api-client`.
- **Two apps today: `apps/candidate` (:3000) and `apps/company` (:3001).** ← This must become **ONE app, ONE
  URL** (see "Single app" below).
- Run: `cd frontend && npx pnpm@9.15.0 --filter @ip/<app> dev`. Build gate: `--filter @ip/<app> build`;
  typecheck: `--filter @ip/<app> exec tsc --noEmit`. **`next build` is the real gate** (catches RSC/serialization
  bugs that `tsc` misses — e.g. a Server Component passing a lucide icon to a client component).
- Data: every screen calls either a real gRPC client (`useAuth().api.<svc>.<method>()`) or a typed **mock client**
  behind `NEXT_PUBLIC_MOCK` (`makeMock…Client()`). Flip-to-real is a 1-line client swap.

## ⛔ Hard constraints (do not violate)
1. **DO NOT touch the backend.** Nothing under `src/`, no `*.proto`, no `pnpm gen`, no `packages/api-client/src/gen/*`.
   A separate session owns the backend. The frontend must keep using the **existing** gRPC/mock contracts exactly.
   (Every screen's contract is already documented — see "What to read.")
2. **One product, one URL.** Collapse candidate + company into a **single Next.js app on one origin**. Landing
   (`/`) is the only public front door; after login the role claim routes the user (candidate area vs. a
   `/company/*` recruiter area), guarded by `useRequireRole`. A plan already exists:
   `docs/superpowers/plans/2026-06-20-aptura-single-app-unification.md` — follow/adapt it. (Security note in that
   doc: merging origins trades the separate-origin isolation for route-guard + role-claim enforcement — accepted.)
3. **The theme (dark/light/device) toggle must NOT be on the landing or in the top bar.** It moves into
   **Settings → Appearance**, alongside accent + base-theme pickers, **default = Device/System**. Persistence is a
   per-user preference (a `PreferencesService` is already designed: `docs/superpowers/plans/2026-06-20-v3-redesign-and-appearance.md`
   Phases B/C). If the backend RPC isn't live yet, build it against the documented mock seam.
4. **Bigger, confident, professional typography.** The current UI's type is too small. Establish a deliberate,
   larger type scale (generous body ~16–18px, confident headings, real hierarchy) — international-product feel,
   not cramped. This is a first-class requirement, not a detail.
5. **Behavior/data is frozen** — you change look, layout, type, motion, and routing-location only. Queries,
   handlers, mock seams, and the **strict proctored-interview invariants** (camera+mic required, NO mute, NO
   camera-off, fullscreen-locked, HIGH-severity auto-gate) must be preserved exactly.

## What went wrong last time (the failure mode you MUST fix)
We built beautiful standalone **HTML mockups** in `docs/brand/redesign-v2/*.html`, then had agents implement the
React. **The agents loosely "translated" the mockups instead of reproducing them, so the shipped screens diverged
significantly from the approved designs.** The user's words: *"last time you created some different screens and
these screens are extremely different."* Also: the real app uses a different (smaller) type scale than the mockups,
the theme toggle leaked onto the landing, and overall it doesn't read as a premium international product.

**The non-negotiable fix this time: design the exact screen, get it approved, then implement it 1:1, and prove
the implementation matches the design with side-by-side screenshots before moving on.** No loose translation.

## Required workflow (do it in this order)

### Phase 0 — Discovery (read before designing)
Read to understand the product, the data each screen consumes, and the current code:
- **Per-screen plans (FE + BE contracts):** `docs/superpowers/plans/v3-screens/` — one folder per page, each with
  `frontend_<slug>.md` + `backend_<slug>.md`. The backend docs are the **frozen contracts** you must design around.
  Start with `_index.md` (the 34-screen map + routes + roles + data sources).
- **Product/architecture/brand:** `docs/superpowers/v2/` (architecture, problems & differentiators, proctored
  integrity), `docs/brand/` (positioning, visual identity, UI/UX standard).
- **The prior (to-be-replaced) attempt, for reference only — do NOT copy:** `docs/brand/redesign-v2/*.html` mockups,
  and the current `frontend/apps/*` React. Understand what each screen does; then design better.
- **Run the current app** (`:3000`/`:3001`) and screenshot a few screens so you and the user share a baseline of
  what we're replacing.

### Phase 1 — Design language + system (use the skills below)
Establish, with the user's sign-off, the **new** design language: type scale (LARGE, confident), color/theme
system (still supports dark+light+accent+base for the Appearance feature, but pick a premium, trust-forward,
AI-driven direction — propose 2–3 directions with real mockups, let the user choose), spacing/rhythm, component
language, motion language (minimal, optimal, beautiful; reduced-motion-safe), iconography, the aperture brand mark.
Output: a committed design-system spec + token set + a small set of reference component mockups.

### Phase 2 — Per-screen high-fidelity mockups (design FIRST, approve EACH)
For **every** screen (all 34 unified screens — leave none out; landing first), produce a **high-fidelity mockup**
(self-contained, viewable in the browser, responsive, dark+light). Use the imagegen/design skills to explore, then
produce a precise, build-ready mockup. **Get explicit user approval on each screen (or batch) before implementing.**
The landing page especially must be reworked to international-product quality (and must NOT contain a theme toggle).

### Phase 3 — Implement EXACTLY (the fidelity loop)
For each approved screen: implement the real React/Tailwind to match the mockup **1:1** (same layout, spacing, type
scale, components, states, motion), reusing existing data hooks/mock seams unchanged. **Then verify fidelity:
screenshot the running screen and compare side-by-side against the approved mockup; iterate until they match.** Do
not move on while there's visible divergence. If you fan out to parallel agents, each agent must (a) be given the
exact mockup, (b) be told "reproduce, do not reinterpret," and (c) end with a side-by-side screenshot check.

### Phase 4 — Single-app unification + Appearance
Execute the single-app merge (one URL) and the Settings → Appearance feature (theme default device + accent + base),
removing the theme toggle from the landing/topbar. Keep all data wiring intact.

### Phase 5 — Verify & harden
Both: production `build` green, full typecheck green, browser-verified (landing + representative authed screens via a
forced session since the backend may be offline), reduced-motion respected, a11y (focus, headings, labels, contrast
≥4.5:1, ≥44px touch targets), no console errors, behavior/data unchanged. Commit in clean waves on the current branch
with **explicit paths** (never `git add -A`; the backend session shares the tree — never stage `src/`).

## Use ALL the relevant frontend skills (this is required)
Drive the work with the installed skills — at minimum:
- **`impeccable`** (design/critique/polish/audit; product register, OKLCH, motion, anti-slop bans) — the spine.
- **`ui-ux-pro-max`** (style/palette/font-pairing/layout/UX catalogs) for grounded design decisions.
- **`design-system`** (generate/audit the token system + visual consistency).
- **`redesign-skill` / `taste-skill` / `soft-skill` / `emil-design-eng`** (premium, anti-generic, high-end-agency craft).
- **`imagegen-frontend-web`** (generate premium per-section design references to design against) and
  **`image-to-code-skill`** (design-image → faithful implementation — directly serves the fidelity loop).
- **`motion-foundations` / `motion-patterns` / `motion-ui`** (the motion system).
- **`frontend-patterns` / `react-patterns` / `ui-styling`** (implementation quality, RSC boundaries, performance).
Use the **brainstorming** skill to lock the design direction with the user before building, and **writing-plans** to
turn the approved direction into the per-screen execution plan.

## Definition of done
- ONE app, ONE URL; landing is the only public entry; theme toggle is gone from landing/topbar and lives in
  Settings → Appearance (default Device).
- Every one of the 34 screens redesigned to the new premium language and **implemented to match its approved mockup
  1:1** (verified by side-by-side screenshots).
- Larger, professional, international-product typography throughout.
- Backend untouched; all data wiring/mock seams preserved; proctored-interview invariants intact.
- `build` + `typecheck` green for the unified app; a11y + reduced-motion respected; no console errors.

## First message to send the user (start here)
"I've read the product, the 34 per-screen contracts, and run the current app. Before I design anything: here are
2–3 distinct premium design directions for Aptura (with a real landing mockup for each) and the larger type scale I
propose. Which direction do you want? Then I'll mock up every screen for your approval and implement them exactly."
