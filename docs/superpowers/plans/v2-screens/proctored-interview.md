# Screen: Proctored interview room — FE plan + BE contract

> Part of the [v2 build program](../2026-06-20-v2-build-program.md) (Wave 2).
> **Route:** `apps/candidate/app/interview/[applicationId]/page.tsx` (**REPLACES** the current text interview) · **Mockup:** `aptura_proctored_interview_room` · **Pillar:** [proctored-integrity](../../v2/2026-06-20-proctored-integrity.md)
> **Goal:** A strict, fully-proctored **live video + voice** interview — camera + mic **required**, **no mute / no camera-off**, fullscreen-locked, all 40 proctoring signals live (device + **on-device vision/audio** detectors), HIGH-severity signals **auto-terminate** the session; only **typed events** (never raw frames/audio) leave the device.

This screen replaces the text-interview page entirely. The existing page is a `<Textarea>` Q&A loop with an **optional** consent checkbox; the pivot makes it a LiveKit room with a **device pre-check + required acknowledgment**, live captions, and a `ProctorStatusStrip`. The proctoring **model + `/proctor` endpoint + `proctoring_events` collection are already built** (`src/ai-agents/app/model/proctoring.py`, `routes/interview_api.py:126`, `mcp-data/app/tools.py`); the **device/behavior detectors are built** (`@ip/shared/proctor-runtime.ts`); the **camera/mic detectors are STUBBED** — `getUserMedia` is never called today. This plan wires the visual + audio detectors and the HIGH-severity auto-gate.

---

## A. Backend contract (hand this to a backend session)

This screen **EVOLVES** an existing service — no new gRPC service, no new collection. Two deltas: (1) the **`rtc-token` endpoint already grants video** — confirm + return its shape unchanged; (2) the **proctoring ingest gains a HIGH-severity auto-gate** that terminates the live session.

### A.1 — `rtc-token` (EXISTING; grants video — confirm, do not rebuild)

**Status:** EXISTING · **Service:** ai-agents REST (`src/ai-agents/app/routes/interview_api.py:213`)

```
POST /interview/{application_id}/rtc-token        (bearer; candidate-owned)
→ 200 { "url": "wss://…", "token": "<livekit-jwt>", "room": "interview-<application_id>" }
→ 403 not your interview   404 session not found   503 voice interview not configured
```
- **Request:** path `application_id`; no body. Bearer required (`_caller_user_id`).
- **Response:** `{url, token, room}` — the FE calls `room.connect(url, token)` (LiveKit). The minted JWT already carries `VideoGrant{room_join, room}` (`resources/voice/rtc_token.py::mint_join_token`) — **video is granted today**; no change needed.
- **Auth/scope:** bearer; ownership check (`session.candidate_user_id != user_id → 403`). `503` when `livekit_api_key/secret` unset — the FE treats this as "voice not configured" and shows a fallback (see C).
- **Backed by:** `deps["sessions"].get(application_id)` (the interview session) + `Settings.livekit_*`. The session is started by `POST /interview/{id}/start` (unchanged).

### A.2 — Proctoring auto-gate (EVOLVE `resources/proctoring.py`)

**Status:** EVOLVE · **Service:** ai-agents REST (`POST /interview/{application_id}/proctor`, `routes/interview_api.py:126` → `resources/proctoring.py::record_proctoring_events`)

