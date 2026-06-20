# Frontend — `applicant-report` (Midnight v3)

> **Screen:** AI candidate report + integrity band — the recruiter decision surface.
> **Goal:** Reskin the applicant report to the Midnight shell — a headline **ScoreRing**, per-competency
> evidence cards, the **proctoring integrity band** (severity-grouped flag timeline + recording + auto-terminated
> state), and the audited decision control — **appearance-only**. Every query, handler, and DTO stays identical;
> only markup/classes change to match the mockup.
> **Unified route(s) + role:** `/company/jobs/[id]/applicants/[appId]` · **company** (recruiter / company_admin),
> inside the `.app` shell under `/company/*`.
> **Mockup:** `redesign-v2/candidate-report.html` ✓ (exists — **skip Task 0**).
> **Existing code it reskins (exact paths):**
> - `frontend/apps/company/app/jobs/[id]/applicants/[appId]/page.tsx` (Tabs: Report / Schedule / Messages)
> - `frontend/apps/company/components/report-view.tsx`
> - `frontend/apps/company/components/score-ring.tsx`
> - `frontend/apps/company/components/competency-card.tsx`
> - `frontend/apps/company/components/integrity-band.tsx`
> - `frontend/apps/company/components/proctor-labels.ts`
> - `frontend/apps/company/components/schedule-panel.tsx` (Schedule tab)
> - `frontend/apps/company/components/message-thread-view.tsx` (Messages tab)
> - `frontend/apps/company/app/jobs/[id]/applicants/[appId]/integrity-client.ts` (mock seam — untouched)
> - `frontend/apps/company/app/jobs/[id]/applicants/[appId]/types.ts` (DTO — untouched)

**Scope note (carry into copy + labels):** this surface reports **behavioral / audio-visual proctoring only**.
Biometric **identity matching is OUT of scope** — the report must NOT claim "identity verified" anywhere. The
integrity band reads flag types, severity, timestamps, an integrity score, and an optional session recording; it
never asserts an identity match.

## Layout & components

**Shell:** the signed-in product shell — `.app` (sidebar `.side` + `.topbar`) from `@ip/ui` / `redesign-v2/app.css`,
mounted by `CompanyShell`. The page body lives in `.content`; a breadcrumb/`Back to job` link sits above the tabs.

| Region | Mockup class(es) | Maps to (existing component) |
|---|---|---|
| Page chrome | `.app · .side · .topbar · .content` | `CompanyShell` (reskinned once, shared) |
| Back link | `.btn .btn-ghost .btn-sm` | the `buttonVariants({ variant: "ghost", size: "sm" })` Link |
| Tab strip (Report/Schedule/Messages) | `.tabs > button[aria-selected]` | `@ip/ui` `Tabs`/`TabsList`/`TabsTrigger` |
| Report verdict header | `.card > .card-head` + `.pill` (recommendation) | `report-view.tsx` header `Card` + recommendation `Badge` |
| Headline score | `.ring > .v` (conic-gradient donut) | `score-ring.tsx` (`ScoreRing`) |
| Verdict / exec summary row | `.verdict-row · .summary` | the score + `executiveSummary` flex row |
| KPI strip (overall / integrity / flags) | `.stats > .stat` (`.k-label/.k-val/.k-sub`) | optional `kpi`-style row derived from existing scalars |
| Highlights / Risks | `.card` list with `.pill-good` / `.pill-warn` accents | `ReportSection` lists |
| Competency cards | `.comp` (`.c-name · .c-score · .c-bar > .bar > i · .c-ev > .quote`) | `competency-card.tsx` (`CompetencyCard`) |
| Integrity band | `.card` + `.sev-clean / .sev-med / .sev-high` rows + `.pill` severity badges | `integrity-band.tsx` (`IntegrityBand`) |
| Evidence quote | `.quote · .q-meta` | the evidence `<li>` in `CompetencyCard` |
| Decision control | `.toolbar > .btn .btn-primary / .btn-ghost` | `DecisionControl` (advance / shortlist / decline) |

