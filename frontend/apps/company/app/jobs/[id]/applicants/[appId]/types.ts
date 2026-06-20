// FE-facing shapes for the enriched candidate report + integrity timeline. Field names
// are the camelCased protobuf-es projection (`integrity_score → integrityScore`). The
// report screen codes against these until the BE deltas (A1 GetIntegrityTimeline + A2
// enriched Report) land via `pnpm gen`.

export type Severity = "low" | "medium" | "high";
export type Recommendation = "advance" | "hold" | "reject";

// A2 — enriched report (superset of what report-view rendered before).
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

// A1 — integrity timeline (separate RPC, separate query).
export interface ProctorFlag {
  type: string;
  severity: Severity;
  at: string; // ISO
  meta: Record<string, string>;
}
export interface IntegrityTimeline {
  integrityScore: number;
  flags: ProctorFlag[];
  recordingUrl: string; // "" when none
  autoTerminated: boolean;
  terminatedReason: string;
}

// The HIGH-severity catalog (mirror of model/proctoring._SEVERITY) — for fixtures + labels.
export const HIGH_SIGNALS = [
  "second_face",
  "second_voice",
  "phone_detected",
  "screen_share",
  "virtual_camera",
  "synthetic_audio_suspected",
] as const;
