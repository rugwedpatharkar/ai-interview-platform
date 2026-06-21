# Interview lobby — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## 🔒 Strict-proctored invariants (non-negotiable)

> **Camera + mic required. No mute. No camera-off. Fullscreen-locked. On-device detectors only.
> Server-authoritative auto-end.**
>
> The lobby is the **gate** that enforces these rules **before** the candidate enters the live
> room. The lobby's "Start interview" button is the only way into `/interview/[applicationId]`,
> and it stays **disabled** until every invariant is provably in place: camera+mic stream is
> live, ID match (selfie liveness) passes, environment scan tiles are green, and the
> "I understand" checkbox is explicitly ticked. The lobby never offers a control that would
> weaken these rules — no mute toggle, no camera-off button, no "raise hand", no "join with
> camera off". If a reviewer asks for one, refuse and link this block.
>
> The strict-proctored invariants are part of the **Aperture Pro design language** itself (see
> `_design-language.md` §"Mandatory revamp rule" item 5). The lobby is where the candidate is
> told the rules clearly, and where the rules are physically gated. The live room
> (`/interview/[applicationId]`) inherits these checks and adds the fullscreen-lock + on-device
> detectors + server-authoritative auto-end at runtime — see
> [`../proctored-interview/frontend_proctored-interview.md`](../proctored-interview/frontend_proctored-interview.md).

## Goal

Replace the existing precheck-card-inside-the-room flow with a **dedicated lobby route** that
runs every gate (device check, ID match, environment scan, explicit ack) **before** the room
mounts. The lobby is a focused fullscreen room shell (NOT the `.app` candidate shell) so the
candidate's attention is on the gates. On a clean pass, the lobby calls
`api.interview.rtcToken({ applicationId })` and routes to `/interview/[applicationId]` — the
live room then mounts with a token already in hand. Backend behavior (RTC token mint, on-device
detectors at room runtime, server-authoritative auto-gate) is identical to today.

## Route + role

`/interview/[applicationId]/lobby` · **candidate** (`useRequireAuth` +
`useRequireRole(["candidate"])`).

This route does **not** mount the `.app` sidebar shell. It is a focused fullscreen room shell
(same shell-free pattern the live room uses) — the only chrome is a thin top utility line (lock
indicator + applicantId/title). On clean pass, the lobby `router.push("/interview/[id]")`s into
the live room.

## Approved mockup (build to this exactly)

- **Design language (canonical):** [`../_design-language.md`](../_design-language.md) — the
  device-precheck `.cell` shape, the warn-tone leading icon for the strict-proctored block,
  the `.btn.btn-primary` + `.btn.btn-ghost` treatment, the `.pill-good` "Camera + mic live"
  status, the `.hud-strip` chip vocabulary (reused here as the environment-scan tile grid).
- **Reference demo:** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html)
  — pull tokens, type scale, button treatment.
- **Sibling reference (the live room this lobby gates into):**
  [`../proctored-interview/frontend_proctored-interview.md`](../proctored-interview/frontend_proctored-interview.md)
  — that plan's precheck `.cell` is the **structural template** for this lobby. The lobby
  **lifts** the precheck card OUT of the room and adds: ID-verify mini-flow, environment scan
  tile grid, and the strict-proctored warning block verbatim. The live room (post-lobby
  rebuild) will no longer mount a precheck card itself — it expects the lobby gate to have
  passed (see the contract note in `backend_interview-lobby.md`).
- **Sibling reference (post-interview):**
  [`../interview-completed/frontend_interview-completed.md`](../interview-completed/frontend_interview-completed.md)
  — same shell-free room shell; same teal/danger leading-icon `.cell` pattern.

No per-screen mockup file yet. Build to the design language + the proctored-interview sibling
and verify side-by-side that the lobby reads as a clean prelude to the live room.

## Existing code being REPLACED (not modified)

**This is a NEW screen — there is no existing code per screen.** Today, the
`/interview/[applicationId]` page mounts a precheck `.cell` as its first phase. This plan moves
the precheck OUT to a dedicated lobby route so the gates can be richer (ID match + environment
scan) and so the live room mounts with the assumption that gates have passed.

Files that will be **created** by this plan (no replacements):

- `frontend/apps/candidate/app/interview/[applicationId]/lobby/page.tsx` — new lobby route;
  mounts `<InterviewLobby />`.
