# Proctored interview — Frontend implementation plan (v3 · Aperture Pro)

> 🚨 **Mandatory rule:** This is a **complete rebuild** of this screen, not a reskin. You are NOT
> modifying the existing UI; you are creating new UI that matches the **Aperture Pro** design
> language exactly. Backend contracts are frozen — reuse them. UI is new — match the demo
> ([D-aperture-pro.html](../../../brand/redesign-v3/directions/D-aperture-pro.html)).
> Read [`_design-language.md`](../_design-language.md) before you write any markup.

## 🔒 Strict-proctored invariants (non-negotiable)

> **Camera + mic required. No mute. No camera-off. Fullscreen-locked.** The component tree has NO mute or camera-toggle control — the published tracks stay enabled for the whole session. Controls are EXACTLY two: captions toggle + End interview. The reskin adds no other control.
>
> **On-device detectors only.** `proctor-vision.ts` / `proctor-audio.ts` reduce frames/audio to derived signals IN-MODULE and emit ONLY typed events. NO frame / ImageData / Blob / base64 / PCM ever leaves the device.
>
> **Server-authoritative auto-end.** A HIGH-severity event makes the server stamp severity, set `terminated_by_proctor`, and return `terminated: true`. The FE reads `terminated` defensively and ends the room immediately. The client NEVER decides termination.
>
> **Fullscreen lock.** Start requests fullscreen; exiting emits `fullscreen_exit` and the strip flips the Fullscreen chip to warn; the page attempts re-entry.

These four invariants are part of the **Aperture Pro design language** itself (see `_design-language.md` §"Mandatory revamp rule" item 5). The visual revamp must not introduce a single control that weakens any of them — no mute toggle, no camera-off button, no "raise hand", no settings cog. If a reviewer asks for one, refuse and link this block.

## Goal

Replace the existing v2/Midnight `interview/[applicationId]` room with a focused, fullscreen-locked **Aperture Pro** room: device pre-check card → live HUD (interviewer stage + integrity strip + captions log + 2-control bar) → ended state. The room IS the live HUD primitive from the design language, scaled up. Backend behavior (RTC token, on-device detectors, server-authoritative auto-gate) is identical to today.

## Route + role

`/interview/[applicationId]` · **candidate** (`useRequireAuth` + `useRequireRole(["candidate"])`).

This route does **not** mount the `.app` sidebar shell. The interview is a focused fullscreen room — the only chrome is a thin top utility line (lock indicator + applicantId/title) and the HUD itself. This is the single screen in the product where the shell is intentionally absent.

## Approved mockup (build to this exactly)

- **Live demo (HUD primitive lives here):** [`docs/brand/redesign-v3/directions/D-aperture-pro.html`](../../../brand/redesign-v3/directions/D-aperture-pro.html) — see the `.hud` + `.hud-stage` + `.hud-strip` + `.hud-toast` block in the hero section. The room scales that same primitive to fill the viewport.
- **Per-screen mockup:** ✗ none yet → **Task 0 builds** `docs/brand/redesign-v3/screens/proctored-interview.html` using only the design-language tokens + primitives. The interview is a scaled-up `.hud` (interviewer stage 16:9, integrity strip below, captions log inside the stage, 2-control bar under the strip).

The implemented page MUST look like the demo HUD primitive scaled to fill the viewport, plus the device pre-check card and the ended-state card. Side-by-side screenshot proof is part of the acceptance criteria — see "Acceptance" below.

## Existing code being REPLACED (not modified)

Delete-and-rebuild scope (assume these files will be re-written from scratch by the new plan):

- `frontend/apps/candidate/app/interview/[applicationId]/page.tsx` — phase controller (`precheck → live → ended`); rebuild against the new HUD primitive, but **preserve the phase machine + sink logic verbatim**.
- `frontend/apps/candidate/components/device-precheck.tsx` — rebuild as a single Aperture-Pro `.cell` card (warn-tone strict-proctored block + self-view + required ack + disabled-until-ready Start). No tabs, no extra controls.
- `frontend/apps/candidate/components/proctor-status-strip.tsx` — rebuild as the design-language `.hud-strip` (4 `.hud-chip.good/.warn/.danger` chips: Face · Gaze · Mic · Integrity). The flag banner becomes a `.hud-toast` floating over the stage; the terminal "auto-terminated for integrity" state replaces the entire room body with the ended-state card.
- `frontend/apps/candidate/components/interview-captions.tsx` — rebuild as a `.hud-caption`-derived live log inside the stage; `role="log"` polite live region kept.