**New vs reused:** **no new components.** This is a class/markup reskin of the existing tree. `ScoreRing`,
`CompetencyCard`, `IntegrityBand` are reused as-is at the React level; their internal Tailwind/token classes are
swapped to the Midnight component classes (`.ring`, `.comp`, `.bar > i`, `.pill-*`) so they read against
`tokens.css`. The score "bar" in competency cards uses `.bar > i` (width = `score%`).

## Data wiring (kept identical to today)

- **Client/seam:** `useAuth().api.reports` — `api.reports.getReport({ applicationId })` (with the existing
  scoring-window **poll**: success → stop; `NOT_FOUND`/transient → poll 3 s) and the sibling, non-blocking
  `getIntegrityTimeline({ applicationId })` (mockable via `integrity-client.ts` `USE_MOCK`). The Messages-tab unread
  badge keeps its `messagesClient.listThreads()` 30 s poll.
- **TanStack query keys (unchanged):** `["report", appId]` · `["integrity", appId]` · `messagesListQueryKey()`.
- **Backend fields consumed** (see [`backend_applicant-report.md`](./backend_applicant-report.md)): from `ReportDTO`
  — `executiveSummary`, `highlights[]`, `risks[]`, `overallScore`, `recommendation`, `competencies[]`
  (`competency/score/rationale/evidence[]`), `integrityScore`, `integrityFlagCount`, `autoTerminated`; from
  `IntegrityTimeline` — `integrityScore`, `flags[]` (`type/severity/at/meta`), `recordingUrl`, `autoTerminated`,
  `terminatedReason`. **`toReportDTO` adapter, the poll predicate, and all gating logic stay byte-for-byte.**

## Tasks (bite-sized — reskin only, no logic change)

> Mockup exists → **skip Task 0.** Each task: swap ad-hoc Tailwind colors → Midnight component classes to match the
> mockup, keep all handlers/queries identical, then per-task build + browser-verify + explicit-path commit.

### Task 1: Shell + tabs + back link
- [ ] Confirm `CompanyShell` renders the `.app`/`.side`/`.topbar`/`.content` Midnight shell (shared reskin); set the
  topbar crumb to `Jobs / <job> / <candidate>` per `.crumb b`.
- [ ] Reskin the tab strip to `.tabs > button` (`aria-selected` active state from `@ip/ui` Tabs); preserve the
  Messages unread `Badge` (now a `.badge`/`.pill-accent`).
- [ ] Build + browser-verify on :4173; commit `frontend/apps/company/app/jobs/[id]/applicants/[appId]/page.tsx`.

### Task 2: Report verdict header + headline ScoreRing
- [ ] In `report-view.tsx`, wrap the header in `.card > .card-head`; recommendation `Badge` → `.pill`
  (`advance→.pill-good`, `hold→.pill-warn`, `reject→.pill-bad`).
- [ ] In `score-ring.tsx`, render the donut via the `.ring` conic-gradient pattern (`--p: <pct>`, `.v` value)
  reading `var(--accent)`/`var(--surface-2)` — no hardcoded color; keep the `role="img"` + `aria-label`.
- [ ] Lay the score + `executiveSummary` as `.verdict-row` / `.summary`.
- [ ] Build + browser-verify; commit `report-view.tsx` + `score-ring.tsx`.

### Task 3: Highlights / Risks + optional KPI strip
- [ ] Reskin `ReportSection` lists; tint Highlights with `.pill-good`, Risks with `.pill-warn` accents (text tone via
  tokens, not raw colors).
- [ ] Optional `.stats > .stat` strip (Overall / Integrity score / Flag count) derived from the **already-present**
  scalars (`overallScore`, `integrityScore`, `integrityFlagCount`) — purely presentational, no new data.
- [ ] Build + browser-verify; commit `report-view.tsx`.