- `frontend/apps/candidate/components/interview-lobby.tsx` — new lobby component.
- `frontend/apps/candidate/components/interview-lobby/id-verify-flow.tsx` — selfie liveness
  mini-flow (camera capture + on-device liveness check; emits a typed event to the existing
  proctor sink; never leaves the device).
- `frontend/apps/candidate/components/interview-lobby/environment-scan-grid.tsx` — the 4-tile
  scan grid (Lighting · Background noise · Headphones · Network).

Files **NOT modified** (per the user brief — "DO NOT modify the existing proctored-interview
plan files"):

- `frontend/apps/candidate/app/interview/[applicationId]/page.tsx` — the live room route. The
  live room continues to mount its own precheck `.cell` as documented in
  [`../proctored-interview/frontend_proctored-interview.md`](../proctored-interview/frontend_proctored-interview.md)
  — that plan is the source of truth and stays in force. The lobby is an **additive** gate;
  a candidate who lands directly on `/interview/[applicationId]` (bookmark, deep link) still
  sees the live room's existing precheck phase.
- The dashboard's "Start interview" action button (per
  [`../candidate-dashboard/frontend_candidate-dashboard.md`](../candidate-dashboard/frontend_candidate-dashboard.md))
  — its href becomes `/interview/[applicationId]/lobby` (one-line route change, listed for
  completeness — not a UI rebuild).
- The application-detail timeline's "Start interview" action (per
  [`../application-detail/frontend_application-detail.md`](../application-detail/frontend_application-detail.md))
  — same one-line route change.

Files **frozen — do not modify** (data seam / detector seams are reused as-is):

- `frontend/apps/candidate/app/interview/[applicationId]/types.ts` — `RtcToken` / `ProctorAck`
  / `HIGH_SEVERITY` / `severityOf`.
- `frontend/apps/candidate/app/interview/[applicationId]/rtc-room.ts` — `connectRoom` /
  `makeFakeRoom`.
- `frontend/apps/candidate/app/interview/[applicationId]/proctor-vision.ts` — on-device
  vision detector (used at room runtime; the lobby uses a small on-device liveness check that
  follows the same never-leaves-the-device invariant).
- `frontend/apps/candidate/app/interview/[applicationId]/proctor-audio.ts` — on-device audio
  detector.

## Layout & components

**Shell:** **shell-free.** The lobby is a focused fullscreen room — a single `<main
role="main">` filling the viewport (no `.app` sidebar, no topbar). A thin top strip carries
the brand mark, the application title (`{jobTitle ?? "Job {jobId}"} at {companyName ?? "Employer"}`),
and a `<small>` lock indicator ("Strictly proctored · recorded").

