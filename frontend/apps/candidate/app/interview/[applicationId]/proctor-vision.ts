// On-device visual proctoring detector — the never-analyze-frames invariant.
//
// `classifyFaces` is PURE: it receives derived booleans/counts (FaceObservation) and emits
// ONLY typed events. No ImageData, frame, Blob, base64, or pixel ever crosses this boundary —
// the sole outward call is `emit(type, meta)` with scalar meta. This is the load-bearing
// privacy invariant for the proctored room.
//
// `startVisionDetector` is the browser-only attach seam the page consumes
// (`(track, emit) => stop()`). Today it is a STUB that emits nothing — the page renders +
// the proctoring loop runs offline without a camera or any new dependency.
//
// DEFERRED FOLLOW-UP (needs a browser + the shared lockfile, out of scope this round):
// wire MediaPipe FaceMesh from CDN here — load it via dynamic import in `startVisionDetector`,
// run inference on the camera track on-device, reduce each `results` (which DO contain
// landmarks/pixels) to a FaceObservation IN THIS MODULE, and feed `classifyFaces`. Only typed
// events leave; the model + frames stay on-device. The contract the page depends on
// (`startVisionDetector(track, emit) => stop()`, typed events only) does not change.

import type { ProctorSignalType } from "./types";

export interface FaceObservation {
  faces: number;
  gazeOffCenter: boolean;
  occluded: boolean;
}

type Emit = (type: ProctorSignalType, meta?: Record<string, unknown>) => void;

const GAZE_RUN = 5; // consecutive off-center frames before flagging (~1s at 5fps debounce)
const OCCLUDE_RUN = 5;

// PURE: observations → typed events. Receives derived booleans/counts ONLY — never pixels.
// A sustained run (not a single frame) gates gaze/occlusion so a momentary glance away or a
// flicker doesn't flag; a second face or an empty frame flags immediately.
export function classifyFaces(obs: FaceObservation[], emit: Emit): void {
  let gaze = 0;
  let occl = 0;
  for (const o of obs) {
    if (o.faces >= 2) emit("second_face", { faces: o.faces });
    if (o.faces === 0) emit("body_out_of_frame");
    gaze = o.gazeOffCenter ? gaze + 1 : 0;
    if (gaze === GAZE_RUN) emit("gaze_off_screen", { frames: gaze });
    occl = o.occluded ? occl + 1 : 0;
    if (occl === OCCLUDE_RUN) emit("camera_occluded");
  }
}

// Browser-only attach seam. STUB until the deferred MediaPipe wiring lands (see file header):
// it acquires nothing and emits nothing, returning a no-op stop(). The page calls this with
// the live camera track + a typed-event sink; swapping in the real FaceMesh loop is a change
// confined to this function — the page contract is unchanged.
export async function startVisionDetector(
  _track: MediaStreamTrack,
  _emit: Emit,
): Promise<() => void> {
  return () => {};
}
