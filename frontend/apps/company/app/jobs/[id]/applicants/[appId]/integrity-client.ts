import type { IntegrityTimeline, ProctorFlag } from "./types";
import { HIGH_SIGNALS } from "./types";

// Flip on to render the integrity band against fixtures before A1 (GetIntegrityTimeline)
// lands. The page reads this to choose the mock vs the real RPC.
export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

export function makeMockIntegrityClient() {
  return async (applicationId: string): Promise<IntegrityTimeline> => {
    // A representative mixed timeline: a couple LOW/MED + one HIGH (drives the terminated state).
    const flags: ProctorFlag[] = [
      { type: "tab_hidden", severity: "low" as const, at: "2026-06-20T10:01:04Z", meta: {} },
      {
        type: "gaze_off_screen",
        severity: "low" as const,
        at: "2026-06-20T10:03:22Z",
        meta: {},
      },
      {
        type: "camera_occluded",
        severity: "medium" as const,
        at: "2026-06-20T10:06:10Z",
        meta: {},
      },
      {
        type: "second_face",
        severity: "high" as const,
        at: "2026-06-20T10:08:41Z",
        meta: { faces: "2" },
      },
    ];
    const auto = flags.some((f) =>
      HIGH_SIGNALS.includes(f.type as (typeof HIGH_SIGNALS)[number]),
    );
    return {
      integrityScore: 1 + 1 + 3 + 8, // mirror the weighted sum
      flags,
      recordingUrl: applicationId ? "https://example.invalid/recording.mp4" : "",
      autoTerminated: auto,
      terminatedReason: auto ? "second_face" : "",
    };
  };
}