| Region | Aperture-Pro primitive | Behavior |
|---|---|---|
| Top strip | `.room-topbar` (thin, full-bleed, `--surface-2` background, `--line` border-bottom) | Brand mark (aperture sprite) on the left; title in the center; lock indicator on the right. Goes `--gold-soft` if any gate later detects an integrity flag during ID verify. |
| Lobby card | `.cell` (single centered card; `max-width: min(56rem, 100% - 2.5rem)`) | The lobby body, divided into 5 stacked regions: (1) strict-proctored warning block, (2) device check, (3) ID match, (4) environment scan, (5) explicit ack + Start. Each region has a leading mono numeral (`01 · 02 · 03 · 04 · 05`) and the region title in Schibsted 600 (`--step-1`). |
| Region 1 — strict-proctored warning | warn-tone block inside the card; leading lucide `shield-check` icon in `--gold` | Renders the strict-proctored invariants block **verbatim** (in body voice, not pill voice): *"Camera + mic required. No mute. No camera-off. Fullscreen-locked. On-device detectors only. Server-authoritative auto-end."* Followed by a single body paragraph: "Once you start, you can't pause, mute, or turn off your camera. Serious integrity signals (a second person on camera, screen-share, virtual camera, synthetic audio) end the interview automatically and notify the recruiter." |
| Region 2 — device check | inline self-view `<video>` (`--surface-2`, 12 px radius) + a `<button class="btn btn-primary">` "Enable camera + microphone" → on success, a `.pill-good` "Camera + mic live" replaces the button | Calls `navigator.mediaDevices.getUserMedia({ video: true, audio: true })`. The fake-stream path under `NEXT_PUBLIC_MOCK` follows the same shape the existing `device-precheck.tsx` uses today. On error (permission denied, no device) → renders an inline `<Alert tone="danger">` with troubleshooting copy + a "Try again" `.btn.btn-ghost`. |
| Region 3 — ID match | small `<IdVerifyFlow>` component | Two-step mini-flow: (a) "Take a selfie" — a single canvas snapshot of the candidate's face from the live video stream; (b) on-device liveness check (eye blink prompt; the existing `proctor-vision.ts` liveness primitive is reused). Both steps run **entirely on-device**; the result is a single boolean (`live: true` / `live: false`) emitted to the existing proctor sink as a typed `ProctorEvent { type: "id_check_passed" \| "id_check_failed", at, metaJson: { confidence: "0.92" } }`. NO frame / ImageData / Blob / base64 ever leaves the device — the snapshot is held in memory inside the component and discarded after the check. On pass, a `.pill-good` "ID verified" replaces the flow. On fail, a `<Alert tone="warn">` + a "Try again" button. |
| Region 4 — environment scan | `.env-scan-grid` (2×2 tile grid; `<EnvironmentScanGrid>`) | 4 tiles, each a small `.hud-chip`-style cell with an icon + label + status: **Lighting** (`good`/`warn` per a tiny on-device luminance check), **Background noise** (`good`/`warn` per a tiny on-device RMS check using `proctor-audio.ts`), **Headphones** (`good` if `selectedAudioOutput.kind === "headphones"` per `enumerateDevices()` heuristic — `warn` otherwise with a "Recommended" note), **Network** (`good`/`warn` per a tiny `navigator.connection` check + a one-shot RTT ping). All tiles are advisory — only `warn` causes a yellow border, never a `danger`; nothing here blocks Start. The proctor sink receives one typed `ProctorEvent { type: "env_check_complete", at, metaJson: { lighting: "good", noise: "warn", headphones: "good", network: "good" } }` (scalar meta only). |
| Region 5 — explicit ack + Start | a real `<label>` + `<input type="checkbox">` followed by a `<button class="btn btn-primary">` "Start interview" | The label reads: *"I understand the rules above. I agree that camera + mic will stay on for the whole interview, that the session will be fullscreen-locked and recorded, and that serious integrity signals will end the session automatically."* The Start button is **disabled** until ALL of: (a) device check returned a live stream (`mediaStream !== null`), (b) ID match returned `live === true`, (c) the checkbox is ticked. On click: (1) call `api.interview.rtcToken({ applicationId })`; (2) on success, `router.push("/interview/[applicationId]")` — the lobby's gates have run, so the live room's existing precheck phase will see camera+mic already enabled and the ack already passed (the live room's existing logic is unchanged; it just renders briefly before the connect). On RPC `UNAVAILABLE` → inline `<Alert tone="warn">` ("Live interview not available right now. Please try again shortly.") + a "Try again" `.btn.btn-ghost`. No dead-end. |

> **Primitives reference (do NOT redefine):** `.cell · .pill · .pill-{good,warn,danger,coral} · .hud-chip · .hud-chip.{good,warn,danger} · .badge · .btn · .btn-{primary,ghost,sm}` — all defined in `@ip/ui/src/app.css` per the [design language](../_design-language.md). The `.hud-strip` chip vocabulary is reused inside `.env-scan-grid`.

**No mute. No camera-off. No "join with camera off". No settings cog.** The lobby's only
buttons are: "Enable camera + microphone" (region 2), "Take a selfie" / "Try again" (region 3),
the implicit on-device buttons of the environment scan, the consent checkbox (region 5), and
the Start button (region 5). Anything else is a hard violation of the strict-proctored
invariants block at the top of this plan.

## Data wiring / seam (preserved verbatim)

- **No fetch on mount.** The lobby renders entirely from the application data already in the
  dashboard's `["applications"]` cache (the title comes from a client-side filter on
  `applicationId`). The page does NOT call `listMyApplications` again; if the cache is cold
  (deep link), the lobby renders with a generic title ("Loading…" → falls back to
  `Job {jobId}` when the cache hydrates).
- **`rtcToken` is called ONLY when ALL gates pass + the checkbox is ticked + Start is clicked**
  — the lobby gate is the only path to issuing a token. This is the critical contract: the
  lobby is responsible for not minting a token a candidate isn't ready to use.
