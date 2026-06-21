# Job pipeline — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Rebuild `/company/jobs/[id]` from scratch as a **stage-column kanban** of applicants — one
`.cell` "lane" per funnel stage, applicants as `.match > .card` rows that can be dragged or
acted-upon to move stage. The previous v2/Midnight applicants table layout is **discarded** in
favour of the kanban form, which surfaces the funnel narrative (Applied → Interview → Review →
Decision) at a glance. The Ranked / Reports / Scores tabs and Settings (gate-mode) remain — they
are rebuilt against the new `.cell` / `.ring` / `.bar` primitives — but the **Pipeline** tab is
the kanban. Every existing `Application.ListApplicants` / `Recommendation.GetJobRankedCandidates`
/ `Decision.*` RPC is preserved verbatim.

## Route + role

`/company/jobs/[id]` (`apps/company/app/jobs/[id]/page.tsx`) · **company** — guarded by
`useRequireRole(["recruiter", "company_admin"])` (enforced inside `CompanyShell`).

## Approved mockup (build to this exactly)

- **Live demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — `.cell` (anchor + supporting), `.match > .card` rows with avatar + name + role + `.pct`,
  `.pill-good/.pill-warn/.pill-danger`, `.ring`, `.bar`, `.tag` mono kickers, `.itl-pip.l/.m/.h`
  severity dots (reused for the integrity pill).
- **Screenshots:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.

No per-screen mockup yet — Task 0 builds the kanban composition.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope:

- `frontend/apps/company/app/jobs/[id]/page.tsx` — tab host (Pipeline / Report / Schedule /
  Messages); the tabs survive, the Pipeline panel is rebuilt as a kanban
- `frontend/apps/company/components/applicants-table.tsx` — table markup (the **table form is
  discarded**; the kanban replaces it)
- `frontend/apps/company/components/ranked-panel.tsx` — rebuilt to `.cell` + `.match > .card`
  rows + `.ring` per applicant
- `frontend/apps/company/components/reports-panel.tsx` · `score-distribution-panel.tsx` —
  rebuilt to the new `.cell` + `.bar` / `.bars` vocabulary
- `frontend/apps/company/components/gate-mode-toggle.tsx` — rebuilt as `<GateModeTiles />`
  matching the post-a-job tiles
- `frontend/apps/company/components/batch-decision-bar.tsx` — replaced by `<SelectionBar />`
  on the kanban (mirrors the `.pill`/button language of the design language)

What is **NOT** touched: `CompanyShell`, `frontend/apps/company/lib/selection.ts` (pure reducer
+ tests survive), `applicationStatus` / `StatusPill` mapping (logical mapping survives; only
markup is new), any `*.proto`.

## Section spine — 7 regions, in order

| # | Region | Component | Notes |
|---|---|---|---|
| 0 | App shell | `<CompanyShell>` (existing) | `.app` sidebar + topbar. **Jobs & applicants** `aria-current`. Topbar crumb = `<Company> / Jobs / <Title>`, search box ("Search applicants…"), **Export** `.btn-ghost.btn-sm`, avatar. |
| 1 | Job head | `<JobHead />` | h1 (job title) + `.sub` line (`Remote · Full-time · Published Nd ago`) + trailing `.pill-teal` "Advisory gate" (when `gate_mode==="advisory"`) or `.pill-warn` "Auto-end on HIGH" (when `gate_mode==="auto"`). |
| 2 | Tab strip | `<JobTabs />` | `Pipeline · Report · Schedule · Messages · Settings`. `role="tablist"`, selected → `aria-selected="true"` and a teal underline (2px). Tab content swaps below. |
| 3 | KPI strip (Pipeline tab) | `<PipelineKpis />` | `.stats-grid` (4 columns) of `.stat`: **Applicants · Interviewed · Passed gate · Median response**. Derived from the already-fetched applicants list — render-only, no extra fetch. |
| 4 | Kanban — applicants stage columns (Pipeline tab) | `<ApplicantsKanban />` | Horizontal scroll row of stage `.cell` "lanes". Lanes: **Applied · Interview pending · Interviewed · Assessment review · Shortlisted · Rejected**. Each lane = `.cell.tight` with `.tag` mono header (lane name + `.tnum` count), then a vertical `.match` list of `.card` applicant rows. |
| 5 | Applicant card (kanban) | `<ApplicantCard />` | `.match > .card` row: avatar (initials over `--coral`→`--teal` gradient), `.col` with `<b>` name + `<span>` role/sub, trailing `.pct` mono match% from the ranked map (when available), and a **single-line integrity pill** below the row using `.pill-good/.pill-warn/.pill-danger` (Clean / Flags / Auto-ended). The `assessment_review` lane carries an extra `.tag` "AI recommended — you decide." |
| 6 | Selection bar | `<SelectionBar />` | Floating bottom bar (visible when ≥1 decidable card is selected). Inverted ink background. "N selected" + **Message** `.btn-ghost.btn-sm` + **Reject** `.btn-ghost.btn-sm` + **Advance** `.btn-primary.btn-sm`. Wires to the existing batch fan-out. |
| 7 | Settings tab (gate-mode) | `<GateModeTiles />` (the post-a-job primitive, reused) | Two selectable `.cell` tiles (Advisory / Auto). Persisted via `Job.UpdateJob({ jobId, gateMode })`. Save `.btn-primary` disabled until changed. |

