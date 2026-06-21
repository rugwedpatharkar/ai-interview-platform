# Applicant report — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Rebuild `/company/jobs/[id]/applicants/[appId]` from scratch in the Aperture Pro design language.
**This is THE killer surface for the product** — the page where a recruiter looks at a candidate
and decides. It carries three tabs (Report / Schedule / Messages); the **Report** tab is the
centrepiece, and inside it the **Integrity Timeline** is the marquee primitive: a video-editor-
style scrubber with severity pips, an active event card, evidence clips, and the
auto-terminated banner when the server ended the interview.

The previous v2/Midnight markup is **discarded**. The Integrity Timeline must match the demo's
`#integrity` section 1:1 in shape, motion, and copy — same `.itl` container, same `.itl-track`
+ pips, same `.itl-events` row of 3 cards with one `.expanded`, same coral scrubber. The
applicant-report consumes the **same primitive** the landing demo uses; this is the design
language's "see the evidence" moment applied to a real candidate.

**Scope note (carry into copy + labels):** this surface reports **behavioural / audio-visual
proctoring only**. Biometric identity matching is **OUT of scope** — the report must NOT claim
"identity verified" anywhere. The integrity band reads flag types, severity, timestamps, an
integrity score, and an optional session recording; it never asserts an identity match.

## Route + role

`/company/jobs/[id]/applicants/[appId]` (`apps/company/app/jobs/[id]/applicants/[appId]/page.tsx`)
· **company** — guarded by `useRequireRole(["recruiter", "company_admin"])` (enforced inside
`CompanyShell`).

## Approved mockup (build to this exactly)

- **Live demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — pay particular attention to:
  - the **Integrity Timeline** section (`<div class="itl">…`) — track (`.itl-track`),
    severity pips (`.itl-pip.l/.m/.h`), coral scrubber (`.itl-scrubber`), 3-column events
    row (`.itl-events > .event`, one `.expanded` with `.clip` evidence).
  - the **Evidence Report deep-dive** section (`.evidence > .evidence-card`) — recommendation
    pill (`.pill-coral` / `.reco`), score ring (`.ring`), competency cards (`.competency`)
    with quoted transcript (`.why` with curly-quote markers, `.stamp` mono timestamp).
