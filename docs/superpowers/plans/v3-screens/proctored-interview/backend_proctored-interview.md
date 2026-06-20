# Backend — `proctored-interview` (Midnight v3)

> **Screen:** Proctored interview room · **FE consumer:** [`frontend_proctored-interview.md`](./frontend_proctored-interview.md)
> **Status:** **EXISTING — reuse the interview gRPC + the HIGH-severity auto-gate.** Restated from [`../../v2-screens/proctored-interview.md`](../../v2-screens/proctored-interview.md) §A. **No proto delta, no new collection** introduced by this redesign — the v2 interview contract is the source of truth. The Midnight redesign is appearance-only.
> **Real-vs-mock today:** **LiveKit (RTC) + MediaPipe (on-device vision/audio) are fake/stubbed seams today** — `connectRoom`/`makeFakeRoom` (`rtc-room.ts`) and `proctor-vision.ts`/`proctor-audio.ts` run end-to-end against a canvas stream + scripted captions under `NEXT_PUBLIC_MOCK`; real wiring is deferred. `recordProctorEvents` is consumed today; the `terminated`/`reason` ack fields are read **defensively** (the page already honours the server terminate the moment the backend delta lands — no client change). The reskin changes **markup/classes only**.

## Functionalities
- **Mint an RTC token** so the candidate joins the proctored room (camera **+** mic, video granted).
- **Ingest typed proctoring events** (device + on-device vision/audio detectors) — **never raw frames/audio**.
- **HIGH-severity auto-gate:** a HIGH event makes the server stamp severity, set `terminated_by_proctor`, and return `terminated=true` (+ `reason`); the room ends and shows the terminal state. **The client never decides termination — it obeys the server ack.**

## Service & RPCs (`admin` interview gRPC-web + ai-agents REST; bearer = candidate token, candidate-owned)
| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| RTC token | `api.interview.rtcToken({applicationId})` → `{url, token, room}` | bearer; owner (`403` not your interview); `UNAVAILABLE` = voice not configured |
| Record proctor events | `api.interview.recordProctorEvents({applicationId, events[]})` → `ProctorAccepted` (+ `terminated`/`reason` ack) | bearer; owner; **severity stamped server-side** (client can't spoof) |

FE clients: `api.interview.rtcToken` / `api.interview.recordProctorEvents` (`frontend/apps/candidate/lib/auth.tsx`). Each typed signal maps to the gRPC `ProctorEvent{type, at, metaJson}` (scalar meta only).

## Request / Response structures
```ts
// rtcToken — the FE calls room.connect(url, token) (LiveKit; fake in mock).
export interface RtcToken { url: string; token: string; room: string; }
// recordProctorEvents ack delta (read defensively until the backend delta lands).
export interface ProctorAck { recorded: number; terminated: boolean; reason?: string; }
// HIGH-severity types that auto-terminate. SERVER is authoritative — this client mirror drives
// OPTIMISTIC UI ONLY, never enforcement.
export const HIGH_SEVERITY = [
  "second_face", "second_voice", "phone_detected",
  "screen_share", "virtual_camera", "synthetic_audio_suspected",
] as const;
```
- **`rtcToken`** — path `applicationId`, no body; `{url, token, room}`; the minted JWT already carries `VideoGrant{room_join, room}` (video granted today).
- **`recordProctorEvents`** — `{events: [{type, at, metaJson}]}` — **typed events only, never media bytes** (the DTO has no frame/audio field). Ack carries `recorded`; the auto-gate adds `terminated` (+ `reason`). Severity is server-assigned via `severity_of(type)`; a client-sent severity is ignored.
- **FE mock shape:** `RtcToken` / `ProctorAck` / `HIGH_SEVERITY` (`frontend/apps/candidate/app/interview/[applicationId]/types.ts`) — identical to today; the reskin does not touch them.

## Data required
- `proctoring_events` (append-only; indexed `(application_id)` + `(comp_id, application_id)`) — **unchanged**. The terminate sets the session's `terminated_by_proctor` + reason and routes through the interview **finalize** path (`proctor_terminated` outcome). The live **transcript path is unchanged** — proctoring is a parallel signal channel, not in the scoring path.

## Errors & edge cases
- `UNAVAILABLE` from `rtcToken` (LiveKit unconfigured / `503`) → an inline "live interview not available right now" `Alert` with a Back link (no dead-end) — preserve.
- `FAILED_PRECONDITION` on start → terminal ended state (no resume).
- `INVALID_ARGUMENT` on a proctor batch → drop the batch (don't re-queue forever); transient failures retry — the runtime's 4xx-drop / 5xx-retry split.
- `terminated=true` on a non-keepalive ack → the room ends and shows "ended automatically due to a serious integrity signal; recruiter notified."

## Cross-references
- Shared contract: [`../../v2-screens/proctored-interview.md`](../../v2-screens/proctored-interview.md) §A (rtc-token, the proctor ingest + auto-gate, the never-analyze-frames invariant, the HIGH set).
- Shared enum/event: `ProctoringEventType` catalog (B/C/D) + the `proctor_terminated` / `interview.completed` funnel outcome.
- Stubbed seams (deferred real wiring): LiveKit (`rtc-room.ts`), MediaPipe FaceMesh (`proctor-vision.ts`), Web Audio VAD (`proctor-audio.ts`).
