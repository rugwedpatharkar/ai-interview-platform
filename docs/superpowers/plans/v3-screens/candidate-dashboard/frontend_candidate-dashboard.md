# Frontend — Candidate dashboard (v3 Midnight reskin)

> **Screen:** Signed-in candidate dashboard / application tracker.
> **Goal:** Port the existing dashboard to the **Midnight Intelligence** look — the `.app` sidebar+topbar shell, a
> KPI strip, a two-column body (applications list left · recommendations + up-next + practice right) — **appearance
> only, zero behavior change.** Every query, mutation, the **10s conditional poll**, the apply/withdraw flows, and the
> funnel mapping stay byte-for-byte identical; only markup + token classes change.

- **Unified route(s) + role:** `/` (signed-in) · **candidate**. Today: `frontend/apps/candidate/app/page.tsx`
  renders the **Dashboard branch** for an authed candidate.
- **Mockup:** ✓ `docs/brand/redesign-v2/dashboard-candidate.html` (skip Task 0).
- **Existing code it reskins:**
  - `frontend/apps/candidate/app/page.tsx` (authed Dashboard branch)
  - `frontend/apps/candidate/components/dashboard.tsx` (query/poll/mutations/apply form/assistant — **keep verbatim**)
  - `frontend/apps/candidate/components/application-card.tsx` (funnel-progress card — restyle to `.approw`/`.table-wrap`)
  - `frontend/apps/candidate/components/recommended-roles.tsx` (restyle to `.reccard` cards)
  - `frontend/apps/candidate/lib/funnel.ts` (`funnelStage`/`FUNNEL_STEPS` — **unchanged**, pure mapping)
- **Backend:** `backend_candidate-dashboard.md` (EXISTING — reuse v2 `../v2-screens/candidate-dashboard.md`
  + first-run `../v2-screens/onboarding.md`). Consumes `applications.listMyApplications`,
  `applications.apply`, `applications.withdrawApplication`, `recommendations.getCandidateRecommendations` — all unchanged.

---

## Layout & components

**Shell:** the `.app` sidebar+topbar product shell (the shared candidate shell — sidebar + sticky topbar). Regions
map to the mockup:

| Mockup region | Markup / `@ip/ui` classes | Source today |
|---|---|---|
| Sidebar | `.side` · `.side .brand` · `.navlabel` ("For you" / "Prepare") · `.navitem[aria-current]` · `.side .foot` + `.avatar` | candidate shell nav |
| Topbar | `.topbar` · `.crumb` (`Home / Dashboard`) · `.toolbar` + `.searchbox` + `.btn-ghost.btn-sm` + `.avatar` | shell topbar |
| Greeting | `.page-head` (`h2` "Welcome back, {name}" + `.sub`) + `.toolbar` (`.pill-accent` "New match" + `.btn-primary` "Find roles →") | dashboard heading |
| KPI strip | `.kpis` → 4× `.kpi` (`.k-label` · `.k-val.tnum` · `.k-delta(.up)`) | **derived from existing query data** (apps in flight, interviews, responses) — display-only counts; no new fetch |
| Two-column body | screen-local `.split` (`1fr 360px`) + `.col` | new wrapper around existing sections |
| LEFT — applications | `h3.section-h` + `.table-wrap` wrapping `ApplicationCard`s rendered as `.approw` rows (`.logo` · `.role`/`.co` · `.meta` with `.pill-*` + `.when.tnum`) | `ApplicationCard` restyled |
| RIGHT — up-next | `.card.upnext` (`.card-head` h3 + `.badge` "Proctored" · `.slot` + `.btn-primary` "Join interview →") | derived from the next non-terminal interview app |
| RIGHT — recommended | `h3.section-h` + 3× `.card.tight.reccard` (`.top` role/co + `.pill-good.tnum` match% · `<ul>` reason `<li>` with `.ck`) | `RecommendedRoles` restyled |
| RIGHT — practice CTA | `.card.tight.practice` (`.ic` + `.t`/`.d` + `.btn-ghost.btn-sm` "Start") | new presentational CTA (links `/practice`) |

