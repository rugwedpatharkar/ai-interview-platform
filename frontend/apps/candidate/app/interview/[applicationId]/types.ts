// Contract shapes + the on-device proctoring catalog for the strict proctored room.
//
// These live in the candidate app (not @ip/shared) on purpose: this round owns the
// candidate app only, and the room is built against these typed seams so it typechecks
// and renders offline. The gRPC interview client already grants `rtcToken` + accepts
// `recordProctorEvents`; the HIGH-severity auto-gate `terminated` flag is a backend delta
// that has not landed in the generated `ProctorAccepted` message yet (it carries only
// `accepted`). Until it does, the room reads `terminated` from this local ack mirror and
// the HIGH_SEVERITY set drives optimistic UI — the SERVER stays authoritative for the real
// terminate (see the note on ProctorAck below).

// ── RTC token (mirrors aiagents.interview.v1.RtcTokenResponse) ──────────────────────────
export interface RtcToken {
  url: string;
  token: string;
  room: string;
}

// ── Proctor ack (mirrors the EVOLVE delta on RecordProctorEvents) ───────────────────────
// The generated `ProctorAccepted` is `{ accepted: number }` today. `terminated`/`reason`
// are the not-yet-generated auto-gate fields; this mirror lets the room handle them now and
// stays forward-compatible (a real ack is read defensively, never spoofed by the client).
export interface ProctorAck {
  accepted: number;
  terminated: boolean;
  reason?: string;
}

// HIGH-severity types that auto-terminate. Client-side mirror of the server `_SEVERITY` HIGH
// set — ONLY for optimistic UI, never for enforcement (the server stamps severity + decides
// the terminate; the client obeys the ack).
export const HIGH_SEVERITY = [
  "second_face",
  "second_voice",
  "phone_detected",
  "screen_share",
  "virtual_camera",
  "synthetic_audio_suspected",
] as const;

// ── On-device proctoring catalog ────────────────────────────────────────────────────────
// Full B (visual) + C (audio) + D (device/behavior) catalog, mirroring the backend source of
// truth (ai-agents app/model/proctoring.py). The D types match @ip/shared's ProctorEventType;
// the B/C types are the on-device-detector signals this room adds. SIGNALS ONLY — no camera/
// mic frames or audio ever leave the device; HIGH signals auto-terminate (server-decided).
export type ProctorSignalType =
  // B — visual (browser-edge; no raw frames ever leave the device)
  | "gaze_off_screen"
  | "head_turned_away"
  | "lips_move_no_audio"
  | "audio_no_lip_move"
  | "body_out_of_frame"
  | "second_face"
  | "phone_detected"
  | "camera_occluded"
  | "virtual_camera"
  // C — audio (counts/detection only; no voiceprint identity)
  | "second_voice"
  | "keyboard_typing"
  | "synthetic_audio_suspected"
  // D — device / behavior (already shipped via @ip/shared startProctoring)
  | "tab_hidden"
  | "window_blur"
  | "fullscreen_exit"
  | "copy"
  | "paste_large"
  | "devtools_open"
  | "multi_monitor"
  | "screen_share"
  | "keystroke_anomaly"
  | "ip_geo_anomaly";

// Severity bucket for a signal, mirrored from the server HIGH set (LOW/MED are not surfaced
// distinctly client-side beyond "not HIGH").
export type Severity = "low" | "medium" | "high";

const HIGH_SET = new Set<string>(HIGH_SEVERITY);

/** Optimistic client-side severity for a signal type. The server is authoritative. */
export function severityOf(type: string): Severity {
  return HIGH_SET.has(type) ? "high" : "medium";
}

/** A typed proctoring event as emitted by a detector and sent to the gRPC sink. */
export interface ProctorSignal {
  type: ProctorSignalType;
  at: string; // client ISO timestamp
  meta?: Record<string, unknown>;
}
