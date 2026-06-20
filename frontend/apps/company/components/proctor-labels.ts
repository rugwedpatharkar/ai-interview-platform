// Proctoring signal → human label + severity helpers, app-local (labels are a UI concern,
// not a wire contract). Severity is server-authoritative; these are presentation only.

export const SEVERITY_ORDER = ["high", "medium", "low"] as const;

const LABELS: Record<string, string> = {
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

export const signalLabel = (type: string) => LABELS[type] ?? type.replace(/_/g, " ");

export const severityTone = (s: string) =>
  s === "high" ? "danger" : s === "medium" ? "warning" : "neutral";