> **Component classes (reference, don't redefine):** `.app · .side · .navitem · .topbar · .content · .page-head ·
> .kpis · .kpi · .table-wrap · .card(.tight) · .pill(.pill-accent/-good/-warn/-neutral) · .badge · .btn(.btn-primary/.btn-ghost/.btn-sm)`
> from `redesign-v2/app.css`; tokens from `tokens.css`. The screen-local `.split`/`.col`/`.approw`/`.reccard`/`.upnext`/`.practice`
> rules are copied from the mockup `<style>` block into the app's screen CSS (or Tailwind equivalents bound to the same vars).

**New vs reused:** no new logic components. `ApplicationCard` and `RecommendedRoles` keep their props/data and are
**restyled** to the row/card markup above. The KPI strip + up-next + practice CTA are **presentational** panels fed by
the existing `applications`/`recommendations` data already in `dashboard.tsx` (no new query).

---

## Data wiring (identical to today)

- **Client/seam:** `dashboard.tsx` uses the existing authed query/mutation hooks over `useAuth().api.applications.*`
  + `useAuth().api.recommendations.*`. **Unchanged.**
- **Query keys:** `["applications"]` (with the conditional `refetchInterval` 10s poll, gated on
  `!TERMINAL_STATES.has(state)`) and `["recommendations"]`. **Unchanged** — the reskin must not touch the query config.
- **Fields consumed** (from `backend_candidate-dashboard.md`, kept identical):
  - `Application`: `applicationId`, `jobId`, `state`, optional `jobTitle`/`companyName` (render-if-present → row title; else `Job {jobId}`).
  - `recommendations.matches[]`: `{ jobId, score, reasons[] }` → `.reccard` (score → `.pill` match%, reasons → `<li>`).
- **KPI / up-next derivation:** computed **client-side** from the already-fetched `applications` array (count
  non-terminal, count interview-stage, etc.) — no new RPC. The up-next panel picks the first
  `interview_pending`/`interview_in_progress` app and links `/interview/{applicationId}` (the existing CTA target).

---

## Tasks (bite-sized; no logic change — restyle + shell)

**No Task 0** (mockup ✓).

### Task 1: Wrap the Dashboard branch in the `.app` shell
- [ ] Render the authed dashboard inside the candidate `.app` shell (sidebar `.side` with "For you"/"Prepare"
  `.navlabel` groups + `.navitem`s: Dashboard, Jobs, Saved, Alerts, Applications, Practice, Messages, Settings;
  `aria-current="page"` on Dashboard; `.side .foot` avatar). Topbar `.topbar` with `.crumb` `Home / Dashboard`,
  `.searchbox`, `.btn-ghost.btn-sm` Alerts, `.avatar`. Content under `.content`.
- [ ] **Keep** the entire `dashboard.tsx` data layer mounted unchanged inside `.content`.
- [ ] Build (`--filter @ip/candidate build`, stop dev first) + browser-verify on the :4173 preview; explicit-path commit.

### Task 2: Greeting `.page-head` + KPI strip
- [ ] Replace the existing heading with `.page-head` (`h2` "Welcome back, {firstName}" + `.sub` summary line) and a
  `.toolbar` (`.pill-accent` "New match" when recommendations exist + `.btn-primary` "Find roles →" → `/jobs`).
- [ ] Add the `.kpis` strip (4 `.kpi` tiles) computed from the existing `applications` array — **display-only**, no fetch.
- [ ] Build + browser-verify (dark + light); explicit-path commit.

### Task 3: LEFT column — applications as `.approw` rows in `.table-wrap`
- [ ] Restyle `ApplicationCard` (or wrap its list) so each application renders as an `.approw` inside a single
  `.table-wrap`: `.logo` (company initial), `.role`/`.co`, `.meta` with the **existing** status `.pill` (mapped via
  `applicationStatus(state)` → `.pill-accent/-good/-warn/-neutral`) + `.when.tnum`. **Keep** the stage CTAs
  (`aptitude_pending` → Take test, `interview_pending` → Start interview) and the withdraw `ConfirmDialog` — same handlers.
- [ ] Preserve the loading/empty/error branches and the funnel derivation (`funnelStage`) untouched.
- [ ] Build + browser-verify the 10s poll still fires while any app is non-terminal (network tab) and idles when all terminal; commit.

### Task 4: RIGHT column — up-next + recommended + practice
- [ ] Add the `.card.upnext` panel (next interview app → `.slot` + `.btn-primary` "Join interview →" → `/interview/{id}`);
  hide when no interview-stage app. Restyle `RecommendedRoles` to `h3.section-h` + `.card.tight.reccard` cards
  (`.pill-good.tnum` match% + reason `<li>` with `.ck`). Add the `.card.tight.practice` CTA → `/practice`.
- [ ] **Keep** `RecommendedRoles`' query/empty/loading. The up-next + practice panels are presentational only.
- [ ] Build + `--filter @ip/{ui,shared,api-client} typecheck` green; browser-verify full dashboard; commit.

---

## States & a11y
- **States (all preserved):** **loading** (`LoadingState`), **empty** ("No applications yet" → apply form),
  **error** (`ErrorState` + retry), **success** (`.approw` tracker + recommendations). The **live 10s poll** behaves
  exactly as before. Apply (busy + `inFlight` latch) and withdraw (confirm + busy) unchanged. `RecommendedRoles` keeps
  its own loading/empty/error.
- **Responsive:** `.split` collapses to one column ≤1000px; `.kpis` → 2-up ≤1000px; sidebar hides on mobile (`.side`
  hidden, per app.css). Approws stay readable; reccards stack.
- **Dark + light:** **dark-first** (mockup is `data-theme="dark"`). All colors via tokens (`--accent`, `--ink-*`,
  `--surface-*`, `.pill-*` token swatches) — **no hardcoded color**; reads per-user Appearance accent/base.
- **A11y:** `aria-current="page"` on the active nav; status pills carry text labels (not color-only); CTAs are real
  `Link`/`button`; withdraw `ConfirmDialog` keyboard-accessible; focus rings via tokens; contrast ≥4.5:1; KPI numbers `.tnum`.

## Acceptance
- Matches `dashboard-candidate.html` (shell + KPI strip + two-column body + up-next/recommended/practice).
- Build + typecheck green for `@ip/candidate` (+ `@ip/ui`/`shared`/`api-client`).
- **Zero functional diff:** same `Application.ListMyApplications`/`apply`/`withdrawApplication` +
  `recommendations.getCandidateRecommendations`, same `["applications"]`/`["recommendations"]` keys, same
  `TERMINAL_STATES`-gated 10s poll, same funnel derivation. Mock→real path unchanged (binds to live `api.*` today).