The **Ranked / Reports / Scores** tabs are rebuilt as ordered `.cell` lists or single
`.cell.anchor`s (per tab) using the new primitives; the data shape is unchanged.

## Layout & components — map to `@ip/ui` and tokens

| Region | Primitive | Tokens |
|---|---|---|
| Shell | `CompanyShell` (existing) | already on the new tokens |
| Job head | `h1.display` + `.sub` + `.pill-teal` / `.pill-warn` | typography + pill tokens |
| Tab strip | `[role=tablist]` with bottom-border `--line`; active tab carries 2px `--teal` underline | tab tokens |
| KPI strip | `.stats-grid` + `.stat` | as design language |
| Kanban lane | `.cell.tight` with `.tag` header + vertical `.match` body | `--surface`, `--line` |
| Applicant card | `.match > .card` | teal-gradient avatar, mono `.pct` |
| Integrity pill | `.pill-good` Clean · `.pill-warn` Flags (N) · `.pill-danger` Auto-ended | severity tones from the design language |
| Selection bar | inverted-ink floating bar; primary + ghost `.btn-sm` | `--ink-deep` bg, `--teal-ink` foreground |
| Gate tiles | `.cell` + `.cell.anchor` (selected) | `--teal-soft` tint |

All primitives live in `@ip/ui/src/app.css`. **Anti-slop ban —** no side-stripe borders on
cards, no glassmorphism, no identical card grids (the kanban lanes are **purpose-rotated**, not
visually identical), no `01 · 02 · 03` numbered eyebrows on lanes (the lane name is the kicker).

## Data wiring / seam

**Identical to today.** No new RPC, no new query key.

| Region | Hook | Query key | Source |
|---|---|---|---|
| Kanban applicants | `useAuthedQuery(token, ["applicants", jobId], () => api.applications.listApplicants({ jobId }))` | `["applicants", jobId]` | `Application.ListApplicants` |
| Ranked tab + match% on cards | `useAuthedQuery(token, ["ranked", jobId], () => api.recommendations.getJobRankedCandidates({ jobId }))` | `["ranked", jobId]` | `Recommendation.GetJobRankedCandidates` |
| Job head + gate-mode seed | `useAuthedQuery(token, ["job", id], () => api.jobs.getJob({ jobId: id }))` (existing) | `["job", id]` | `Job.GetJob` (echoes `aptitudeConfig.gateMode`) |
| Advance / Override gate | `useMutation(({ applicationId }) => api.decisions.overrideGate({ applicationId }))` → invalidates `["applicants",jobId]`, `["ranked",jobId]` | — | `Decision.OverrideGate` |
| Decide (shortlist / hire / reject) | `useMutation(({ applicationId, outcome }) => api.decisions.decideApplication({ applicationId, outcome }))` → invalidates the same keys | — | `Decision.DecideApplication` |
| **Batch decide** | `Promise.allSettled` fan-out over `DecideApplication` (no new RPC). Failed-count toast. | — | (existing pattern) |
| Save gate-mode | `useMutation(({ jobId, gateMode }) => api.jobs.updateJob({ jobId, gateMode }))` → invalidates `["job", id]` | — | `Job.UpdateJob` (new in v2) |