The following files are **frozen — do not modify** (data seam / detector seams / type contract are reused as-is):

- `frontend/apps/candidate/app/interview/[applicationId]/types.ts` — `RtcToken`/`ProctorAck`/`HIGH_SEVERITY`/`severityOf`.
- `frontend/apps/candidate/app/interview/[applicationId]/rtc-room.ts` — `connectRoom`/`makeFakeRoom` (LiveKit seam; stubbed today).
- `frontend/apps/candidate/app/interview/[applicationId]/proctor-vision.ts` — on-device vision detector (frame-bound, emits typed events only).
- `frontend/apps/candidate/app/interview/[applicationId]/proctor-audio.ts` — on-device audio detector (audio-bound, emits typed events only).
- The proctor `sink` (typed events → `recordProctorEvents` → reads `ProctorAck.terminated` defensively) — unchanged.

## Layout & components

**Shell:** **shell-free.** The interview is a focused fullscreen room — a single `<main role="main">` filling the viewport (no `.app` sidebar, no topbar). A thin top strip carries the brand mark, the applicantId/title, and a `<small>` lock indicator ("Fullscreen-locked · Recorded") that goes warn-tone if `fullscreen_exit` fires.

| Phase / region | Aperture-Pro primitive | Behavior |
|---|---|---|
| **`precheck` — device pre-check card** | `.cell` (large, single centered card; warn-tone leading icon for the strict-proctored block) | The card has 4 stacked regions: (1) warn-tone block enumerating the strict rules (camera + mic required, no mute, no camera-off, fullscreen-locked, recorded, HIGH-severity auto-ends) — written in body voice, not pill voice; (2) self-view `<video>` on `--surface-2` with rounded `12px` corners; (3) "Enable camera & microphone" `.btn.btn-primary` → on success, a `.pill.pill-good` "Camera + mic live" replaces it; (4) the **required** ack `<label>` + checkbox ("I understand and agree…") + the **disabled-until-ready** `.btn.btn-primary` "Start interview" (gated on camera+mic live **and** box ticked). |
| **`live` — fullscreen room** | scaled `.hud` (the design-language HUD primitive at full viewport) | Structure: `.hud-topbar` (title + interviewer name + timer + lock chip) → `.hud-stage` (16:9 dark-gradient video tile: interviewer video full-bleed, self-view `.self` overlay bottom-right, `.hud-caption` live captions log on bottom-left) → `.hud-strip` (4 chips below the stage) → control bar (`.toolbar` with exactly **captions** toggle + **End interview** `.btn.btn-ghost`). |
| **`live` — integrity strip** | `.hud-strip` (4 `.hud-chip`) | Chips: **Face** (One / None / 2+) · **Gaze** (On / Away) · **Mic** (Live / Silent) · **Integrity** (0–100). Each chip uses `.hud-chip.good` / `.hud-chip.warn` / `.hud-chip.danger` per `ProctorState`. The Fullscreen lock state lives in the topbar chip, not the strip. |
| **`live` — captions** | `.hud-caption` styled live log inside the stage | `role="log" aria-live="polite"` polite live region; final vs interim styling per the design-language `.hud-caption .who` micro-label + body line. Captions toggle in the control bar hides the caption box (CSS only — the log node stays mounted for screen readers). |
| **`live` — flag toast** | `.hud-toast` floating anchored to the stage | Appears for `~3s` on a fresh medium-severity flag; auto-fades. Severity tint follows tokens (`--gold` for the dot). NOT a HIGH-severity end signal — HIGH replaces the room with the ended-state card. |
| **`ended` — clean end** | `.cell` (single centered card; teal accent leading icon) | "Interview complete. Your responses have been recorded. We'll be in touch via your tracker." + a `.btn.btn-ghost` "Back to dashboard". |
| **`ended` — auto-terminated** | `.cell` (single centered card; danger leading icon) | "Interview ended automatically due to a serious integrity signal. Your recruiter has been notified." + the server-supplied `reason` (when present) in `--ink-2`. Single `.btn.btn-ghost` "Back to dashboard". No retry, no resume. |
| **`unavailable` (RTC `UNAVAILABLE`)** | `.cell` (single centered card; warn leading icon) | "Live interview not available right now. Please try again shortly." + a `.btn.btn-ghost` "Back to dashboard". No dead-end. |

**Control bar.** Exactly **two** controls — `captions` toggle (a `.btn.btn-ghost.btn-sm` with an aria-pressed state) and `End interview` (a `.btn.btn-ghost` with a confirm dialog). No mute. No camera-off. No settings. No reactions. Adding any other control is a hard violation of the strict-proctored invariants block at the top of this plan.

