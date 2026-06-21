# Interview lobby — Backend contract (v3 · frozen)

> **Screen.** `/interview/[applicationId]/lobby` — device check, ID match, environment scan, and
> explicit ack **before** the candidate enters the live proctored room. **FE consumer:**
> [`frontend_interview-lobby.md`](./frontend_interview-lobby.md).
> **Status:** `EXISTING — reuse the interview gRPC + the HIGH-severity auto-gate.` Restated from
> [`../proctored-interview/backend_proctored-interview.md`](../proctored-interview/backend_proctored-interview.md)
> §A. **No proto delta, no new collection, no new event type.** The lobby is a UI gate; it
> consumes the same `rtcToken` + `recordProctorEvents` RPCs the live room uses today, with
> two new **event-type literals** carried inside the existing `ProctorEvent { type, at,
> metaJson }` envelope (`id_check_passed` / `id_check_failed` / `env_check_complete`).
> These are normal event types (not a new RPC, not a new schema); the recruiter's integrity
> timeline displays them as low-severity lobby checks. The HIGH_SEVERITY list is **unchanged**.
> **Anti-fiction reminder:** Aptura is pre-launch. The lobby's warning copy is the truthful
> language from [`_design-language.md`](../_design-language.md) §Anti-fiction — no fabricated
> proctoring claims ("we detect 1000+ signals", "100% identity assurance"). The lobby
> emits ONLY typed events with scalar meta — no raw frames, no media bytes (the DTO has no
> media-bearing field). See the anti-fiction rule in
> [`_design-language.md`](../_design-language.md).
> **Real-vs-mock today.** LiveKit (RTC) + MediaPipe (on-device vision/audio) are **fake/stubbed**
> seams — the lobby reuses the same `connectRoom` / `makeFakeRoom` and `proctor-vision.ts` /
> `proctor-audio.ts` primitives the live room uses today under `NEXT_PUBLIC_MOCK`. Real wiring
> is deferred. `recordProctorEvents` is consumed today; the lobby's new event types are
> appended to the existing catalog with `severity_of()` defaulting to `low`.

## Strict-proctored invariants — what the backend enforces

- **`rtcToken` is the only path to a token.** The lobby mints a token by calling
  `api.interview.rtcToken({ applicationId })` — same RPC the live room uses today. The server
  returns `UNAVAILABLE` if voice/RTC isn't configured (`503`); the FE renders an inline alert.
- **`recordProctorEvents` is the only event sink.** The lobby's events (ID check + environment
  scan) go through the same RPC; severity is **server-stamped** via `severity_of(type)` —
  client-sent severity is ignored.
- **HIGH_SEVERITY list is unchanged.** The lobby emits ONLY low-severity events
  (`id_check_passed` / `id_check_failed` / `env_check_complete`); none of these are in the
  HIGH set; none trigger auto-termination. Auto-termination is reserved for the live room.
- **Frame bytes never leave the device.** The lobby's ID match (selfie + liveness) and
  environment scan run **in-module** using the existing `proctor-vision.ts` / `proctor-audio.ts`
  primitives, which reduce frames/audio to derived signals and emit ONLY typed events. The
  DTO has no frame / ImageData / Blob / base64 / PCM field — see the never-leaves invariant
  in the proctored-interview contract.

## Functionalities (what the backend provides for this page)

- **Mint an RTC token** for the live room — called only after all lobby gates pass + the
  candidate clicks Start.
- **Ingest typed lobby-check events** — `id_check_passed` / `id_check_failed` /
  `env_check_complete`, scalar meta only, through the existing event sink.
- *(Implicit)* expose the application title (`jobTitle` / `companyName`) for the top-strip
  label via the dashboard's existing `["applications"]` cache — no new fetch.

## Service & RPCs (`admin` interview gRPC-web + ai-agents REST; bearer = candidate token,
candidate-owned)

| Function | RPC / endpoint | Auth/scope |
|---|---|---|
| RTC token | `api.interview.rtcToken({applicationId})` → `RtcToken{url, token, room}` | bearer; owner (`403` not your interview); `UNAVAILABLE` = voice/RTC not configured |
| Record proctor events | `api.interview.recordProctorEvents({applicationId, events[]})` → `ProctorAck` (+ `terminated` / `reason` ack) | bearer; owner; **severity stamped server-side** (client can't spoof) |

> **No new RPC.** The lobby consumes the same two RPCs the live room consumes. The lobby's
> new event types are appended to the existing `ProctoringEventType` catalog with
> `severity_of()` defaulting to `low`. Recruiter-side integrity timeline displays them as
> low-severity lobby checks alongside the live-room events.

## Request / Response structures (preserved verbatim from proctored-interview)

```ts
// rtcToken — the FE calls room.connect(url, token) (LiveKit; fake under NEXT_PUBLIC_MOCK).
export interface RtcToken { url: string; token: string; room: string; }

// recordProctorEvents ack delta (read defensively).
export interface ProctorAck { recorded: number; terminated: boolean; reason?: string; }

// ProctorEvent envelope (unchanged) — the lobby emits these types:
//   "id_check_passed"     // low — emitted on selfie+liveness pass
//   "id_check_failed"     // low — emitted on selfie+liveness fail (allows retry; doesn't gate Start)
//   "env_check_complete"  // low — emitted once all 4 env-scan tiles have a state
//
// metaJson: scalar map only — no media bytes. Examples:
//   id_check_passed: { confidence: "0.92" }
//   id_check_failed: { confidence: "0.31", reason: "no_blink_detected" }
//   env_check_complete: { lighting: "good", noise: "warn", headphones: "good", network: "good" }

// HIGH-severity types that auto-terminate. SERVER is authoritative — this client mirror
// drives OPTIMISTIC UI ONLY, never enforcement. UNCHANGED — the lobby's new event types
// are NOT in this set.
export const HIGH_SEVERITY = [
  "second_face",
  "second_voice",
  "phone_detected",
  "screen_share",
  "virtual_camera",
  "synthetic_audio_suspected",
] as const;
```

- **`rtcToken`** — path `applicationId`, no body; returns `{url, token, room}`. The lobby
  calls this ONCE per Start click, only after all gates pass. The minted JWT carries
  `VideoGrant{room_join, room}` (video granted today).
- **`recordProctorEvents`** — typed events only, never media bytes (DTO has no
  frame / audio field). Ack carries `recorded`; the auto-gate adds `terminated` (+
  optional `reason`) — though no lobby event triggers termination today (none are in
  HIGH_SEVERITY).
- **FE mock shape:** none new. The lobby reuses
  `app/interview/[applicationId]/types.ts` (`RtcToken` / `ProctorAck` / `HIGH_SEVERITY`) —
  identical to today.

## Data required

- **Read:** the application's title + company (already in the dashboard's `["applications"]`
  cache — no new fetch).