- **Screenshots:** `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.

No per-screen mockup yet — Task 0 builds it, mirroring the integrity + evidence sections 1:1.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope:

- `frontend/apps/company/app/jobs/[id]/applicants/[appId]/page.tsx` — tab host (Report /
  Schedule / Messages)
- `frontend/apps/company/components/report-view.tsx` — verdict header + summary + sections
- `frontend/apps/company/components/score-ring.tsx` — rebuilt on top of the design language's
  `.ring` conic-gradient primitive
- `frontend/apps/company/components/competency-card.tsx` — rebuilt on top of `.competency` +
  `.bar` + `.why` (with curly-quote markers) + `.stamp`
- `frontend/apps/company/components/integrity-band.tsx` — **completely rewritten** as the
  `<IntegrityTimeline />` primitive matching the demo: `.itl + .itl-head + .itl-track +
  .itl-pip.l/.m/.h + .itl-scrubber + .itl-events > .event`
- `frontend/apps/company/components/schedule-panel.tsx` — rebuilt against new `.cell` + `.input`
  + `.btn` tokens
- `frontend/apps/company/components/message-thread-view.tsx` — rebuilt against the same

What is **NOT** touched: `CompanyShell`,
`apps/company/app/jobs/[id]/applicants/[appId]/integrity-client.ts` (the mock seam stays —
`USE_MOCK` still works), `apps/company/app/jobs/[id]/applicants/[appId]/types.ts` (the DTOs
`ReportDTO`, `IntegrityTimeline`, `ProctorFlag`, `Competency`, `Evidence`, `HIGH_SIGNALS` —
unchanged), `components/proctor-labels.ts` (`signalLabel` + `severityTone` stay; only the
consumer markup is new), any `*.proto` / generated client.

## Section spine — 9 regions, in order

| # | Region | Component | Notes |
|---|---|---|---|
| 0 | App shell | `<CompanyShell>` (existing) | `.app` sidebar + topbar. **Jobs & applicants** `aria-current`. Topbar crumb = `<Company> / Jobs / <Title> / <Candidate>`. |
| 1 | Back row | `<BackRow />` | `.btn.btn-ghost.btn-sm` "← Back to <Job title>" linking `/company/jobs/[id]`. |
| 2 | Tab strip | `<ReportTabs />` | `Report · Schedule · Messages`. `role="tablist"`, 2px teal active underline. Messages tab carries an unread `.pill.pill-coral` badge (from the existing 30s `messagesClient.listThreads()` poll). |
| 3 | **Auto-terminated banner** (when `autoTerminated`) | `<AutoTerminatedBanner />` | Full-bleed `.pill-danger`-toned `.cell` at the top of the Report tab. "**Interview auto-ended by the integrity gate.** Reason: <terminatedReason>." with a "Why this happens" Link → `/help/integrity`. |
| 4 | Verdict header | `<VerdictHeader />` | `.cell` head row: candidate `.evidence-card .head` (avatar + name + role) + trailing `.reco` recommendation pill (Advance → `.pill-good` + `.reco`, Hold → `.pill-warn`, Reject → `.pill-danger`). |
| 5 | Score + summary | `<ScoreSummary />` | Inside the verdict `.cell`: left = the **`.ring`** (overall score, 0–100, conic-gradient; `--pct` from `overallScore`); right = the `.summary` `executiveSummary` text + a 3-cell mini `.stats-grid` (Overall / Integrity / Flags). |
| 6 | Competencies | `<Competencies />` | A list of `.competency` cards. Each: `.top` row (name + mono `.sc`), `.bar > i` width = `score%`, `.why` quoted-transcript block (curly-quote markers built in, teal left-border on the inner `.why` per the design language), `.stamp` mono timestamp. **Quoted evidence is THE most important detail of this surface.** |
| 7 | **Integrity Timeline** (interactive scrubber) | `<IntegrityTimeline />` | **The marquee primitive.** Must match the demo 1:1. Structure: `.itl` container → `.itl-head` (h3 with applicant + role + duration meta + Low/Med/High legend) → `.itl-track-wrap > .itl-track` with `.itl-line` dash, severity `.itl-pip.l/.m/.h` positioned by `at` percentage, coral `.itl-scrubber` reflecting the active event → `.itl-axis` mono timestamps → `.itl-events` 3-column grid of `.event` cards (active = `.event.expanded`, severity tone from `.event` / `.event.m` / `.event.h`, each with `.stamp` + `.ttl` + `<p>` + `.clip` evidence excerpt + "**Reason** · …" or "**Clip** · …" action line). Clicking a pip → scrubber jumps + that event becomes `.expanded` + the recording `<video>` (when present) seeks to that timestamp. Keyboard: ← / → step pips. Recording `<video>` sits in a `.cell.tight` below the scrubber (or beside on wide screens). |
| 8 | Decision controls | `<DecisionControls />` | Sticky bottom toolbar. **Advance** `.btn.btn-primary` (calls `overrideGate` when state is held, else `decideApplication({outcome:"shortlisted"})`) · **Shortlist** `.btn.btn-ghost` (`decideApplication({outcome:"shortlisted"})`) · **Decline** `.btn.btn-ghost` with `.pill-danger` tone (`decideApplication({outcome:"rejected"})`). Each is confirmed via the existing `ConfirmDialog`. All audited, all notify the candidate. |

## Layout & components — map to `@ip/ui` and tokens

| Region | Primitive | Tokens |
|---|---|---|
| Shell | `CompanyShell` (existing) | already on the new tokens |
| Back row | `.btn.btn-ghost.btn-sm` | button tokens |
| Tabs | `[role=tablist]` with 2px teal active underline; unread `.pill-coral` | tab tokens |
| Auto-terminated banner | full-width `.cell` with `.pill-danger` background tint | `--danger`, `--danger`-tinted surface |
| Verdict header | `.evidence-card .head` | `--surface`, `--line`, coral / teal gradient avatar |
| `.reco` pill | `.pill-good` (Advance) / `.pill-warn` (Hold) / `.pill-danger` (Reject) | semantic-token only |
| Score ring | `.ring` conic-gradient — `--pct: <overallScore>` | `--teal` fill, `--surface-3` rail |
| Mini KPI strip | `.stats-grid` (3 cols inside the verdict cell) | as design language |
| Competency card | `.competency + .top + .bar + .why + .stamp` | teal `.bar` fill; teal left-border + curly quotes on `.why` |
| **Integrity Timeline container** | **`.itl` (24px radius, 1.6rem padding, `--surface`)** | design language |
| **Track** | **`.itl-track` (80px tall, gradient `--surface-2` → teal-soft hint)** | design language |
| **Pips** | **`.itl-pip.l` (Low → `--good`), `.m` (Medium → `--warn`), `.h` (High → `--danger`)** | severity tones |
| **Scrubber** | **`.itl-scrubber` (2px coral, soft halo, dot handle)** | `--coral`, `--coral-soft` |
| **Events row** | **`.itl-events` (3-col grid); `.event` / `.event.m` / `.event.h`; `.event.expanded`** | per design language |
| **Evidence clip** | **`.event .clip` (gold-tinted dashed border)** | `--gold`, `--gold-soft` |
| Recording video | `.cell.tight` wrapper; native `<video controls>` | surface tokens |
| Decision toolbar | sticky bottom `.cell.tight`; `.btn-primary` + `.btn-ghost` | button tokens |

All primitives live in `@ip/ui/src/app.css`. The Integrity Timeline classes **are the same
class names the landing demo uses** — the primitive is hoisted into `@ip/ui` so both surfaces
share one definition. **Anti-slop ban —** no side-stripe borders elsewhere (only the
`.competency .why` left-border is allowed because it IS the evidence-block convention from the
design language), no glassmorphism on the scrubber, no neon glow effects, no animated
gradients on the track.

## Data wiring / seam

**Identical to today.** Every query, handler, mock seam, and DTO is preserved verbatim.

| Region | Hook | Query key | Source |
|---|---|---|---|
| Report (verdict, summary, highlights, risks, score, recommendation, competencies, integrityScore, integrityFlagCount, autoTerminated) | `useAuthedQuery(token, ["report", appId], () => api.reports.getReport({ applicationId: appId }))` with the existing scoring-window poll predicate (`NOT_FOUND` / transient → poll every 3s; success → stop) | `["report", appId]` | `Report.GetReport` — see [`backend_applicant-report.md`](./backend_applicant-report.md) |
| Integrity Timeline (integrityScore, flags[], recordingUrl, autoTerminated, terminatedReason) | `useAuthedQuery(token, ["integrity", appId], () => getIntegrityTimeline({ applicationId: appId }))` (mockable via `integrity-client.ts` `USE_MOCK`); **non-blocking** — the report renders even when this fails | `["integrity", appId]` | `Report.GetIntegrityTimeline` (NEW v2 RPC) |
| Messages unread badge | `messagesClient.listThreads()` 30s poll (existing) | `messagesListQueryKey()` | `MessagingService` |
| Decision controls | `decideApplication({ applicationId, outcome })` + `overrideGate({ applicationId })` (existing) → invalidate `["report", appId]`, `["applicants", jobId]`, `["ranked", jobId]` | — | `Decision.*` |

**Adapter:** `toReportDTO(...)` (existing pure function) is unchanged. Its tests still pass.

**Anti-fiction guard.** Empty timeline (`flags: []`, `integrityScore: 0`, `autoTerminated:
false`) renders the truthful empty state — "No proctoring flags. Integrity score 100." with a
green `.ring` and a single "Clean" `.pill-good`. **Never fabricate** flags or pip positions.
The recording `<video>` only renders when `recordingUrl !== ""`; otherwise the `.cell.tight`
shows "No recording available for this session" (truthful, not "coming soon"). The verdict
recommendation pill reads `recommendation` verbatim — no "AI is highly confident" inflation.

## Tasks (TDD-style, build → screenshot-verify → commit per task)

> **Task 0 — Build the per-screen mockup.** Create
> `docs/brand/redesign-v3/screens/applicant-report.html` linking
> `@ip/ui/src/{tokens.css,app.css}` and the sprite. Embed the `.app` shell. Body:
> - Back row + tabs.
> - **Auto-terminated banner** as an optional first row (include it in the mockup so the
>   variant is documented).
> - Verdict `.cell` with the candidate head (avatar "C" gradient + name "Candidate A" + role
>   "Sr. Product Designer") + `.reco` Advance pill.
> - Score + summary row with the `.ring` (`--pct:86`) and a 3-cell `.stats-grid` (Overall 86 /
>   Integrity 98 / Flags 2).
> - Two `.competency` cards with `.bar`, `.why` quoted transcript, mono `.stamp`.
> - **Full Integrity Timeline** matching the demo `#integrity` 1:1: `.itl-head` with legend, an
>   `.itl-track` with 8 pips at the same positions as the demo (`6/18/32/44/58/71/83/95%`, mix
>   of `l/m`), an `.itl-scrubber` at 32%, an `.itl-axis` with 5 mono timestamps, and the
>   `.itl-events` row of 3 `.event` cards — the middle one `.event.m.expanded` with a `.clip`
>   evidence excerpt ("**Clip** · 00:09:14 → 00:09:42 · Reviewer to inspect. No auto-action.").
> - Recording `<video>` placeholder (or a "No recording" `.cell.tight` for the variant).
> - Sticky decision toolbar (Advance / Shortlist / Decline).
>
> Use generic sample data — "Candidate A", "Sample interview". Verify in both themes at
> 1440×900 and 390×844 against the design-language demo's integrity section. Commit the new
> HTML file only.

