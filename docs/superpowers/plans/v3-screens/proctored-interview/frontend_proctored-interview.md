# Frontend — `proctored-interview` (Midnight v3)

> **Screen:** Proctored interview room · **Goal:** reskin the strict, fully-proctored live video + voice interview room to the **Midnight Intelligence** look. **Appearance-only — zero behavior change; the strict-proctored gates are preserved exactly.**
> **Unified route + role:** `/interview/[applicationId]` · **candidate** (`useRequireAuth`).
> **Mockup:** ✗ — **build `redesign-v2/proctored-interview.html` in Task 0**.
> **BE contract:** [`backend_proctored-interview.md`](./backend_proctored-interview.md) (interview gRPC `rtcToken`/`recordProctorEvents` + HIGH-severity auto-gate).
> **Existing code it reskins (exact paths):**
> - `frontend/apps/candidate/app/interview/[applicationId]/page.tsx` (phases: `precheck → live → ended`)
> - `frontend/apps/candidate/app/interview/[applicationId]/types.ts` (`RtcToken`/`ProctorAck`/`HIGH_SEVERITY`/`severityOf` — **do not change**)
> - `frontend/apps/candidate/app/interview/[applicationId]/rtc-room.ts` (`connectRoom`/`makeFakeRoom` — LiveKit seam, **stubbed/fake today; do not change behavior**)
> - `frontend/apps/candidate/app/interview/[applicationId]/proctor-vision.ts` + `proctor-audio.ts` (on-device detector seams — **stubbed today; do not change**)
> - `frontend/apps/candidate/components/device-precheck.tsx` (camera/mic gate + **required** acknowledgment)
> - `frontend/apps/candidate/components/interview-captions.tsx` (live captions pane)
> - `frontend/apps/candidate/components/proctor-status-strip.tsx` (live chips + flag banner)

## Layout & components
- **Shell:** the interview is a **focused full-screen room** — it does **NOT** use the `.app` sidebar/topbar shell. It is a centered single-column `<main>` (current `mx-auto max-w-3xl`). Keep it shell-free; reskin to the Midnight palette directly (tokens from `tokens.css`).
- **Region → token map:**
  - Title → Fraunces `h1` on `--ink`.
  - `unavailable` / `error` banners → token alert surfaces (`--accent-soft` warn / a danger tone), keep the Back link.
  - **DevicePrecheck** → a `.card`: the strict-proctored warning (a prominent warn-tone block: camera + mic required, **no mute / no camera-off**, fullscreen-locked, recorded, serious signals auto-end), the self-view `<video>` on `--surface-2`, the "Enable camera & microphone" `.btn`, the success note, the **required** acknowledgment `<label>` + checkbox, and the **disabled-until-ready** "Start interview" `.btn-primary`.
  - **ProctorStatusStrip** → token chips (One face · Eyes on screen · Fullscreen) as `.pill .pill-good`/`.pill-warn`; the flag banner + the terminal "auto-terminated for integrity" state as a danger-tone alert.
  - **Live room** → a `.card`/`.card-head`-free `.card` body: interviewer video + self-view tile, `InterviewCaptions` (`role="log"`), and a control bar with **exactly two controls — captions · End interview** (`.btn .btn-ghost` "End interview"). **No mute, no camera-off, no settings toggle is added.**
  - `ended` state → a `.card` with a success (clean end) or danger (auto-terminated) alert + Back link.
- **New vs reused:** **no new components** — reskin the existing files. The control surface stays **captions · end only**.

## Data wiring (kept identical to today)
- Clients/seams: `api.interview.rtcToken({applicationId})` + `api.interview.recordProctorEvents({applicationId, events[]})`; `connectRoom`/`makeFakeRoom` (fake under `NEXT_PUBLIC_MOCK`); `startProctoring` (device runtime) + `startVisionDetector`/`startAudioDetector` (on-device, stubbed). **Unchanged.**
- The proctor `sink` (typed events → gRPC `ProctorEvent{type, at, metaJson}`, reads `ack.terminated` defensively, server-authoritative severity) is **unchanged** — markup only changes.
- Fields consumed (from [`backend_proctored-interview.md`](./backend_proctored-interview.md)): `RtcToken{url, token, room}`, `ProctorAck{recorded, terminated, reason?}`, `HIGH_SEVERITY[]`. The reskin does not touch the types or the sink.

## Tasks (reskin-only — the gates and detector wiring are preserved verbatim)