- **Proctor sink:** the lobby reuses the **existing** `recordProctorEvents` sink and emits two
  typed events during gating:
  - `id_check_passed` / `id_check_failed` (region 3) — `metaJson: { confidence: "<0..1>" }`.
  - `env_check_complete` (region 4) — `metaJson: { lighting, noise, headphones, network }`,
    each a `"good"|"warn"` string. **Scalar meta only — no media bytes.**
  These events go through the same sink the live room uses, so they appear on the recruiter's
  integrity timeline as low-severity lobby checks.
- **Detectors (frozen):** the ID liveness check reuses `proctor-vision.ts` (blink detector
  primitive); the noise check reuses `proctor-audio.ts` (RMS check primitive). Both run
  **in-module** and emit ONLY the typed event — same never-leaves-the-device invariant the
  live room enforces.
- **HIGH_SEVERITY list:** unchanged — the lobby never assigns severity; the server stamps it.
  The lobby's emitted events are low-severity by category and don't drive auto-termination
  (which only happens in the live room).

See [`backend_interview-lobby.md`](./backend_interview-lobby.md) for the full RPC contract; it
is unchanged from today.

## Tasks (build → screenshot-verify → commit per task)

> **Task 0 — Design language is the mockup.** No per-screen HTML mockup. Build to the design
> language + the proctored-interview sibling. The lobby is the precheck `.cell` from that plan,
> lifted to a dedicated route and extended with regions 3 + 4 + 5.

- **Task 1 — Route + shell + warning region.** Create
  `apps/candidate/app/interview/[applicationId]/lobby/page.tsx` and
  `apps/candidate/components/interview-lobby.tsx`. Render the shell-free `<main>`, the top
  strip (brand + title + lock indicator), and the lobby `.cell` with **region 1** (the
  strict-proctored warning block — body voice, `--gold` leading icon). Verify the title
  resolves correctly from the dashboard cache; verify the page renders without `.app` shell;
  verify the lock indicator goes warn-tone on a forced ID-check-failed event. Commit explicit
  paths.

- **Task 2 — Region 2 (device check) + lift from existing precheck.** Build the inline
  self-view + the "Enable camera + microphone" button. Reuse the same `getUserMedia` /
  mock-stream shape the existing `device-precheck.tsx` uses today (don't reimplement —
  refactor the helper out so both surfaces share it). On success, replace the button with
  `.pill-good` "Camera + mic live". Verify both themes; verify permission denied surfaces
  the inline alert + retry. Commit.

- **Task 3 — Region 3 (ID match — selfie + liveness).** Build
  `<IdVerifyFlow>` in `apps/candidate/components/interview-lobby/id-verify-flow.tsx`. Wire the
  two-step flow: take selfie → on-device blink-prompt liveness check using the existing
  `proctor-vision.ts` primitive. On pass, render `.pill-good` "ID verified"; on fail, render
  `<Alert tone="warn">` + retry. Emit the typed `ProctorEvent { type: "id_check_passed" |
  "id_check_failed" }` through the existing sink. **Critical:** verify that the in-memory
  selfie ImageData is dropped immediately after the check (no module-level retention, no DOM
  attachment beyond the live `<video>`). Commit.

- **Task 4 — Region 4 (environment scan grid).** Build `<EnvironmentScanGrid>` in
  `apps/candidate/components/interview-lobby/environment-scan-grid.tsx`. Render the 2×2 tile
  grid. Wire the four on-device checks (luminance via a one-shot canvas sample, RMS via the
  audio detector primitive, headphones via `enumerateDevices()` heuristic, network via
  `navigator.connection` + a one-shot RTT ping). Emit the typed `ProctorEvent { type:
  "env_check_complete" }` once all four tiles have a result. Verify all four tiles render
  good/warn correctly under forced conditions; verify nothing here blocks Start. Commit.

- **Task 5 — Region 5 (ack + Start) + RTC token issue.** Build the ack `<label>` +
  `<input type="checkbox">` and the Start `<button>`. The Start button's `disabled` attribute
  is computed as `!(mediaStreamLive && idVerified && checkboxTicked)`. On click, call
  `api.interview.rtcToken({ applicationId })`; on success, `router.push("/interview/[applicationId]")`.
  On `UNAVAILABLE`, render an inline `<Alert tone="warn">` + retry. Verify the Start button
  is reactively disabled/enabled across the three preconditions; verify the rtcToken call
  fires only on click (not on mount, not on gate completion); verify the live room receives
  the token and connects. Commit.