- **Task 1 — Shell + back row + tabs.** Mount the page under `CompanyShell`; render
  `<BackRow />` and `<ReportTabs />`. Wire the Messages unread badge to the existing
  `messagesListQueryKey()` poll. Confirm the topbar crumb resolves to
  `<Company> / Jobs / <Title> / <Candidate>` from `Job.GetJob` + the application's candidate
  name. Commit `apps/company/app/jobs/[id]/applicants/[appId]/page.tsx`,
  `apps/company/components/applicant/{back-row,report-tabs}.tsx`.

- **Task 2 — Verdict header + ScoreRing + summary.** Build `<VerdictHeader />` over the
  `.evidence-card .head` pattern (avatar + name + role + `.reco` pill via `recommendation`).
  Build `<ScoreRing />` over the design language's `.ring` conic-gradient primitive,
  reading `--pct` from `overallScore * 100`. Wire the executive summary on the right. Add the
  3-cell `.stats-grid` (Overall / Integrity / Flags) derived from existing scalars. Commit
  `components/applicant/{verdict-header,score-ring,score-summary}.tsx`.

- **Task 3 — Auto-terminated banner.** Build `<AutoTerminatedBanner />` shown only when
  `autoTerminated === true`. Render at the top of the Report tab as a full-bleed `.cell` with
  `.pill-danger`-tinted background, the `terminatedReason`, and a "Why this happens" Link.
  This banner is informational only — the decision controls remain interactive (the recruiter
  can still Decline / Hold). Commit `components/applicant/auto-terminated-banner.tsx`.