**No new logic components.** The HUD primitive is reused from `@ip/ui` (the same one the landing hero uses; see `_design-language.md` §"Hero / live HUD"). The room mounts a single instance, sized to fill the viewport.

## Data wiring / seam (preserved verbatim)

- **RTC token:** `api.interview.rtcToken({applicationId})` → `RtcToken{url, token, room}` — the FE calls `room.connect(url, token)` (LiveKit; fake under `NEXT_PUBLIC_MOCK` via `makeFakeRoom`).
- **Proctor event sink:** `api.interview.recordProctorEvents({applicationId, events[]})` → `ProctorAck{recorded, terminated, reason?}`. The sink batches typed events from the device runtime + on-device detectors and reads `ack.terminated` **defensively** (so the moment the server starts setting it, the FE honors it without a client change).
- **Detectors (frozen):** `startProctoring` (device runtime: fullscreen_exit, tab_focus_lost, page_hidden, copy/paste/keyup signals) + `startVisionDetector` (face count, gaze, eyes-on-screen, second face, phone, virtual camera) + `startAudioDetector` (voice count, second voice, silence, synthetic audio suspicion). Every signal becomes a typed `ProctorEvent{type, at, metaJson}` — scalar meta only.
- **HIGH-severity list (frozen — mirror of the server set, drives OPTIMISTIC UI only):**
  ```ts
  export const HIGH_SEVERITY = [
    "second_face", "second_voice", "phone_detected",
    "screen_share", "virtual_camera", "synthetic_audio_suspected",
  ] as const;
  ```
  Severity is **server-authoritative**. The client mirror exists ONLY to optimistically render the strip and prepare the ended-state card; the actual termination is the server's `terminated=true` on the next `recordProctorEvents` ack.
- **Never-leaves invariant.** `proctor-vision.ts` and `proctor-audio.ts` reduce frames / audio buffers to derived signals **in-module** and emit ONLY the typed event. No frame / ImageData / Blob / base64 / PCM is ever attached to a `ProctorEvent`, and no other call surface exists. The DTO has no media-bearing field.

See [`backend_proctored-interview.md`](./backend_proctored-interview.md) for the full RPC contract; it is unchanged.

## Tasks (build → screenshot-verify → commit per task)

> **Task 0 — Build the screen mockup** (no demo HUD-at-full-viewport exists yet).

- **Task 0 — Mockup.** Build `docs/brand/redesign-v3/screens/proctored-interview.html` against the design-language tokens + primitives: shell-free `<main>`, top strip (mark + title + lock chip), the precheck `.cell` (warn block + self-view + ack + disabled Start), the live room (scaled `.hud` + 16:9 `.hud-stage` + `.hud-strip` + `.hud-caption` + 2-control bar), the flag `.hud-toast` over the stage, and both ended-state `.cell` variants (clean + auto-terminated). Show NO mute / NO camera-off / NO settings control. Verify in both themes on the `:4173` preview. Commit the mockup.
- **Task 1 — HUD primitive into `@ip/ui`.** Lift `.hud + .hud-topbar + .hud-stage + .hud-strip + .hud-chip + .hud-caption + .hud-toast` from the landing hero into `@ip/ui/src/app.css` (one source of truth for both surfaces). Add a `<Hud>`/`<HudStrip>`/`<HudCaption>` wrapper in `@ip/ui` so the landing hero and the interview room both consume the same React component. Verify the landing hero still renders unchanged. Commit `frontend/packages/ui/src/app.css` + `frontend/packages/ui/src/hud.tsx`.
- **Task 2 — Rebuild `device-precheck.tsx`.** New markup: the four-region `.cell` per the Layout table. **Keep the `getUserMedia`/mock-stream logic, the required-ack gate, and the `onReady` callback identical** to today. The Start button stays disabled until the camera+mic stream is live AND the box is ticked. Browser-verify both themes. Commit.
- **Task 3 — Rebuild `proctor-status-strip.tsx`.** Render the `.hud-strip` (4 `.hud-chip`) from `ProctorState`; the flag banner becomes a `.hud-toast`; the terminal auto-terminated state returns `null` (the room body switches to the ended-state card at the page level). **Keep the `ProctorState` props + the optimistic-UI-only severity mapping identical.** Verify chip color transitions in both themes. Commit.
- **Task 4 — Rebuild `interview-captions.tsx`.** Render `role="log" aria-live="polite"` with the `.hud-caption` micro-style (interviewer/candidate `who` micro-label + body line). Final lines are full opacity; interim lines are `--ink-3`. **Keep the `lines` prop identical.** When captions toggle is off, hide visually with `aria-hidden="true"` but keep the node mounted so screen readers still announce. Commit.
- **Task 5 — Rebuild `app/interview/[applicationId]/page.tsx` (the room body).** Use the new HUD primitive as the live phase, the rebuilt precheck card as the precheck phase, and the two-variant ended-state cards. **Keep all phase logic — `onReady`, `endSession`, the `sink`, the fullscreen request/re-entry loop, the detector wiring, and the `ProctorAck.terminated` auto-gate — byte-for-byte identical** to today. Add NO new control. Verify end-to-end with `NEXT_PUBLIC_MOCK=1`: fake room, canvas stream, scripted captions, scripted proctoring events including a fake HIGH event drives auto-end. Commit.
- **Task 6 — Verify against the mockup.**
  1. Build `--filter @ip/candidate build` is green; `--filter @ip/candidate exec tsc --noEmit` is green.
  2. Navigate `/interview/{appId}` signed-in, screenshot in both themes at 1440×900 and 390×844, in both phases (precheck, live).
  3. Screenshot the ended-state card in both variants by forcing the phase via a dev hatch.
  4. **Side-by-side fidelity check** against `docs/brand/redesign-v3/screens/proctored-interview.html` (the Task 0 mockup) and the demo's `.hud` primitive. Iterate until 1:1.
  5. **Strict-invariant audit** — grep the new components for `mute`, `cameraOff`, `videoOff`, `audio.enabled = false`, `track.disable`. **Zero hits.** The control bar has exactly two `<button>` elements.