- **Task 6 — Strict-invariant audit + Fidelity verify + Responsive verification.**
  1. `--filter @ip/candidate build` is green; `--filter @ip/candidate exec tsc --noEmit` is
     green.
  2. Run the dev server, navigate `/interview/{appId}/lobby` signed-in, walk through all 5
     regions, click Start, verify the live room mounts with a valid token.
  3. **Strict-invariant audit** — grep the new components for `mute`, `cameraOff`, `videoOff`,
     `audio.enabled = false`, `track.disable`, `join with camera off`. **Zero hits.** The
     lobby has exactly these interactive elements: "Enable camera + microphone" button,
     "Take a selfie" / "Try again" buttons (region 3), the ack checkbox, and the Start button.
  4. **Frame-bytes-never-leave audit** — grep the new components for `toDataURL`, `toBlob`,
     `FormData.*append.*image`, `fetch.*body.*Blob`. Zero hits in any path that posts to the
     network. The only network call from this screen is the typed `recordProctorEvents` sink
     (scalar meta) and the `rtcToken` mint.
  5. Side-by-side fidelity check vs. the proctored-interview sibling — the lobby's `.cell`
     reads as the same family as the live room's precheck (same warn-tone block, same
     `.pill-good` treatment). Save proofs at
     `docs/brand/redesign-v3/verify/interview-lobby-{light,dark}.jpeg`.
  6. **Responsive verification** — execute the 8-step list from
     [`../_design-language.md`](../_design-language.md) §"Mandatory verification":
     1. **Screenshot at all 7 reference sizes:** 375 × 667 · 430 × 932 · 768 × 1024 portrait ·
        820 × 1180 portrait · 1024 × 1366 portrait · 1366 × 1024 landscape · 1440 × 900 ·
        1920 × 1080.
     2. **No horizontal scroll** at any width ≥ 320 px (test with
        `document.documentElement.scrollWidth`).
     3. **Every interactive element ≥ 44 × 44 px** when measured at the smallest breakpoint.
     4. **Keyboard does not cover form inputs** on iOS Safari (manual test or
        `visualViewport.height` check) — the ack checkbox's surrounding label honors this
        rule; the Start button is sticky to `safe-area-inset-bottom` on mobile so it stays
        visible when the keyboard is open.
     5. **Orientation change** (portrait ↔ landscape) on iPad sizes — layout adapts gracefully,
        no clipped content; the self-view stays a comfortable 16:9 in both orientations.
     6. **`prefers-reduced-motion`** — every animation no-ops (test by enabling reduce-motion
        in DevTools); the lock indicator's pulse becomes a static dot.
     7. **Cross-browser:** iOS Safari, Chrome Android, Samsung Internet, desktop Safari /
        Chrome / Firefox / Edge — at minimum Safari + Chrome on every OS. **Note:** if the
        browser does not support `getUserMedia` (rare today), the lobby renders an `<Alert
        tone="danger">` ("Your browser doesn't support camera + mic. Please use a recent
        Chrome, Safari, Firefox, or Edge.") and Start stays disabled.
     8. **Save side-by-side proof** to
        `docs/brand/redesign-v3/verify/interview-lobby-{mobile,tablet,desktop}.jpeg`.

## States & a11y

- **States.**
  - **Loading (initial — dashboard cache cold)** — title falls back to "Loading…" then to
    `Job {jobId}` when the cache hydrates; regions render in their disabled-initial state.
  - **Region 2 enabled** — `.pill-good` "Camera + mic live" replaces the button; self-view
    plays the live stream.
  - **Region 2 error (permission denied)** — `<Alert tone="danger">` + retry; Start stays
    disabled.
  - **Region 3 in progress** — selfie taken, liveness check running; small inline spinner.
  - **Region 3 pass** — `.pill-good` "ID verified".
  - **Region 3 fail** — `<Alert tone="warn">` + retry; Start stays disabled.
  - **Region 4 in progress** — each tile shows a pulsing dot; resolves to good/warn.
  - **Region 4 complete** — all 4 tiles have a state; the `env_check_complete` event has been
    emitted.
  - **All gates passed + checkbox ticked** — Start enabled (teal `.btn.btn-primary`).
  - **Start clicked (rtcToken in flight)** — Start shows `loading` ("Connecting…"); regions
    disabled.
  - **rtcToken `UNAVAILABLE`** — inline `<Alert tone="warn">` + retry; Start re-enables.
  - **rtcToken success** — `router.push("/interview/[id]")` (no terminal state on this page).
- **Responsive.**
  - ≥ 1100 px — `.cell` is `min(56rem, 100% - 2.5rem)` centered; regions stack vertically
    inside the card with comfortable spacing; the environment scan grid is 2 × 2.
  - 760–1099 px — `.cell` narrows; spacing tightens; the environment scan grid stays 2 × 2.
  - ≤ 760 px — `.cell` is full-bleed minus 1 rem gutter; the self-view in region 2 stays
    16:9; the environment scan grid becomes 2 × 2 (still); the Start button becomes
    full-width sticky to `safe-area-inset-bottom` (`position: sticky; bottom:
    env(safe-area-inset-bottom);`).
  - ≤ 540 px — the environment scan grid collapses to a 1-column stack of tiles; the title
    in the top strip truncates with ellipsis.
- **Dark + light:** all colors via tokens; `--gold` for the warn-tone block, `--good`/`--warn`
  for the pills, `--teal` for the primary CTA.
- **Reduced motion:** `prefers-reduced-motion: reduce` disables the lock indicator pulse, the
  per-tile pulsing dot during region-4 checks, and any `.rise` reveal — content remains
  visible.
- **A11y.**
  - Single `<main role="main">`; the lobby uses one `<h1>` for the page title in the top
    strip and `<h2>` for the lobby card title ("Get ready").
  - Each region uses `<section role="region" aria-labelledby>` so screen readers announce
    the region (Strict-proctored rules / Camera + microphone / ID verification / Environment
    scan / Consent and start).
  - The self-view `<video>` carries `aria-label="Your camera preview"`.
  - The ack `<label>` wraps the `<input type="checkbox">` (not a click-on-div); the Start
    button is a real `<button>` with `disabled` set when gates are unmet (NOT
    `aria-disabled` alone — actually disabled).
  - Inline alerts use `role="alert"` so screen readers announce errors immediately.
  - Focus rings via tokens (`--teal` 2px outline + 4px halo); touch targets ≥ 44 × 44; body
    contrast ≥ 4.5:1.
  - The environment-scan tiles have a `aria-label="{name}: {state}"` so the status is
    available to screen readers (not color-only).

## Acceptance

- The lobby reads as a clean prelude to the live room — same shell-free pattern, same
  `.cell` family, same warn-tone strict-proctored block, same `.pill-good` treatment for
  passing gates. Side-by-side proof committed at
  `docs/brand/redesign-v3/verify/interview-lobby-{light,dark}.jpeg` and the responsive trio
  at `…-{mobile,tablet,desktop}.jpeg`.
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors /
  warnings on any region; reduced-motion is honored.
- **Strict-proctored invariants intact** — grep audit passes (no `mute`, no `cameraOff`, no
  `track.disable`, no "join with camera off" copy anywhere). The Start button is gated on
  the conjunction of all three preconditions (camera+mic live, ID verified, ack ticked)
  AND the ack is explicit (not pre-ticked).
- **Frame bytes never leave** — grep audit passes (no `toDataURL` / `toBlob` /
  `FormData.append(image)` / `fetch(body: Blob)` in any network path); the selfie ImageData
  is dropped from memory after the liveness check; the only network calls from this screen
  are the typed `recordProctorEvents` sink (scalar meta only) and the `rtcToken` mint.
- **`rtcToken` is called exactly once per Start click**, only after all gates pass. On
  `UNAVAILABLE`, the page does not dead-end (alert + retry).
- The lobby's deep-link from the dashboard's "Start interview" action and the
  application-detail timeline's "Start interview" action lands on the lobby (one-line href
  change in those sibling plans). A candidate who lands directly on
  `/interview/[applicationId]` (bookmark) still sees the live room's existing precheck phase
  — the lobby is additive, not load-bearing for deep-link cases.
- Pre-launch anti-fiction posture preserved: the strict-proctored warning block uses the
  truthful language from the design language §Anti-fiction; no fabricated proctoring claims
  ("we detect 1000+ signals", "100% identity assurance") appear anywhere.