**Drag-to-move stage actions** are syntactic sugar over the existing `Decision.*` mutations —
dropping a card on **Shortlisted** fires `DecideApplication({ outcome: "shortlisted" })`,
dropping on **Rejected** fires `DecideApplication({ outcome: "rejected" })`, dropping on
**Interview pending** from the `assessment_review` lane fires `OverrideGate`. No new RPC. The
target-lane validity is computed from the same `decidable` set as today
(`scored|shortlisted|assessment_review`). Invalid drops snap back.

**Anti-fiction guard.** Empty pipeline shows truthful copy — "**No applicants yet** — share the
role link" with a copy-to-clipboard `.btn.btn-ghost.btn-sm` of the public job URL. Never seed
sample applicants. Per-lane empty states say "No <stage> applicants yet" — never "Be the first!"
or other fake nudges.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Build the per-screen mockup.** Create
> `docs/brand/redesign-v3/screens/job-pipeline.html` linking `@ip/ui/src/{tokens.css,app.css}`
> and the sprite. Embed the `.app` shell. Body = `<JobHead />` + `<JobTabs />` + Pipeline tab
> with the KPI strip + the 6-lane kanban (each lane with 2-4 sample applicant rows, integrity
> pills mixed Clean / Flags / Auto-ended; include one `assessment_review` row with the "AI
> recommended — you decide" tag) + the selection bar (rendered as if 2 cards are selected).
> Sample names "Candidate A" / "Candidate B". Browser-verify in both themes at 1440×900 and
> 390×844. Commit the new HTML file only.

- **Task 1 — Shell + head + tabs.** Mount `JobDetailPage` under `CompanyShell`; render
  `<JobHead />` (h1 + sub + gate badge) and `<JobTabs />` (Pipeline / Report / Schedule /
  Messages / Settings). Keep the existing tab-content host (the other tabs still mount their
  components). Confirm topbar crumb. Commit
  `apps/company/app/jobs/[id]/page.tsx`, `apps/company/components/jobs/{job-head.tsx,job-tabs.tsx}`.

- **Task 2 — Pipeline KPI strip.** Build `<PipelineKpis />` deriving 4 counts from the
  already-fetched `["applicants", jobId]` list. Render-only, no extra fetch. Verify the strip
  matches the design-language `.stats-grid` rhythm. Commit
  `components/pipeline/pipeline-kpis.tsx`.

- **Task 3 — Applicants kanban + applicant card.** Build `<ApplicantsKanban />` + the lane
  `<KanbanLane />` + the card `<ApplicantCard />`. Group the applicants by `state` into the 6
  lanes. Each card reads:
  - `match%` from the `["ranked", jobId]` map (key by `candidateUserId`), missing → `—`
  - integrity pill from the existing `StatusPill` mapping (or its equivalent), Clean /
    Flags (N) / Auto-ended
  - the `assessment_review` lane carries the "AI recommended — you decide" `.tag` on each card.

  Wire the existing per-row `OverrideGate` / `DecideApplication` handlers behind a card's
  context menu and the drag-drop targets. Preserve the existing poll loop for non-terminal
  states. Truthful empty: "No applicants yet — share the role link" + copy-link button. Per-lane
  empty: "No <stage> applicants yet." Commit
  `components/pipeline/{applicants-kanban,kanban-lane,applicant-card}.tsx`.

- **Task 4 — Drag-to-move (or button-driven move).** Add a lightweight drag handler over the
  `.match > .card` rows using `dnd-kit` (already a candidate dep — verify) or a CSS-only "Move
  to…" menu when DnD is not yet wired. Dropping a card on a valid target lane fires the
  matching mutation (per the mapping above). Invalid drops snap back. Verify the same handlers
  fire from the kanban as from the (now-deleted) table — no new RPC. Commit
  `components/pipeline/applicants-kanban.tsx`.

- **Task 5 — Selection bar.** Build `<SelectionBar />` over the existing `lib/selection.ts`
  reducer (`toggle` / `toggleAll` / `selectableIds`). Floating bar appears when ≥1 decidable
  card is selected. Wire the fan-out batch handler (`Promise.allSettled` over
  `DecideApplication`) verbatim. Failed-count toast on partial failure. Commit
  `components/pipeline/selection-bar.tsx`.

- **Task 6 — Ranked / Reports / Scores tabs.** Rebuild `ranked-panel.tsx` to a `.cell` + ordered
  `.match > .card` list with `.ring` per row (overall score, 0–100); `reports-panel.tsx` to a
  `.cell.anchor` summary + a `.cell` per applicant; `score-distribution-panel.tsx` to a
  `.cell` with a `.bars` mini-chart. Their queries + props stay identical. Commit the three
  component files.

- **Task 7 — Settings tab (gate-mode).** Build the Settings tab as a `.cell` host for the
  `<GateModeTiles />` primitive (same component as `post-a-job`). Seed from
  `job.data?.aptitudeConfig?.gateMode ?? "auto"`. Save → `Job.UpdateJob`, invalidate
  `["job", id]`. Commit `app/jobs/[id]/settings-tab.tsx`.

- **Task 8 — Full preview + fidelity verify.**
  1. `--filter @ip/company build` + `tsc --noEmit` green.
  2. Boot dev, sign in as a recruiter, open a job with mixed applicants. Screenshot every tab
     in both themes at 1440×900 and 390×844. Side-by-side against the Task-0 HTML and the
     design-language demo.
  3. Confirm the existing `lib/selection.ts` tests still pass.
  4. Confirm the same `Decision.*` handlers fire from the kanban as from the previous table —
     `["applicants",jobId]` / `["ranked",jobId]` / `["analytics","kpis",30]` are invalidated
     identically.
  5. Confirm a non-manager loading the page is still redirected by `CompanyShell`.

## States & a11y

- **Pipeline.**
  - **Loading** — kanban renders skeleton cards in each lane.
  - **Empty (no applicants at all)** — full-bleed truthful copy "No applicants yet — share the
    role link" + copy-link button. **Never seeded with fake applicants.**
  - **Per-lane empty** — "No <stage> applicants yet."
  - **Error** — inline `.pill-danger` row + Retry; the other lanes stay interactive.
  - **Success** — cards render in lanes; selection bar appears when decidable rows are
    selected; drag-drop fires mutations.
- **Assessment review lane (advisory only).** Cards carry "AI recommended — you decide"
  `.tag` + per-card Advance / Decline buttons inside the card body. Polls until the card
  transitions.
- **Settings.** Gate-mode seeded from the job; Save disabled until changed; success/error
  toasts.
- **Auto / legacy jobs.** `gateMode === "auto"` → no `assessment_review` lane content (the
  pipeline funnel never produces those rows). Default-off, unchanged behavior.
- **Responsive.** Sidebar collapses ≤1000px. Kanban lanes horizontally scroll under ~900px
  (snap-to-lane scrolling); below ~600px, lanes stack vertically into a single column. KPI
  strip 4 → 2 → 1 columns. Selection bar drops above the safe area on mobile.
- **Dark + light.** All color via tokens. Per-user Appearance accent recolors the active tab
  underline, the selected gate tile, the `.pill-teal` gate badge, the kanban accent.
- **A11y.** Tabs use `role="tablist"` + `aria-selected`. Kanban lane has
  `role="region" aria-label="<stage>"`. Each applicant card is a real `<article>` with a
  keyboard-focusable "Open report" `<a>` (the card's primary affordance). Drag-and-drop has a
  keyboard fallback (Space to pick up, arrows to move between lanes, Space to drop — `dnd-kit`
  provides this). Integrity pill carries a text label (not color-only). Touch targets ≥44×44.
  Contrast ≥4.5:1. Focus rings via `:focus-visible` — `--teal` 2px / 4px halo.

## Acceptance

- Looks 1:1 like the per-screen Task 0 HTML AND the relevant slices of
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html). Side-by-side
  screenshot proof committed under `docs/brand/redesign-v3/verify/job-pipeline-{light,dark}.jpeg`.
- `--filter @ip/company build` green; `tsc --noEmit` green; no console errors / warnings.
- **Zero functional diff.** Same `ListApplicants` / `GetJobRankedCandidates` queries, same
  `OverrideGate` / `DecideApplication` mutations + batch fan-out, same `lib/selection.ts`
  reducer + tests, same gate-mode `UpdateJob` mutation. The advisory branch (`assessment_review`)
  is default-off (`auto`) so existing jobs are byte-for-byte unchanged.
- Empty pipeline shows truthful copy — no fabricated applicants.
- A non-manager loading the page is still redirected by `CompanyShell`.
