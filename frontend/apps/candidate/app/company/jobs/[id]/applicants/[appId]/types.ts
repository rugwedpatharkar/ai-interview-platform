// FE-facing shapes for the enriched candidate report + integrity timeline. Field names
// are the camelCased protobuf-es projection. The report screen codes against these
// until the BE deltas (A1 GetIntegrityTimeline + A2 enriched Report) land via `pnpm gen`.

export type Severity = "low" | "medium" | "high";
export type Recommendation = "advance" | "hold" | "reject";

export interface Evidence {
  quote: string;
  note: string;
}
export interface Competency {
  competency: string;
  score: number; // 0..1
  rationale: string;
  evidence: Evidence[];
}
export interface ReportDTO {
  applicationId: string;
  state: string;
  executiveSummary: string;
  highlights: string[];
  risks: string[];
  overallScore: number; // 0..1
  recommendation: string;
  competencies: Competency[]; // [] for legacy reports
  integrityScore: number; // 0 for legacy
  integrityFlagCount: number;
  autoTerminated: boolean;
}

export interface ProctorFlag {
  type: string;
  severity: Severity;
  at: string; // ISO
  meta: Record<string, string>;
}
export interface IntegrityTimeline {
  integrityScore: number;
  flags: ProctorFlag[];
  recordingUrl: string;
  autoTerminated: boolean;
  terminatedReason: string;
}

// HIGH-severity catalog (mirror of model/proctoring._SEVERITY) — for fixtures + labels.
export const HIGH_SIGNALS = [
  "second_face",
  "second_voice",
  "phone_detected",
  "screen_share",
  "virtual_camera",
  "synthetic_audio_suspected",
] as const;

const SIGNAL_LABELS: Record<string, string> = {
  second_face: "Second person detected",
  second_voice: "Second voice detected",
  phone_detected: "Phone detected",
  screen_share: "Screen sharing",
  virtual_camera: "Virtual camera",
  synthetic_audio_suspected: "Synthetic audio suspected",
  gaze_off_screen: "Looked away from screen",
  head_turned_away: "Head turned away",
  camera_occluded: "Camera covered",
  body_out_of_frame: "Out of frame",
  lips_move_no_audio: "Lips moving, no audio",
  multi_monitor: "Second monitor",
  tab_hidden: "Switched tab",
  window_blur: "Left the window",
  fullscreen_exit: "Exited fullscreen",
  copy: "Copied text",
  paste_large: "Pasted large text",
  devtools_open: "Opened dev tools",
  keystroke_anomaly: "Keystroke anomaly",
  ip_geo_anomaly: "Location anomaly",
  keyboard_typing: "Background typing",
};

export const signalLabel = (type: string) =>
  SIGNAL_LABELS[type] ?? type.replace(/_/g, " ");
