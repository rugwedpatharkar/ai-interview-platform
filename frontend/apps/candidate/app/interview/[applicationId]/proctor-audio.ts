// On-device audio proctoring detector — VAD / diarization-lite, never-leak-audio invariant.
//
// `classifyAudio` is PURE: it receives derived per-frame audio FEATURES (energy + a coarse
// spectral-flatness/second-speaker cue) and emits ONLY typed events. No PCM, no Float32Array,
// no sample buffer ever crosses this boundary — the sole outward call is `emit(type, meta)`
// with scalar meta. Counts/detection only; no voiceprint identity is computed or stored.
//
// `startAudioDetector` is the browser-only attach seam (`(track, emit) => stop()`). Today it
// is a STUB that emits nothing — the page renders + the proctoring loop runs offline without a
// microphone or any new dependency.
//
// DEFERRED FOLLOW-UP (needs a browser, out of scope this round): wire Web Audio in
// `startAudioDetector` — an AnalyserNode on the mic track, reduce each analysis window to the
// AudioFeature scalars IN THIS MODULE (the raw Float32Array never leaves), and feed
// `classifyAudio`. Only typed events leave. The page contract
// (`startAudioDetector(track, emit) => stop()`, typed events only) does not change.

import type { ProctorSignalType } from "./types";

export interface AudioFeature {
  // RMS energy of the window, normalized 0..1 (silence ≈ 0, speech well above the floor).
  energy: number;
  // A second concurrent speaker was detected in this window (overlap / distinct signature).
  secondSpeaker: boolean;
  // Spectral flatness high + over-regular cadence — a coarse synthetic/replayed-audio cue.
  synthetic: boolean;
  // Transient broadband clicks consistent with keyboard typing over the voice channel.
  typing: boolean;
}

type Emit = (type: ProctorSignalType, meta?: Record<string, unknown>) => void;

const SPEECH_FLOOR = 0.05; // below this the window is treated as silence (no cues emitted)
const TYPING_RUN = 4; // consecutive typing-cue windows before flagging (debounce)

// PURE: audio features → typed events. Receives derived scalars/booleans ONLY — never PCM.
// Silence is skipped so room tone doesn't trip the cues; a second voice or a synthetic cue
// flags immediately; typing flags only on a sustained run.
export function classifyAudio(frames: AudioFeature[], emit: Emit): void {
  let typingRun = 0;
  for (const f of frames) {
    if (f.energy < SPEECH_FLOOR) {
      typingRun = 0;
      continue;
    }
    if (f.secondSpeaker) emit("second_voice");
    if (f.synthetic) emit("synthetic_audio_suspected");
    typingRun = f.typing ? typingRun + 1 : 0;
    if (typingRun === TYPING_RUN) emit("keyboard_typing", { windows: typingRun });
  }
}

// Browser-only attach seam. STUB until the deferred Web Audio wiring lands (see file header):
// it acquires nothing and emits nothing, returning a no-op stop(). Swapping in the real
// AnalyserNode loop is confined to this function — the page contract is unchanged.
export async function startAudioDetector(
  _track: MediaStreamTrack,
  _emit: Emit,
): Promise<() => void> {
  return () => {};
}