- **Task 4 — Competencies.** Build `<Competencies />` and `<CompetencyCard />` over the
  design language's `.competency` + `.bar > i` + `.why` + `.stamp` primitives. The `.why`
  inner block already carries curly-quote markers (`::before` / `::after`) per the design
  language — pass the evidence `quote` as plain text. The `.stamp` mono line shows the
  timestamp + the optional `note` from the `Evidence` DTO. Verify the curly quotes render and
  the teal left-border is correct in both themes. Commit
  `components/applicant/{competencies,competency-card}.tsx`.

- **Task 5 — Integrity Timeline (the marquee build).** This is the most demanding task.
  Build `<IntegrityTimeline />` as a controlled component over the `["integrity", appId]`
  hook. **Match the demo's `#integrity` section 1:1.** Subcomponents:
  - `<TimelineHead />` — h3 (candidate · role) + `.meta` (duration) + Low/Medium/High legend.
  - `<TimelineTrack />` — `.itl-track` host, position pips by `at` percentage
    (`flag.at / duration * 100`), positions the `.itl-scrubber` on the active flag's `at`,
    renders the `.itl-axis` with 5 mono timestamps (0%, 25%, 50%, 75%, 100%). Each pip is a
    real `<button>` with `aria-label="Severity <l|m|h> · <signalLabel> · <stamp>"`.
  - `<TimelineEvents />` — 3-column grid of `.event` cards. The **active** card is
    `.event.expanded` (the one whose pip is selected); the other two slots are filled by the
    nearest event on either side. Each card: severity dot in `.stamp`, mono timestamp + level,
    `signalLabel(type)` as `.ttl`, the `meta`-derived `<p>` description, and a `.clip` line
    with the evidence excerpt or auto-action reason (e.g., "**Reason** · Below threshold. No
    action." for `low`; "**Clip** · <range> · Reviewer to inspect. No auto-action." for
    `medium`; "**Reason** · HIGH severity. Interview auto-ended at <stamp>." for `high`).
  - `<RecordingPlayer />` — `.cell.tight` housing the `<video controls>` whose `src` is
    `recordingUrl`. The pip-click handler calls `videoRef.currentTime = flag.at / 1000`
    (when present). When `recordingUrl === ""`, render "No recording available for this
    session" (truthful copy).
  - Keyboard: ← / → step through pips, Home / End jump to first / last.
  - Empty: `flags: []` → render `.itl-track` empty + a single "Clean" `.pill-good` row in
    `.itl-events` ("No proctoring flags. Integrity score 100.").
  - Verify against fixtures from `integrity-client.ts` (`USE_MOCK=1`) — mixed Low / Medium /
    High variants AND the `autoTerminated` variant. Commit
    `components/applicant/integrity-timeline/{integrity-timeline,timeline-head,timeline-track,timeline-events,recording-player}.tsx`,
    `components/proctor-labels.ts` (unchanged file — verify it still exports `signalLabel` +
    `severityTone`).