## States & a11y

- **Phases:** `precheck` (device gate + required ack — Start disabled until camera+mic live **and** box ticked) · `live` (HUD + captions + status strip) · `ended` (clean → "scored, check tracker" / auto-terminated → "ended for a serious integrity signal, recruiter notified"). `UNAVAILABLE` from `rtcToken` → the unavailable `.cell` (no dead-end).
- **Responsive.** The room is `width:min(100% - 2.5rem, 1240px)` centered, but the `.hud-stage` always fills 16:9 of available width. Self-view is a small `96×64` tile overlay on the stage at all widths. Captions log scrolls within `.hud-caption`. Control bar wraps onto its own line on narrow widths; the two controls stay visible.
- **Dark + light.** All colors via tokens — `--surface`, `--ink-deep`, `--good`, `--warn`, `--danger`, `--coral`, `--gold`. The stage gradient is the only place hard-coded dark colors live (per the design language `.hud-stage` block) — kept intentionally dark in both themes so the interviewer video reads well.
- **A11y.** Status strip `role="status" aria-live="polite"`. Captions log `role="log" aria-live="polite"`. Start/End are real `<button>`s with disabled states and visible focus rings (`--teal` 2px / 4px halo). The pre-check `<video>` has a `<label>` and the ack is a real `<label>` + checkbox. Self-view tile is `aria-label="Your camera preview"`. Touch targets ≥44×44. Contrast ≥4.5:1 — chip values use `--ink-deep` on `--surface-2`. Respects `prefers-reduced-motion` — the `.status.live .dot` pulse is no-op'd.

## Acceptance

- Looks 1:1 like `docs/brand/redesign-v3/screens/proctored-interview.html` (the Task 0 mockup) and the demo's `.hud` primitive — section order, spacing, type, motion, content blocks all match. Side-by-side screenshot proof committed under `docs/brand/redesign-v3/verify/proctored-interview-{light,dark}-{precheck,live}.jpeg`.
- `--filter @ip/candidate build` is green; `tsc --noEmit` is green; no console errors / warnings on any phase; reduced-motion is honored.
- **Zero functional diff.** Same RTC client, same `recordProctorEvents` sink, same on-device detectors, same `ProctorAck.terminated` defensive read, same fullscreen lock + re-entry loop, same phase machine.
- **Strict-proctored invariants intact** — grep audit passes (no `mute`, no `cameraOff`, no `track.disable`), control bar has exactly two `<button>` elements, the `HIGH_SEVERITY` list and the `severityOf` mirror are byte-identical to today.
- Works end-to-end against the mock today (`NEXT_PUBLIC_MOCK=1`) and against LiveKit + the server-authoritative auto-gate the moment the deferred backend wiring lands — no FE change required.