- **Write:** `proctoring_events` (append-only; indexed `(application_id)` +
  `(comp_id, application_id)`) — **unchanged**. The lobby's new event types append to the
  same collection with `severity_of()` defaulting to `low`.
- **Derived (FE, no backend):** all five lobby region states (device-check pending/live/error,
  ID-check pending/pass/fail, env-scan per-tile state, ack ticked, Start enabled) — pure
  React state inside the lobby component.
- **Indexes:** none new (existing `proctoring_events` indexes cover the lobby's reads from
  the recruiter side).

## Errors & edge cases

- **Auth:** missing/invalid bearer → `UNAUTHENTICATED`; non-candidate role →
  `PERMISSION_DENIED`; candidate calling `rtcToken` for an application that isn't theirs →
  `PERMISSION_DENIED` (`403 not your interview`).
- **`UNAVAILABLE` from `rtcToken`** (LiveKit unconfigured / `503`) → inline `<Alert
  tone="warn">` ("Live interview not available right now. Please try again shortly.") + a
  "Try again" `.btn.btn-ghost`. The lobby does NOT dead-end; the candidate can navigate
  back to the dashboard.
- **`FAILED_PRECONDITION` on `rtcToken`** (e.g., application not in
  `interview_pending` / `interview_in_progress`) → inline `<Alert tone="warn">` ("Your
  interview isn't ready to start yet.") + a "Back to application" `.btn.btn-ghost`.
- **`getUserMedia` denied or unsupported** → inline `<Alert tone="danger">` with
  troubleshooting copy; Start stays disabled.
- **ID check fails** → typed `id_check_failed` event emitted; inline `<Alert tone="warn">` +
  retry; Start stays disabled.
- **Environment scan warns** (any tile) → tile renders yellow border + "Recommended"
  language; **does not block Start** (advisory only). The typed `env_check_complete` event
  is still emitted so the recruiter side sees the lobby's environment summary.
- **Event sink failure** (`UNAVAILABLE` / network) → the runtime's existing 4xx-drop /
  5xx-retry split applies; transient failures retry, hard `INVALID_ARGUMENT` drops the
  batch. The lobby does not block Start on a sink failure (the live room will re-emit the
  same gate signals on join).

## Cross-references

- Shared contract: [`../proctored-interview/backend_proctored-interview.md`](../proctored-interview/backend_proctored-interview.md)
  §A (rtc-token, the proctor ingest + auto-gate, the never-analyze-frames invariant, the
  HIGH set) — the lobby is a UI gate on top of the same RPCs.
- Shared enum: `ProctoringEventType` catalog — the lobby's new event types
  (`id_check_passed` / `id_check_failed` / `env_check_complete`) append to this catalog;
  `severity_of()` defaults to `low` for all three.
- Downstream surface: [`../applicant-report/backend_applicant-report.md`](../applicant-report/backend_applicant-report.md)
  — the recruiter's integrity timeline displays the lobby's typed events alongside the
  live room's events.
- Sibling screen (post-interview): [`../interview-completed/backend_interview-completed.md`](../interview-completed/backend_interview-completed.md)
  — the candidate's post-interview confirmation surface; reuses the same Application
  shape.
- Sibling screen (deep-link upstream): [`../candidate-dashboard/backend_candidate-dashboard.md`](../candidate-dashboard/backend_candidate-dashboard.md)
  — the dashboard's "Start interview" action navigates to the lobby (one-line href change
  in the FE plan; no backend change).
- Sibling screen (deep-link upstream): [`../application-detail/backend_application-detail.md`](../application-detail/backend_application-detail.md)
  — the timeline's "Start interview" action navigates to the lobby (same one-line FE
  change).
- Stubbed seams (deferred real wiring): LiveKit (`rtc-room.ts`), MediaPipe FaceMesh
  (`proctor-vision.ts`), Web Audio VAD (`proctor-audio.ts`) — all reused by the lobby.
- Design language: [`../_design-language.md`](../_design-language.md) — see the
  strict-proctored item under "Mandatory revamp rule".
