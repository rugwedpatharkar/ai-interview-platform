# System Status — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## Goal

Public, crawlable, SSR **system status** page. NOT a legal document — a product surface that
shows the current operational health of Aptura and a (currently empty) incident history.
Pre-launch this page is **static**: a single "All systems operational" banner over the truthful
services list, with no incidents and no fabricated uptime numbers. Post-launch it integrates with
an external monitoring provider (Statuspage.io / Better Uptime / Pingdom / equivalent) via the
TBD `StatusService` documented in [`backend_status-page.md`](./backend_status-page.md).

> **Anti-fiction note (read before writing copy or visuals):** **No fake "99.99% uptime"
> statistics.** **No fake incident history** ("Resolved · 12 min · 2026-03-04 — Marketplace
> latency"). **No fake "Last incident: 47 days ago" badges.** Pre-launch reads
> "Pre-launch — monitoring activates with the product." Only the truthful product-architecture
> claims allowed by the anti-fiction rule in [`_design-language.md`](../_design-language.md).

## Route + role

`/status` — new top-level route in `frontend/apps/candidate/app/(marketing)/status/page.tsx` ·
**public** (token-free, crawlable, SSR). No `.app` shell; uses the marketing chrome (top utility
rule + sticky `MegaNav` + `MegaFooter`).

## Approved mockup (build to this exactly)

- **No per-screen mockup exists yet.** The composition is described below and uses primitives
  already in [`_design-language.md`](../_design-language.md): `.cell`, `.cell.anchor`, `.status`,
  `.pill-good / .pill-warn / .pill-danger`, `.badge`, and the bento grid for the services list.
- The marketing chrome (top rule + nav + footer) comes from
  [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
- Side-by-side screenshot proof against the design-language reference (light + dark) is part of
  acceptance — see "Acceptance" below.

## Existing code being REPLACED (NEW; no existing code)

There is **no existing `/status` route** in `frontend/apps/candidate/app/`. This is a net-new
public surface. No port, no migration — pure greenfield. Once shipped, the footer link in
`MegaFooter` (if/when added — not in the current demo footer) points at `/status`.

## Layout & components

Top-to-bottom composition (all primitives from `@ip/ui` per the design language):

| # | Region | Component | Notes |
|---|---|---|---|
| 0 | Top utility rule | `<UtilityRule />` | Marketing chrome. |
| 1 | Sticky mega-nav | `<MegaNav />` | Marketing chrome. |
| 2 | Page header | `<StatusHeader />` | NEW. h1 `class="display"` at `--step-4` = "System status". One-line lead (`--step-1`). Meta row: "Pre-launch — monitoring activates with the product." in mono (`--ink-3`). |
| 3 | Current-status banner | `<StatusBanner />` | NEW. Wide `.cell.anchor` (gradient-tinted by status — teal-soft for operational, warn for degraded, danger for outage). Inside: large `.status` pill with leading dot at the top-left (`Operational · Degraded · Outage`), the headline state ("All systems operational" / "Partial outage" / etc.) at `--step-3`, and a meta row "Last checked: <ISO timestamp>" in mono with a small icon. **Pre-launch:** status pill = `Operational` (teal-soft), headline = "All systems operational", `Last checked: <SSR build timestamp>` with the trailing note "Live monitoring activates with the product." |
| 4 | Services grid | `<ServicesGrid />` | NEW. Bento grid (`grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))`). One `.cell` per service. Each cell: service name (h3 `class="display"` at `--step-2`), one-line description (`--ink-2` body), and a `.status` pill (Operational / Degraded / Outage) on the right of the cell header. **Services (fixed, 6):** `Marketplace` · `Auth` · `Interviews` · `Reports` · `Notifications` · `Integrations`. Pre-launch: all six pills read `Operational` (teal-soft). |
| 5 | Recent incidents timeline | `<IncidentsTimeline />` | NEW. Section heading h2 `class="display"` at `--step-3` ("Recent incidents · last 30 days"). **Empty by default:** an empty-state `.cell` with the check icon + headline "No incidents in the last 30 days" + sub "Pre-launch — monitoring activates with the product." When real incidents exist post-launch, render a vertical list of `<IncidentCard />`s grouped by date (Today / Yesterday / earlier). |
| 6 | Subscribe to updates | `<StatusSubscribeCell />` | NEW. A single teal-soft `.cell` with copy "Get incident updates by email" and a `mailto:` "Subscribe" link. Pre-launch only — replaced by a real subscription form once `StatusService.Subscribe` (TBD) ships. |
| 7 | Mega-footer | `<MegaFooter />` | Reused. If/when `Status` is added to the footer columns, mark it `aria-current="page"`. |

### Status pill mapping

| `StatusState` | Pill class | Tint | Headline color |
|---|---|---|---|
| `OPERATIONAL` | `.pill-good` (alias of `.status.live` with `--good` dot) | `--teal-soft` background on the banner cell | `--ink-deep` |
| `DEGRADED` | `.pill-warn` | `--gold-soft` background on the banner cell | `--ink-deep` |
| `OUTAGE` | `.pill-danger` | `--coral-soft` background on the banner cell | `--ink-deep` |
| `MAINTENANCE` | `.pill` (neutral) with mono "Maintenance" label | `--surface-2` background on the banner cell | `--ink-deep` |

Pulsing leading dot uses `.status.live` and is paused under `prefers-reduced-motion` (per the
design language motion rules).

### Tokens / primitives used

- Section rhythm: `padding: clamp(4rem, 7vh, 6rem) 0`.
- Container: `.wrap`.
- Surfaces: `.cell` (services + incidents) · `.cell.anchor` (banner).
- Type: `class="display"` headings; body `Hanken Grotesk`; mono for timestamps and the
  `Last checked` meta.
- Motion: `.status.live` pulse on the banner pill; respects `prefers-reduced-motion`.

## Data wiring / seam

- **Pre-launch (today):** Pure static — no fetch. The banner shows `OPERATIONAL`, the services
  grid shows all six services as `OPERATIONAL`, the incidents list is empty. `Last checked` is
  the SSR build timestamp with a trailing "Live monitoring activates with the product." note so
  the user understands the timestamp is the deploy time, not a live check.
- **Static-content shape** (FE constants in `apps/candidate/app/(marketing)/status/content.ts`):
  ```ts
  type ServiceId =
    | "marketplace" | "auth" | "interviews"
    | "reports" | "notifications" | "integrations";

  type StatusState = "OPERATIONAL" | "DEGRADED" | "OUTAGE" | "MAINTENANCE";

  type ServiceCard = { id: ServiceId; name: string; description: string };

  const SERVICES: ServiceCard[] = [/* the 6 services */];
  const PRELAUNCH_STATE: StatusState = "OPERATIONAL";
  ```
- **Post-launch seam (TBD — see backend doc):** The page swaps to a typed client call
  `statusClient.getStatus()` → `{ overall: StatusState; services: { id; state }[]; lastChecked: ISO }`
  and `statusClient.listIncidents({ since: ISO })` →
  `{ incidents: { id; severity; state; title; startedAt; updates: [...] }[] }`. **The static
  fallback above must still render correctly** if the client errors or returns nothing — the
  page never goes blank.
- **Mock seam.** Build under `NEXT_PUBLIC_MOCK=1` against a typed fake that returns the
  pre-launch state. The 1-line client swap to the real `statusClient` happens when the backend
  is wired.
- Backend: TBD — see [`backend_status-page.md`](./backend_status-page.md).

## Tasks (TDD-style; build → screenshot-verify → commit per task)

> **Task 0 — No bespoke mockup.** The page inherits its mockup from
> [`_design-language.md`](../_design-language.md) and the marketing chrome of
> [`D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html).
> Do NOT modify the demo file.

- **Task 1 — Route + marketing chrome + static content.** Create
  `app/(marketing)/status/page.tsx` and `app/(marketing)/status/content.ts`. Mount
  `<UtilityRule />`, `<MegaNav />`, `<MegaFooter />` from `@ip/ui`. Define `ServiceId`,
  `StatusState`, `SERVICES[6]`, `PRELAUNCH_STATE`. Confirm `/status` is reachable signed-out,
  SSR-renders, and crawls (200). Commit.
- **Task 2 — `<StatusHeader />` + `<StatusBanner />`.** Render the page header and the wide
  banner anchor cell. Status pill uses `.pill-good` with the pulsing `.status.live` leading dot;
  pulse is paused under `prefers-reduced-motion`. Last-checked meta uses Geist Mono. Verify the
  banner gradient resolves correctly in both themes. Commit.
- **Task 3 — `<ServicesGrid />`.** Bento grid of 6 service `.cell`s; each cell has the name, the
  one-line description, and a `.status` pill on the right of the cell header. Pre-launch: all
  six pills read `Operational`. Verify the grid collapses cleanly: 3 cols → 2 cols → 1 col.
  Commit.
- **Task 4 — `<IncidentsTimeline />` empty state.** Section heading "Recent incidents · last 30
  days" + an empty-state `.cell` with the check icon, headline "No incidents in the last 30
  days", sub "Pre-launch — monitoring activates with the product." No fake incident cards.
  Wire the shape of `<IncidentCard />` (typed but unused) so the post-launch swap is a 1-line
  change. Commit.
- **Task 5 — `<StatusSubscribeCell />` (mailto pre-launch).** A teal-soft `.cell` with a
  `mailto:` "Subscribe" link. The cell is hidden by feature flag once a real `Subscribe` flow
  exists. Commit.
- **Task 6 — Typed client seam + `NEXT_PUBLIC_MOCK=1` fake.** Add
  `apps/candidate/lib/status-client.ts` with the proposed surface
  (`getStatus()`, `listIncidents({ since })`) and a typed fake under
  `apps/candidate/lib/status-client.mock.ts` that returns the pre-launch state. The page reads
  through the client even pre-launch so the real swap is a 1-line config change. Verify behavior
  is unchanged in both modes. Commit.
- **Task 7 — Polish, a11y, and Responsive verification.**
  1. `--filter @ip/candidate build` is green; `--filter @ip/candidate exec tsc --noEmit` is green.
  2. Run the dev server, navigate to `/status` signed-out, screenshot in both themes at
     1440×900 and 390×844.
  3. Side-by-side fidelity check against the design-language reference and the
     marketing-chrome screenshots from
     `docs/brand/redesign-v3/directions/screenshots/D-aperture-pro-{light,dark}-full.jpeg`.
  4. **Responsive verification** (from `_design-language.md` — verbatim 8 steps):
     1. **Screenshot at all 7 reference sizes:** 375 × 667 · 430 × 932 · 768 × 1024 portrait ·
        820 × 1180 portrait · 1024 × 1366 portrait · 1366 × 1024 landscape · 1440 × 900 ·
        1920 × 1080.
     2. **No horizontal scroll** at any width ≥ 320 px (test with
        `document.documentElement.scrollWidth`).
     3. **Every interactive element ≥ 44 × 44 px** when measured at the smallest breakpoint.
     4. **Keyboard does not cover form inputs** on iOS Safari (manual test or
        `visualViewport.height` check). (N/A pre-launch — no inputs — note as N/A in proof.)
     5. **Orientation change** (portrait ↔ landscape) on iPad sizes — layout adapts gracefully,
        no clipped content.
     6. **`prefers-reduced-motion`** — every animation no-ops (the pulsing banner dot stops).
     7. **Cross-browser:** iOS Safari, Chrome Android, Samsung Internet, desktop Safari / Chrome
        / Firefox / Edge — at minimum Safari + Chrome on every OS.
     8. **Save side-by-side proof** to
        `docs/brand/redesign-v3/verify/status-page-{mobile,tablet,desktop}.jpeg`.

## States & a11y

- **States.**
  - **Pre-launch (today):** `OPERATIONAL` everywhere, empty incidents list, `mailto:` subscribe.
  - **Post-launch:**
    - Loading → render the SSR static fallback (no skeleton flash).
    - Error → render the SSR static fallback + a small non-blocking inline note "Live status
      unavailable — showing last known." (NOT a fabricated "All operational" — this is the
      anti-fiction guardrail.)
    - Degraded / Outage / Maintenance → banner tint + pill switch per the mapping table above.
    - Active incidents → `<IncidentCard />` list grouped by day.
- **Responsive.** Services grid: 3 → 2 → 1 cols via `repeat(auto-fit, minmax(280px, 1fr))`.
  Banner stacks the pill above the headline at `≤ 540 px`. Incidents timeline single-column at
  every breakpoint. Subscribe cell full-width on mobile.
- **Dark + light.** All colors via tokens. Banner gradient resolves from `--teal-glow` /
  `--gold-soft` / `--coral-soft` per state.
- **A11y.**
  - One `<h1>` (the page title).
  - `<header><nav><main><section><footer>` landmarks.
  - The banner uses `role="status"` and `aria-live="polite"` so screen-readers announce state
    transitions post-launch. Pre-launch the `role="status"` is fine — the content does not
    update.
  - Each service `.status` pill has an `aria-label` like `"Marketplace — Operational"`.
  - The pulsing dot is decorative (`aria-hidden="true"`); the state is read from the pill text.
  - Touch targets ≥ 44 × 44 px. Contrast ≥ 4.5 : 1 everywhere. Focus rings use `--teal` 2 px /
    4 px halo. Honors `prefers-reduced-motion`.

## Acceptance

- Looks 1:1 like the design language applied to a status surface — banner + services grid +
  incidents timeline. Side-by-side proof committed under
  `docs/brand/redesign-v3/verify/status-page-{mobile,tablet,desktop}.jpeg` (per Task 7.4.8).
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors / warnings;
  reduced-motion is honored.
- Pre-launch state is truthful: `Operational` everywhere, **no fabricated uptime numbers, no
  fabricated incident history, no fabricated "47 days since last incident" badge.** The
  `Last checked` timestamp clearly reads as the deploy time with the explanatory note
  "Live monitoring activates with the product."
- Post-launch swap is a 1-line client config change — the page reads through
  `apps/candidate/lib/status-client.ts` pre- and post-launch.
- All 6 services are listed; their pills read `Operational` pre-launch.
- Public, token-free, crawlable; SSR-rendered.
