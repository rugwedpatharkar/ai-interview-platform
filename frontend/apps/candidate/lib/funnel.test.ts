// Spec for the pure funnel mapping. Encodes every case from the dashboard plan (Task 1).

import { it } from "vitest";

import { expectEqual } from "../test-harness.js";
import { funnelStage, FUNNEL_STEPS } from "./funnel.js";

it("has four canonical steps", () => {
  expectEqual("FUNNEL_STEPS", [...FUNNEL_STEPS], ["Applied", "Aptitude", "Interview", "Decision"]);
});

it("maps progress states to a step index", () => {
  expectEqual("applied.index", funnelStage("applied").index, 0);
  expectEqual("aptitude_pending.index", funnelStage("aptitude_pending").index, 1);
  expectEqual("interview_pending.index", funnelStage("interview_pending").index, 2);
  expectEqual("interview_in_progress.index", funnelStage("interview_in_progress").index, 2);
  expectEqual("interviewed.index", funnelStage("interviewed").index, 3);
  expectEqual("scored.index", funnelStage("scored").index, 3);
  expectEqual("shortlisted.index", funnelStage("shortlisted").index, 3);
  expectEqual("hired.index", funnelStage("hired").index, 3);
});

it("flags ended states so the card can de-emphasise the bar", () => {
  expectEqual("hired.ended", funnelStage("hired").ended, true);
  expectEqual("rejected.ended", funnelStage("rejected").ended, true);
  expectEqual("gated_out.ended", funnelStage("gated_out").ended, true);
  expectEqual("withdrawn.ended", funnelStage("withdrawn").ended, true);
  expectEqual("applied.ended", funnelStage("applied").ended, false);
});

it("marks negative outcomes so the bar isn't drawn as success", () => {
  expectEqual("rejected.negative", funnelStage("rejected").negative, true);
  expectEqual("gated_out.negative", funnelStage("gated_out").negative, true);
  expectEqual("hired.negative", funnelStage("hired").negative, false);
});

it("falls back to step 0 for an unknown state", () => {
  expectEqual("unknown.index", funnelStage("__nope__").index, 0);
  expectEqual("unknown.ended", funnelStage("__nope__").ended, false);
});