- **Task 6 — Decision controls.** Build `<DecisionControls />` as a sticky bottom `.cell.tight`
  with Advance / Shortlist / Decline. Wire each through the existing `ConfirmDialog` to the
  matching `decideApplication` / `overrideGate` mutation. On success, invalidate the same query
  keys as today. Verify the controls remain enabled when `autoTerminated === true` (the
  recruiter still owns the final call). Commit `components/applicant/decision-controls.tsx`.

- **Task 7 — Schedule + Messages tabs.** Rebuild `<SchedulePanel />` (the existing scheduling
  surface — slots, availability, send-invite) over the new `.cell` + `.input` + `.btn`
  vocabulary. Rebuild `<MessageThreadView />` over the same. Their clients, queries, and
  handlers are unchanged. Commit `components/applicant/schedule-panel.tsx`,
  `components/applicant/message-thread-view.tsx`.

- **Task 8 — Page assembly + fidelity verify.**
  1. `--filter @ip/company build` + `tsc --noEmit` green.
  2. Boot dev with `NEXT_PUBLIC_MOCK=1`, navigate to a sample application, screenshot every
     tab in both themes at 1440×900 and 390×844. Click each pip and confirm the scrubber
     jumps, the active event swaps, and the recording (where present) seeks. Side-by-side
     against the Task-0 HTML and the design-language demo's `#integrity` section.
  3. Confirm the existing report poll predicate still polls every 3s on `NOT_FOUND` and stops
     on success.
  4. Confirm the integrity DTO grep-test still passes — no raw frames, no voiceprint, no
     identity-match field anywhere in the FE bundle.
  5. Confirm a non-manager loading the page is still redirected by `CompanyShell`.

## States & a11y

- **Report tab.**
  - **Loading** — `LoadingState` (skeleton verdict + skeleton ring + 2 skeleton competencies).
  - **Generating** (`NOT_FOUND` from `getReport`) — auto-updating inline `.pill.pill-warn` row
    "Report is being generated — refreshing in 3s" + the same poll predicate.
  - **Error** — non-404 → `ErrorState` + retry; the rest of the tab stays mounted.
  - **Success** — verdict + score + competencies + Integrity Timeline + decision controls.
  - **Auto-terminated** — the `<AutoTerminatedBanner />` shows above the verdict; the integrity
    `.ring` reads `0` and the `.pill-danger` recommendation pill follows from `recommendation`.