### Task 0 — build the mockup `redesign-v2/proctored-interview.html` (mockup ✗)
- [ ] Build `docs/brand/redesign-v2/proctored-interview.html` against `tokens.css` + `app.css`: a **shell-free** centered room — the device-precheck `.card` (strict-proctored warning, self-view, required ack, disabled Start), the proctor status strip (`.pill` chips + flag banner), the live room (interviewer/self-view + captions + a control bar with **only** captions · End), and the ended state (clean + auto-terminated variants). Dark-first; light parity. **Show no mute / no camera-off control anywhere.**
- [ ] Browser-verify on the `:4173` preview; commit `docs/brand/redesign-v2/proctored-interview.html`.

### Task 1 — reskin `device-precheck.tsx`
- [ ] Reskin the warning block, self-view, success note, ack, and Start to tokens; keep the **required**-ack gate (Start disabled until camera+mic live **and** box ticked) and the `getUserMedia`/mock-stream logic **identical**. Build + browser-verify. Commit `frontend/apps/candidate/components/device-precheck.tsx`.

### Task 2 — reskin `proctor-status-strip.tsx`
- [ ] Reskin the chips (`.pill .pill-good`/`.pill-warn`) + flag banner + terminal state to tokens; keep the `ProctorState` props + the optimistic-UI-only severity mapping identical. Build + browser-verify. Commit `frontend/apps/candidate/components/proctor-status-strip.tsx`.

### Task 3 — reskin `interview-captions.tsx`
- [ ] Reskin the captions pane (`role="log"`, final vs interim styling) to token surfaces; keep `lines` prop identical. Build + browser-verify. Commit `frontend/apps/candidate/components/interview-captions.tsx`.

### Task 4 — reskin `app/interview/[applicationId]/page.tsx` (the room body)
- [ ] Reskin the title, banners, precheck/live/ended wrappers, and the **captions · End** control bar to tokens; keep **all** phase logic, the `onReady`/`endSession`/`sink` flow, the fullscreen-lock, the detector wiring, and the `ProctorAck.terminated` auto-gate **identical**. **Add no new control** (no mute, no camera-off). Build + browser-verify (dark + light, `NEXT_PUBLIC_MOCK=1`: fake room, canvas stream, scripted captions, proctoring loop runs end-to-end). Commit `frontend/apps/candidate/app/interview/[applicationId]/page.tsx`.

## States & a11y
- **Phases:** `precheck` (device gate + **required** ack — Start disabled until camera+mic live **and** box ticked), `live` (room + captions + status strip), `ended` (clean → "scored, check tracker"; auto-terminated → "ended for a serious integrity signal, recruiter notified"). `UNAVAILABLE` from `rtcToken` → an inline "live interview not available right now" alert + Back link (no dead-end).
- **CRITICAL INVARIANT — strict-proctored behavior preserved exactly (the reskin must NOT add any control that weakens a gate):**
  - **Camera + mic required**, **no mute**, **no camera-off** — the component tree has **no** mute or camera-toggle control; the published tracks stay enabled for the whole session. Controls are exactly **captions · End**. The reskin adds **no** such control.
  - **Fullscreen-locked** — Start requests fullscreen; exiting emits `fullscreen_exit` (device runtime) and the strip flips the Fullscreen chip to warn; the page attempts re-entry. (The fake path skips real fullscreen so the offline preview still runs.) Unchanged.
  - **On-device detectors** — `proctor-vision.ts` / `proctor-audio.ts` reduce frames/audio to derived signals **in-module** and emit **only typed events**; **no frame/ImageData/Blob/base64/PCM ever leaves** — the never-analyze-frames invariant. Unchanged.
  - **HIGH-severity auto-gate** — a HIGH event makes the server stamp severity, set `terminated_by_proctor`, return `terminated=true`; the FE ends the room and shows the terminal state. **The client never decides termination — it obeys the server ack** (severity server-authoritative). Unchanged.
- **Responsive:** the room is `max-w-3xl`; self-view is a small tile over the interviewer video on mobile, side-by-side on wide; captions scroll within their pane.
- **Dark + light:** `--accent`/base vars only — no hardcoded color; both themes verified.
- **A11y:** status strip `role="status" aria-live="polite"`; captions `role="log" aria-live="polite"`; Start/End are real `<button>`s with disabled states; the pre-check video has a label and the ack is a real `<label>` + checkbox; focus rings via `:focus-visible`; contrast ≥4.5:1.

## Acceptance
- Matches `redesign-v2/proctored-interview.html`; `--filter @ip/candidate build` + typecheck green; **zero functional diff** (same clients, sink, detectors, phases, request/response); **no "no-surveillance" copy** anywhere; **the strict-proctored gates are intact — no mute/camera-off/weakening control added**; works against the mock today (`NEXT_PUBLIC_MOCK=1`) and against LiveKit + the auto-gate once the deferred deltas land.
