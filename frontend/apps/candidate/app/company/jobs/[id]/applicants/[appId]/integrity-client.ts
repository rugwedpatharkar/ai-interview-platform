import type { IntegrityTimeline, ProctorFlag } from "./types";
import { HIGH_SIGNALS } from "./types";

// Flip on to render the integrity band against fixtures before A1
// (GetIntegrityTimeline) lands. The page reads this to choose mock vs. real RPC.
export const USE_MOCK = process.env.NEXT_PUBLIC_MOCK === "1";

export function makeMockIntegrityClient() {
  return async (applicationId: string): Promise<IntegrityTimeline> => {
    const flags: ProctorFlag[] = [
      { type: "tab_hidden", severity: "low", at: "2026-06-20T10:01:04Z", meta: {} },
      { type: "gaze_off_screen", severity: "low", at: "2026-06-20T10:03:22Z", meta: {} },
      { type: "camera_occluded", severity: "medium", at: "2026-06-20T10:06:10Z", meta: {} },
      { type: "second_face", severity: "high", at: "2026-06-20T10:08:41Z", meta: { faces: "2" } },
    ];
    const auto = flags.some((f) =>
      HIGH_SIGNALS.includes(f.type as (typeof HIGH_SIGNALS)[number]),
    );
    return {
      // Mirror the weighted-sum the server uses (1+1+3+8 in this fixture).
      integrityScore: 13,
      flags,
      recordingUrl: applicationId ? "https://example.invalid/recording.mp4" : "",
      autoTerminated: auto,
      terminatedReason: auto ? "second_face" : "",
    };
  };
}