The ingest endpoint, ownership check, type validation, `max_proctor_events` cap, and **server-assigned severity** are **already built** and **must not change** (the client can't spoof severity — the input model has no severity field). The delta: when an ingested batch contains a **HIGH-severity** event, **terminate the live session** and finalize a `proctor_terminated` outcome.

```
POST /interview/{application_id}/proctor          (bearer; candidate-owned — UNCHANGED)
body { "events": [{ "type": "<ProctoringEventType>", "at": "<ISO>", "meta": {…}? }] }
→ 200 { "recorded": <int>, "terminated": <bool>, "reason": "<event_type>"? }   ← FE reads `terminated`
```
- **Request:** `{events: [{type, at, meta?}]}` — typed events only, **never raw media** (existing contract; the DTO has no frame/audio field — a grep-test asserts no media bytes ingest path).
- **Response delta:** add `terminated: bool` + optional `reason: str` (the triggering HIGH event type). On `terminated=true` the FE ends the LiveKit room and shows the terminal state.
- **Auth/scope:** bearer; `session.candidate_user_id != caller → ForbiddenError`. Severity is stamped **server-side** via `severity_of(e.type)` (`model/proctoring.py:70`) — unchanged.
- **HIGH set (server-authoritative, `_SEVERITY` in `model/proctoring.py:45`):** `second_face`, `second_voice`, `phone_detected`, `screen_share`, `virtual_camera`, `synthetic_audio_suspected`. Any one → auto-terminate.
- **Backed by:** `proctoring_events` (append-only, indexed `(application_id)` + `(comp_id, application_id)` — `admin/infra/db.py:46`) — **unchanged**. The terminate sets the session's `terminated_by_proctor` + reason and routes through the interview **finalize** path so the funnel sees a `proctor_terminated` outcome (decide the funnel flag with the admin owner — keep `interview.completed` shape, add a sibling flag/`interview.terminated`; per [proctored-integrity](../../v2/2026-06-20-proctored-integrity.md) Tier B).
- **Transcript path UNCHANGED:** the live transcript still flows to the evaluator exactly as today — proctoring is a **parallel** signal channel, not in the scoring path. A terminated session finalizes with the proctor reason; a clean session scores normally.
- **File:** `src/ai-agents/app/resources/proctoring.py` (the gate) + `routes/interview_api.py` (thread `terminated` into the 200 body). Tests (ai-agents): HIGH event → session `terminated_by_proctor` set + `terminated=true`; MED/LOW → `terminated=false` (recorded only); severity is server-assigned (a client-sent `severity` is ignored).

**FE mock shape** (`apps/candidate/app/interview/[applicationId]/types.ts`) — the FE codes against this until the deltas land:
```ts
// Mirrors POST /interview/{id}/rtc-token (EXISTING).
export interface RtcToken { url: string; token: string; room: string; }
// Mirrors the POST /interview/{id}/proctor response delta (EVOLVE).
export interface ProctorAck { recorded: number; terminated: boolean; reason?: string; }
// HIGH-severity types that auto-terminate (client-side mirror of the server `_SEVERITY` HIGH set;
// the SERVER is authoritative — this is only for optimistic UI, never for enforcement).
export const HIGH_SEVERITY = [
  "second_face", "second_voice", "phone_detected",
  "screen_share", "virtual_camera", "synthetic_audio_suspected",
] as const;
```

---

## B. Frontend plan (TDD, bite-sized)

**Files:**
- Create: `frontend/packages/shared/src/proctor-vision.ts` — on-device MediaPipe FaceMesh (CDN) → vision signals
- Create: `frontend/packages/shared/src/proctor-audio.ts` — on-device VAD/diarization-lite → audio signals
- Modify: `frontend/packages/shared/src/proctor.ts` — extend `ProctorEventType` with the B (visual) + C (audio) types
- Modify: `frontend/packages/shared/src/interview.ts` — add `rtcToken(applicationId)` + extend `proctor` ack typing (or a small `proctor.ts` return-type change)
- Modify: `frontend/packages/shared/src/index.ts` — export the new detectors
- Create: `frontend/apps/candidate/app/interview/[applicationId]/types.ts` (the contract shapes above)
- Create: `frontend/apps/candidate/app/interview/[applicationId]/rtc-room.ts` — LiveKit room wiring + `makeFakeRoom()` offline seam
- Create: `frontend/apps/candidate/components/proctor-status-strip.tsx` — the live chips + flag banner
- Create: `frontend/apps/candidate/components/device-precheck.tsx` — camera/mic pre-check + required acknowledgment
- Create: `frontend/apps/candidate/components/interview-captions.tsx` — live captions pane
- **Replace:** `frontend/apps/candidate/app/interview/[applicationId]/page.tsx` (text interview → proctored room)
- Create tests: `proctor-vision.test.ts`, `proctor-status-strip.test.tsx`

**Components:** new `DevicePrecheck`, `ProctorStatusStrip`, `InterviewCaptions`; reuse `@ip/ui` `Alert`, `Button`, `Card`, `CardContent`, `Badge`, `Spinner`, `Icon`. **Controls = captions · end only** (no mute, no camera-off toggle exists in the tree).
**Deps to add** (`frontend/apps/candidate/package.json`): `livekit-client` (real RTC). MediaPipe loads from **CDN at runtime** (no package). `lucide-react` icons used in the candidate app must be imported in the app (design-system gotcha).

> **Build-against-mock seam.** Set `NEXT_PUBLIC_MOCK=1` to: (a) use `makeFakeRoom()` instead of a real LiveKit connection, (b) stub `getUserMedia` to a canvas-generated `MediaStream` so the page renders without a camera, and (c) drive `rtcToken` from the mock. The component tree is identical in both modes — only the room/stream binding swaps. This makes the room **independently testable today** (no LiveKit server, no camera).

### Task 1: Extend the proctoring event catalog (shared types)

The detectors emit B/C signal types that `proctor.ts` doesn't yet list. Add them so the typed `proctor.send()` path accepts them (the backend catalog in `model/proctoring.py` is the source of truth — mirror it exactly).

- [ ] **Step 1: Write the failing test** — `frontend/packages/shared/src/proctor-vision.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { ProctorEventType } from "./proctor.js";

describe("proctor event catalog", () => {
  it("includes the on-device vision + audio signal types", () => {
    const types: ProctorEventType[] = [
      "gaze_off_screen", "head_turned_away", "body_out_of_frame", "second_face",
      "phone_detected", "camera_occluded", "lips_move_no_audio",
      "second_voice", "synthetic_audio_suspected", "keyboard_typing",
    ];
    expect(types).toHaveLength(10); // compiles iff every string is in the union
  });
});
```
- [ ] **Step 2: Run it, verify it fails** — `npx pnpm@9.15.0 --filter @ip/shared typecheck` → FAIL (the new strings are not in `ProctorEventType`).
- [ ] **Step 3: Implement** — extend the union in `frontend/packages/shared/src/proctor.ts` to the full catalog (copy from `src/ai-agents/app/model/proctoring.py:14-39`):
```ts
export type ProctorEventType =
  // B — visual (browser-edge; no raw frames ever leave the device)
  | "gaze_off_screen" | "head_turned_away" | "lips_move_no_audio" | "audio_no_lip_move"
  | "body_out_of_frame" | "second_face" | "phone_detected" | "camera_occluded" | "virtual_camera"
  // C — audio (counts/detection only; no voiceprint identity)
  | "second_voice" | "keyboard_typing" | "synthetic_audio_suspected"
  // D — device / behavior (already shipped)
  | "tab_hidden" | "window_blur" | "fullscreen_exit" | "copy" | "paste_large"
  | "devtools_open" | "multi_monitor" | "screen_share" | "keystroke_anomaly" | "ip_geo_anomaly";
```
- [ ] **Step 4: Run → PASS** — `--filter @ip/shared typecheck` clean. Update the file header comment ("SIGNALS ONLY — no camera/mic frames or audio ever leave the device" stays; drop "Advisory: never blocks" — HIGH now auto-terminates).
- [ ] **Step 5: Commit** — `git commit -am "feat(proctor): full B/C/D signal catalog in shared"`

### Task 2: `proctor-vision.ts` — on-device FaceMesh detector (the never-analyze-frames invariant)

A self-contained detector: takes a `MediaStreamTrack` (camera) + the existing `emit`, loads MediaPipe FaceMesh **from CDN in the browser**, runs inference **on-device**, and emits **only typed events**. **No `ImageData`, no frame, no `Blob`, no base64 ever leaves `proctor-vision.ts`** — the only outward call is `emit(type, meta)`. This is the load-bearing privacy invariant.

- [ ] **Step 1: Write the failing test** — `proctor-vision.test.ts` (drives the **pure scoring** function, not the CDN model):
```ts
import { describe, it, expect, vi } from "vitest";
import { classifyFaces, type FaceObservation } from "./proctor-vision.js";

describe("classifyFaces", () => {
  it("emits second_face when two faces are seen", () => {
    const emit = vi.fn();
    classifyFaces([{ faces: 2, gazeOffCenter: false, occluded: false }], emit);
    expect(emit).toHaveBeenCalledWith("second_face", expect.any(Object));
  });
  it("emits gaze_off_screen on sustained off-center gaze, not a single frame", () => {
    const emit = vi.fn();
    const off: FaceObservation = { faces: 1, gazeOffCenter: true, occluded: false };
    classifyFaces([off, off, off, off, off], emit);  // ≥N consecutive
    expect(emit).toHaveBeenCalledWith("gaze_off_screen", expect.any(Object));
  });
  it("never passes pixel data to emit (privacy invariant)", () => {
    const emit = vi.fn();
    classifyFaces([{ faces: 1, gazeOffCenter: false, occluded: true }], emit);
    for (const call of emit.mock.calls) {
      const meta = call[1] ?? {};
      expect(JSON.stringify(meta)).not.toMatch(/data:image|ImageData|[A-Za-z0-9+/]{200,}/);
    }
  });
});
```
- [ ] **Step 2: Run → FAIL** — `--filter @ip/shared test proctor-vision`.
- [ ] **Step 3: Implement** `proctor-vision.ts` — split into a **pure classifier** (tested) + a **CDN loader/attach** (not unit-tested, behind the offline seam):
```ts
import type { ProctorEventType } from "./proctor.js";

export interface FaceObservation { faces: number; gazeOffCenter: boolean; occluded: boolean; }
type Emit = (type: ProctorEventType, meta?: Record<string, unknown>) => void;

const GAZE_RUN = 5;     // consecutive off-center frames before flagging (debounce, ~1s at 5fps)
const OCCLUDE_RUN = 5;

// PURE: observations → typed events. Receives derived booleans/counts ONLY — never pixels.
export function classifyFaces(obs: FaceObservation[], emit: Emit): void {
  let gaze = 0, occl = 0;
  for (const o of obs) {
    if (o.faces >= 2) emit("second_face", { faces: o.faces });
    if (o.faces === 0) emit("body_out_of_frame");
    gaze = o.gazeOffCenter ? gaze + 1 : 0;
    if (gaze === GAZE_RUN) emit("gaze_off_screen", { frames: gaze });
    occl = o.occluded ? occl + 1 : 0;
    if (occl === OCCLUDE_RUN) emit("camera_occluded");
  }
}

// CDN attach (browser-only; NOT in the gate). Loads FaceMesh from CDN, runs inference on the
// camera track, derives FaceObservation per frame, and calls classifyFaces. The MediaPipe
// `results` (which DO contain landmarks/pixels) are reduced to FaceObservation HERE and never
// forwarded — only typed events leave this module. Phone detection is a lightweight object cue
// in meta; the model + frames stay on-device.
export async function startVisionDetector(
  track: MediaStreamTrack, emit: Emit,
): Promise<() => void> {
  // dynamic import from CDN so no package is added and SSR never touches it
  const FaceMesh = await loadFaceMeshFromCDN();   // @mediapipe/face_mesh via <script>/import()
  const video = document.createElement("video");
  video.srcObject = new MediaStream([track]);
  await video.play();
  let stopped = false;
  const mesh = new FaceMesh({ locateFile: (f: string) => `${CDN}/${f}` });
  mesh.setOptions({ maxNumFaces: 2, refineLandmarks: true });
  mesh.onResults((r: unknown) => {
    if (stopped) return;
    const o = observe(r);                          // landmarks → FaceObservation (derived only)
    classifyFaces([o], emit);                      // typed events only
  });
  const loop = async () => { if (!stopped) { await mesh.send({ image: video }); requestAnimationFrame(loop); } };
  void loop();
  return () => { stopped = true; mesh.close?.(); video.srcObject = null; };
}
```
*(`loadFaceMeshFromCDN`, `observe`, `CDN` are small browser-only helpers in the same file; the executor wires the exact MediaPipe CDN URL + landmark→gaze/occlusion math. The contract the page depends on: `startVisionDetector(track, emit) → stop()`, emits typed events only.)*
- [ ] **Step 4: Run → PASS** — `--filter @ip/shared test proctor-vision` + `typecheck` clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(proctor): on-device FaceMesh vision detector (typed events only)"`

### Task 3: `proctor-audio.ts` — on-device VAD/diarization-lite

Takes the mic `MediaStreamTrack`, runs **on-device** Web Audio analysis (VAD energy + a lightweight second-speaker/synthetic cue), emits `second_voice` / `synthetic_audio_suspected` / `keyboard_typing`. **No audio buffer leaves the module** — only typed events.

- [ ] **Step 1: Write the failing test** — pure classifier (`classifyAudio(frames, emit)`): two distinct speaker-energy signatures → `second_voice`; a flat/over-regular spectral signature → `synthetic_audio_suspected`; a single steady voice → nothing. Assert `emit` meta carries **no PCM/sample array** (same privacy grep as Task 2).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — `classifyAudio` (pure, tested) + `startAudioDetector(track, emit) → stop()` (Web Audio `AnalyserNode`, browser-only, derives features → `classifyAudio`; the raw `Float32Array` is reduced to features in-module and never forwarded).
- [ ] **Step 4: Run → PASS.** Export both detectors from `frontend/packages/shared/src/index.ts`.
- [ ] **Step 5: Commit** — `git commit -am "feat(proctor): on-device audio detector (VAD/diarization-lite, typed events only)"`

### Task 4: `rtcToken` client + LiveKit room wiring + fake seam

- [ ] **Step 1:** Add `rtcToken` to `makeInterviewClient` in `frontend/packages/shared/src/interview.ts`:
```ts
rtcToken: (applicationId: string, signal?: AbortSignal) =>
  post<{ url: string; token: string; room: string }>(`/interview/${applicationId}/rtc-token`, undefined, signal),
```
- [ ] **Step 2:** Create `frontend/apps/candidate/app/interview/[applicationId]/rtc-room.ts` — wrap `livekit-client` behind a tiny interface the page consumes, plus the offline fake:
```ts
import type { RtcToken } from "./types";

export interface InterviewRoom {
  localVideo: MediaStream;                       // shown in the self-view tile
  onCaption: (cb: (text: string, final: boolean) => void) => void;  // captions from data track
  onRemoteSpeaking: (cb: (active: boolean) => void) => void;        // interviewer VU
  disconnect: () => Promise<void>;
}

// REAL: connect to LiveKit, publish the (already-acquired) camera+mic tracks, subscribe to the
// agent's audio + caption data channel. No mute/camera-off control is exposed — the published
// tracks stay enabled for the whole session.
export async function connectRoom(tok: RtcToken, media: MediaStream): Promise<InterviewRoom> {
  const { Room } = await import("livekit-client");           // lazy: SSR-safe
  const room = new Room({ adaptiveStream: true });
  await room.connect(tok.url, tok.token);
  for (const track of media.getTracks()) await room.localParticipant.publishTrack(track);
  // …subscribe to remote audio + the caption data track; expose via the interface…
  return { localVideo: media, onCaption: …, onRemoteSpeaking: …, disconnect: () => room.disconnect() };
}

// FAKE (NEXT_PUBLIC_MOCK=1): no LiveKit, no network — a canvas self-view + scripted captions so
// the room renders + the proctoring loop runs end-to-end offline.
export function makeFakeRoom(media: MediaStream): InterviewRoom {
  let capCb: (t: string, f: boolean) => void = () => {};
  const captions = ["Tell me about a system you designed.", "How did you handle failure modes?"];
  let i = 0;
  const timer = setInterval(() => { if (i < captions.length) capCb(captions[i++], true); }, 4000);
  return {
    localVideo: media,
    onCaption: (cb) => { capCb = cb; },
    onRemoteSpeaking: (cb) => setInterval(() => cb(Math.random() > 0.5), 1500) as unknown as void,
    disconnect: async () => clearInterval(timer),
  };
}
```
- [ ] **Step 3: Verify** — `--filter @ip/shared typecheck` + `--filter @ip/candidate typecheck` clean.
- [ ] **Step 4: Commit** — `git commit -am "feat(interview): rtc-token client + LiveKit room wiring + fake seam"`

### Task 5: `ProctorStatusStrip` — live chips + flag banner

- [ ] **Step 1: Write the failing test** — `proctor-status-strip.test.tsx`: renders three "ok" chips (One face · Eyes on screen · Fullscreen); a `recentFlag` prop renders the danger banner with the flag label; a `terminated` prop renders the "auto-terminated for integrity" state.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `frontend/apps/candidate/components/proctor-status-strip.tsx`:
```tsx
import { Badge, Alert, Icon } from "@ip/ui";

export interface ProctorState {
  oneFace: boolean; eyesOnScreen: boolean; fullscreen: boolean;
  recentFlag?: { type: string; severity: "low" | "medium" | "high" };
  terminated?: { reason: string };
}
const chip = (ok: boolean, label: string) => (
  <Badge tone={ok ? "success" : "warning"} variant="subtle">
    <Icon name={ok ? "check" : "alert-triangle"} className="size-3" /> {label}
  </Badge>
);
export function ProctorStatusStrip({ state }: { state: ProctorState }) {
  if (state.terminated)
    return <Alert tone="danger" title="Interview ended">This session was ended automatically because a serious integrity signal was detected ({state.terminated.reason}). The recruiter has been notified.</Alert>;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2" role="status" aria-live="polite">
        {chip(state.oneFace, "One face")}
        {chip(state.eyesOnScreen, "Eyes on screen")}
        {chip(state.fullscreen, "Fullscreen")}
      </div>
      {state.recentFlag && state.recentFlag.severity !== "low" && (
        <Alert tone={state.recentFlag.severity === "high" ? "danger" : "warning"}>
          Integrity signal detected: {state.recentFlag.type.replace(/_/g, " ")}. Keep your face visible and stay in fullscreen.
        </Alert>
      )}
    </div>
  );
}
```
- [ ] **Step 4: Run → PASS** + `--filter @ip/candidate typecheck` clean. (Confirm `Icon` names `check` / `alert-triangle` exist in `@ip/ui`; substitute real lucide names if not.)
- [ ] **Step 5: Commit** — `git commit -am "feat(interview): ProctorStatusStrip chips + flag banner"`

### Task 6: `DevicePrecheck` — camera/mic gate + required acknowledgment

Replaces the **optional** consent checkbox with a **required** flow: request `getUserMedia({video,audio})`, show the self-view + a green "camera + mic ready" check, list what's monitored, and a **required** acknowledgment (not optional — the Start button is disabled until both the stream is live and the box is ticked).

- [ ] **Step 1:** Create `frontend/apps/candidate/components/device-precheck.tsx`:
```tsx
"use client";
import { Alert, Button, Card, CardContent, Checkbox, Spinner } from "@ip/ui";
import { useEffect, useRef, useState } from "react";

export function DevicePrecheck({ onReady }: { onReady: (media: MediaStream) => void }) {
  const [media, setMedia] = useState<MediaStream | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ack, setAck] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  async function requestDevices() {
    setErr(null);
    try {
      const stream = process.env.NEXT_PUBLIC_MOCK === "1"
        ? fakeStream()                                   // canvas stream, no real camera
        : await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setMedia(stream);
    } catch {
      setErr("Camera and microphone access is required for this interview. Enable them in your browser and retry.");
    }
  }
  useEffect(() => { if (media && videoRef.current) videoRef.current.srcObject = media; }, [media]);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <Alert tone="warning" title="This is a strictly proctored interview">
          Your camera and microphone stay on for the entire session — there is no mute or
          camera-off. The interview runs in fullscreen and is recorded for review. Leaving
          fullscreen, a second face or voice, a phone, screen sharing, or a virtual camera are
          flagged, and serious signals end the interview automatically.
        </Alert>
        <video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full rounded-lg bg-surface-muted" />
        {!media && <Button onClick={requestDevices} className="self-start">Enable camera & microphone</Button>}
        {err && <Alert tone="danger">{err}</Alert>}
        {media && <Alert tone="success">Camera and microphone are ready.</Alert>}
        <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
          <Checkbox className="mt-0.5" checked={ack} onCheckedChange={(v) => setAck(v === true)} disabled={!media} />
          <span>I understand this interview is strictly proctored — camera and microphone required, no mute, fullscreen-locked, recorded — and that serious integrity signals end it automatically.</span>
        </label>
        <Button disabled={!media || !ack} onClick={() => media && onReady(media)} className="self-start">
          Start interview
        </Button>
      </CardContent>
    </Card>
  );
}
```
- [ ] **Step 2:** Add `fakeStream()` (a small canvas → `captureStream()` helper) gated on `NEXT_PUBLIC_MOCK` so the pre-check passes offline.
- [ ] **Step 3: Verify** — `--filter @ip/candidate typecheck` clean.
- [ ] **Step 4: Commit** — `git commit -am "feat(interview): device pre-check + required acknowledgment (replaces optional consent)"`

### Task 7: Replace the interview page — the proctored room

Rewrite `frontend/apps/candidate/app/interview/[applicationId]/page.tsx` to compose pre-check → fullscreen-locked room. Phases: `precheck → live → ended`. On Start: request fullscreen, mint the rtc-token, connect the room (real or fake), publish tracks, start the **device** runtime (`startProctoring`) **and** the **vision + audio** detectors (all emitting through the same `proctor.send`), wire captions, and listen for `terminated` on the proctor ack.

- [ ] **Step 1:** Replace the file. Skeleton (full code in the executor pass — this is the load-bearing structure):
```tsx
"use client";
import { Button, Card, CardContent, Alert } from "@ip/ui";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { startProctoring, startVisionDetector, startAudioDetector, useRequireAuth, HttpError } from "@ip/shared";
import { interview, proctor, useAuth } from "../../../lib/auth";
import { DevicePrecheck } from "../../../components/device-precheck";
import { ProctorStatusStrip, type ProctorState } from "../../../components/proctor-status-strip";
import { InterviewCaptions } from "../../../components/interview-captions";
import { connectRoom, makeFakeRoom, type InterviewRoom } from "./rtc-room";
import { HIGH_SEVERITY } from "./types";

export default function InterviewPage() {
  const { token, ready } = useAuth();
  useRequireAuth(token, ready);
  const { applicationId } = useParams<{ applicationId: string }>();
  const [phase, setPhase] = useState<"precheck" | "live" | "ended">("precheck");
  const [endReason, setEndReason] = useState<string | null>(null);
  const [pstate, setPstate] = useState<ProctorState>({ oneFace: true, eyesOnScreen: true, fullscreen: true });
  const [captions, setCaptions] = useState<{ text: string; final: boolean }[]>([]);
  const room = useRef<InterviewRoom | null>(null);
  const detach = useRef<Array<() => void>>([]);

  // Proctor sink: every detector emits here. The ack carries `terminated` — a HIGH signal ends
  // the room. Severity is SERVER-assigned; the client never decides termination, it only obeys.
  async function sink(events, keepalive) {
    const ack = await proctor.send(applicationId, events, keepalive);  // returns ProctorAck (Task 8)
    const high = events.find((e) => HIGH_SEVERITY.includes(e.type));
    if (high) setPstate((s) => ({ ...s, recentFlag: { type: high.type, severity: "high" } }));
    if (ack?.terminated) endSession(ack.reason ?? "integrity");
  }

  function endSession(reason: string) {
    setEndReason(reason);
    setPstate((s) => ({ ...s, terminated: { reason } }));
    detach.current.forEach((d) => d());
    void room.current?.disconnect();
    if (document.fullscreenElement) void document.exitFullscreen();
    setPhase("ended");
  }

  async function onReady(media: MediaStream) {
    await document.documentElement.requestFullscreen().catch(() => {});  // fullscreen-lock
    const tok = await interview.rtcToken(applicationId);
    const r = process.env.NEXT_PUBLIC_MOCK === "1" ? makeFakeRoom(media) : await connectRoom(tok, media);
    room.current = r;
    r.onCaption((text, final) => setCaptions((c) => [...c, { text, final }]));
    // device/behavior runtime (built) + on-device vision + audio (new) → one sink
    detach.current.push(startProctoring({ send: sink }));
    detach.current.push(await startVisionDetector(media.getVideoTracks()[0], (t, m) => sink([{ type: t, at: new Date().toISOString(), meta: m }], false)));
    detach.current.push(await startAudioDetector(media.getAudioTracks()[0], (t, m) => sink([{ type: t, at: new Date().toISOString(), meta: m }], false)));
    // re-enter fullscreen if the candidate exits (flagged by the device runtime too)
    setPhase("live");
  }

  useEffect(() => () => { detach.current.forEach((d) => d()); void room.current?.disconnect(); }, []);
  if (!token) return null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      {phase === "precheck" && <DevicePrecheck onReady={onReady} />}
      {phase !== "precheck" && (
        <>
          <ProctorStatusStrip state={pstate} />
          {phase === "live" && (
            <Card><CardContent className="p-0">
              {/* interviewer video + self-view tile (room.localVideo); NO mute / NO camera-off controls */}
              <InterviewCaptions lines={captions} />
              <div className="flex items-center justify-between gap-2 p-3">
                <Alert tone="info" className="m-0">This interview is proctored and recorded.</Alert>
                <Button variant="outline" onClick={() => endSession("ended_by_candidate")}>End interview</Button>
              </div>
            </CardContent></Card>
          )}
          {phase === "ended" && (
            <Card><CardContent className="flex flex-col gap-3 p-6">
              <Alert tone={endReason === "ended_by_candidate" ? "success" : "danger"}>
                {endReason === "ended_by_candidate"
                  ? "Interview ended — your responses are being scored; check your tracker for the outcome."
                  : "This interview was ended automatically due to a serious integrity signal. The recruiter has been notified; check your tracker for the outcome."}
              </Alert>
            </CardContent></Card>
          )}
        </>
      )}
    </main>
  );
}
```
- [ ] **Step 2:** Create `frontend/apps/candidate/components/interview-captions.tsx` — a scrolling `role="log" aria-live="polite"` pane rendering `lines` (final lines solid, interim muted), mirroring the old text-interview log styling.
- [ ] **Step 3: Verify build + preview** — `NEXT_PUBLIC_MOCK=1 npx pnpm@9.15.0 --filter @ip/candidate build` clean; then via the preview loop: load `/interview/<id>`, confirm the pre-check shows the self-view (canvas in mock) + a **disabled** Start until the box is ticked, Start enters the room with captions ticking, the status strip shows the three chips, there is **no mute / no camera-off control**, and "End interview" returns the success state. Screenshot. (Confirm the page exits fullscreen on end — the fake path skips real fullscreen.)
- [ ] **Step 4: Commit** — `git commit -am "feat(interview): replace text interview with proctored video+voice room"`

### Task 8: Wire the proctor ack `terminated` flag through the client

`createProctorClient.send` currently returns `void`. The auto-gate needs the response body. Make `send` resolve the parsed ack (keeping the best-effort/non-blocking + 4xx-drop + keepalive-chunk behavior).

- [ ] **Step 1: Write the failing test** — extend the proctor client test: a 200 `{recorded, terminated:true, reason:"second_face"}` resolves an ack with `terminated===true`; a transient 5xx still re-throws (retry path unchanged); a 4xx still drops (returns `undefined`/no ack, no throw).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — in `frontend/packages/shared/src/proctor.ts`, parse and return the JSON ack on `res.ok` (type `ProctorAck`); leave the re-queue/throw on 5xx and the 4xx-drop exactly as today. Keepalive flushes (unload) ignore the ack (fire-and-forget) — only interval flushes read `terminated`.
- [ ] **Step 4: Run → PASS** + `--filter @ip/shared typecheck`.
- [ ] **Step 5: Commit** — `git commit -am "feat(proctor): surface terminated flag from /proctor ack"`

### Task 9: Add `livekit-client` + verify the full app

- [ ] **Step 1:** Add `livekit-client` to `frontend/apps/candidate/package.json` deps; `npx pnpm@9.15.0 install`. (MediaPipe is CDN-loaded — no package.)
- [ ] **Step 2: Verify** — `npx pnpm@9.15.0 --filter @ip/candidate build` + `--filter @ip/shared typecheck` green (against a **stopped** dev server — never `next build` while `pnpm dev` is live). Run the shared tests.
- [ ] **Step 3: Commit** — `git commit -am "chore(candidate): add livekit-client dependency"`

---

## C. States & acceptance

- **States:** `precheck` (device gate + required ack — Start disabled until camera+mic live **and** box ticked), `live` (room + captions + status strip), `ended` (clean → "scored, check tracker"; auto-terminated → "ended for a serious integrity signal, recruiter notified"). A `503` from `rtc-token` (LiveKit unconfigured) → an inline "voice interview not available right now" `Alert` with a Back link (no dead-end). Network failure on token mint → retry.
- **No-mute / no-camera-off (load-bearing):** the component tree has **no** mute or camera-toggle control — the published tracks stay enabled for the whole session. Controls are exactly **captions · end**. (Acceptance: grep the page + room tree — no `setEnabled(false)` / `mute` / `unpublish` of the local tracks except on `disconnect`.)
- **Fullscreen-lock:** Start requests fullscreen; exiting fullscreen emits `fullscreen_exit` (device runtime, already built) and the strip flips the Fullscreen chip to warning; the page attempts re-entry. (The fake path skips real fullscreen so the offline preview still runs.)
- **HIGH-severity auto-gate:** a HIGH event (`second_face`/`second_voice`/`phone_detected`/`screen_share`/`virtual_camera`/`synthetic_audio_suspected`) → the server stamps severity, sets `terminated_by_proctor`, returns `terminated=true`; the FE ends the room and shows the terminal state. **The client never decides termination** — it obeys the server ack (severity is server-authoritative).
- **Never-analyze-frames invariant (load-bearing):** `proctor-vision.ts` and `proctor-audio.ts` reduce MediaPipe results / audio buffers to derived `FaceObservation` / audio features **in-module** and forward **only typed events** via `proctor.send`. No frame, `ImageData`, `Blob`, base64, or PCM array is ever an argument to `emit` or reaches the network. (Acceptance: the privacy grep-test in Tasks 2–3; the only outward calls are `emit(type, meta)` with scalar meta.) The LiveKit session video is recorded **separately** server-side for human review — that recording path is the proctored-integrity Tier C deliverable, not this signal path.
- **Responsive:** the room is `max-w-3xl`; the self-view is a small tile over the interviewer video on mobile, side-by-side on wide; captions scroll within their pane.
- **Dark + tokens:** `@ip/ui` token classes only (`bg-surface-muted`, `text-foreground`, tone surfaces); any lucide icon used is imported in the candidate app.
- **A11y:** the status strip is `role="status" aria-live="polite"`; captions are `role="log" aria-live="polite"`; Start/End are real `<button>`s with disabled states; the pre-check video has a label and the ack is a real `<label>`+`Checkbox`.
- **Acceptance:** matches the `aptura_proctored_interview_room` mockup; **no "no-surveillance" copy** anywhere (the pivot removed it); `--filter @ip/candidate build` + `--filter @ip/shared typecheck` green; works against the mock today (`NEXT_PUBLIC_MOCK=1`: fake room, canvas stream, scripted captions, the proctoring loop runs end-to-end) and against LiveKit + the auto-gate once the ai-agents deltas land.