### Task 4: Competency cards
- [ ] In `competency-card.tsx`, adopt the `.comp` layout: `.c-name` (competency), `.c-score` (the small `.ring` or a
  `.tnum` %), `.c-bar > .bar > i` (width = `score%`), `.c-ev` evidence list with `.quote` + `.q-meta` for the note.
- [ ] Keep the `tone(score)` thresholds; map to `.bar` fill via token color only.
- [ ] Build + browser-verify; commit `competency-card.tsx`.

### Task 5: Integrity band (the trust surface)
- [ ] In `integrity-band.tsx`, reskin to a `.card` with: header + flag-count `.pill`; the **auto-terminated banner**
  as a `.pill-bad`/alert row when `autoTerminated`; the integrity `.ring`; severity groups rendered as
  `.sev-clean / .sev-med / .sev-high` rows with per-flag `.pill` (severity tone) + `<time>` timestamp; the recording
  `<video>` inside a `.card.tight`.
- [ ] In `proctor-labels.ts`, keep `signalLabel` + `severityTone` exactly; only ensure tones map to `.pill-*`.
- [ ] **Copy check:** no "identity verified" / identity-match language anywhere (behavioral/AV scope only).
- [ ] Build + browser-verify (mixed-flag fixture via `NEXT_PUBLIC_MOCK=1`); commit `integrity-band.tsx` +
  `proctor-labels.ts`.

### Task 6: Schedule + Messages tabs
- [ ] Reskin `schedule-panel.tsx` and `message-thread-view.tsx` to `.card`/`.btn`/`.input`/`.pill` Midnight classes;
  keep their clients, queries, and handlers identical.
- [ ] Build + browser-verify all three tabs; commit `schedule-panel.tsx` + `message-thread-view.tsx`.

## States & a11y

- **States (named, all preserved):**
  - **Report:** *loading* (`LoadingState`) · *generating* (`NOT_FOUND` → auto-updating `Alert tone="info"`) ·
    *error* (non-404 → `ErrorState` + retry) · *success* (ScoreRing + competencies + sections + decision control).
  - **Integrity band:** *loading* (inline spinner — never blocks the report) · *error* (inline warning `Alert`,
    "data unavailable") · *empty* (`flags: []` → "No proctoring flags" + clean/green ring) · *populated*
    (severity-grouped timeline + recording) · *auto-terminated* (`.pill-bad` banner + danger ring).
  - **Legacy report** (pre-extend): `competencies: []`, `integrityScore: 0` → flat highlights/risks view, no
    competency block, no band — zero errors.
- **Responsive:** headline ScoreRing + summary stack on mobile (`sm:flex-row`); competency cards full-width; flag
  rows wrap; recording `<video>` fluid; the `.side` collapses under the `@media (max-width:1000px)` shell rule.
- **Dark + light:** all color via tokens (`--accent`, `--surface-2`, `.pill-*` families, `.ring` conic over
  `var(--accent)`) — reads `--accent`/base vars, **no hardcoded color**; auto-themes.
- **A11y:** `ScoreRing` `role="img"` + percentage `aria-label`; flag timestamps `<time dateTime>`; recording
  `<video aria-label>`; severity counts as text `.pill`s (not color-only); focus rings via `:focus-visible`
  (`tokens.css`); contrast ≥4.5:1.

## Acceptance

- Matches `redesign-v2/candidate-report.html` (ScoreRing headline, per-competency evidence cards with `.bar`/`.quote`,
  integrity band with severity-grouped flags + recording + auto-terminated state, Report/Schedule/Messages tabs).
- `--filter @ip/ui typecheck` + `--filter @ip/company build` + `typecheck` green.
- **Zero functional diff:** every query key, the report poll predicate, the integrity mock seam, the decision gating
  (`scored`/`shortlisted`), and the Messages unread poll are unchanged — markup/classes only.
- Mock→real path unchanged: `NEXT_PUBLIC_MOCK=1` still renders the full band with fixtures; real `getReport` +
  `getIntegrityTimeline` bind exactly as today.