- **Integrity Timeline.**
  - **Loading** — inline spinner inside the `.itl` container; the rest of the report stays
    rendered.
  - **Error** — inline `.pill-warn` "Integrity data unavailable" inside the `.itl`; the rest of
    the report renders normally (non-blocking).
  - **Empty** — green `.ring`, "Clean" `.pill-good`, "No proctoring flags." Truthful copy only.
  - **Populated** — track + pips + scrubber + 3 event cards; recording (when present).
  - **Auto-terminated** — the `HIGH` pip carrying `terminatedReason` is rendered with
    `.itl-pip.h` enlarged, the scrubber pinned to it, the event card `.event.h.expanded` with
    the danger `.stamp` dot and the "Interview auto-ended at <stamp>" `.clip` line.
- **Legacy report (pre-extend).** `competencies: []` + `integrityScore: 0` → competencies block
  hidden, Integrity Timeline shows the empty state. Zero errors.
- **Responsive.** Sidebar collapses ≤1000px. Verdict + score stack vertically ≤900px. Mini
  `.stats-grid` 3 → 2 → 1 columns. Competency `.bar` width is fluid. Integrity Timeline:
  `.itl-events` is 3-col ≥900px, 1-col ≤900px (matches the design language). Recording video
  moves below the scrubber on narrow widths. Decision controls stack the buttons under each
  other ≤520px while staying sticky.
- **Dark + light.** All color via tokens. The integrity `.ring` uses semantic severity colors
  (`--good` / `--warn` / `--danger`) per the integrity score thresholds. Per-user Appearance
  accent recolors `--teal` (active tab underline, `.competency .bar` fill, primary CTA).
- **A11y.**
  - `.ring` is a `role="img"` with `aria-label="Overall score <n> of 100"`.
  - Each `.itl-pip` is a real `<button>` with `aria-label="Severity <Low|Medium|High> · <signal label> · <timestamp>"`.
  - The `.itl-track` is `role="group" aria-label="Interview integrity timeline"`.
  - `<time dateTime>` on every timestamp; `<video aria-label="Interview recording">` when
    present.
  - Severity is conveyed as text in each pill (not color-only). The `HIGH` legend dot is
    accompanied by the words "auto-end".
  - Tab focus order is logical: tabs → banner → verdict → score → summary → competencies →
    timeline → recording → decision controls.
  - Touch targets ≥44×44 (pips render at 12–14px visually but each `<button>` has 24×24
    invisible hit area extension).
  - Contrast ≥4.5:1. Focus rings via `:focus-visible` — `--teal` 2px / 4px halo.
  - Reduced-motion: the scrubber animation between pips disables under
    `prefers-reduced-motion`; the pip selection still works.

## Acceptance

- Looks 1:1 like the per-screen Task 0 HTML AND the relevant slices of
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html) — including
  the **Integrity Timeline 1:1 with the demo's `#integrity` section** (same `.itl` shape, same
  `.itl-track` gradient, same severity pip colors / sizes, same coral scrubber, same 3-card
  event row with the `.expanded` evidence treatment). Side-by-side screenshot proof committed
  under `docs/brand/redesign-v3/verify/applicant-report-{light,dark}.jpeg`.
- `--filter @ip/company build` green; `tsc --noEmit` green; no console errors / warnings.
- **Zero functional diff.** Same `Report.GetReport` query + poll predicate, same
  `Report.GetIntegrityTimeline` non-blocking fetch + `USE_MOCK` mock seam, same
  `messagesListQueryKey()` 30s poll, same `decideApplication` / `overrideGate` handlers + their
  invalidations. The DTOs (`ReportDTO`, `IntegrityTimeline`, `ProctorFlag`, `Competency`,
  `Evidence`) are byte-for-byte unchanged.
- The integrity DTO grep-test still passes: **no** raw frames / audio bytes / voiceprint /
  identity-match field anywhere in the FE bundle.
- Empty + auto-terminated + legacy variants are truthful — never fabricated.
- A non-manager loading the page is still redirected by `CompanyShell`.
