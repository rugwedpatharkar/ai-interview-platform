// Spec for the pure funnel mapping. Encodes every case from the dashboard plan
// (Task 1). The frontend monorepo has no test runner wired, and pulling vitest into
// this app would churn the shared root lockfile while a backend session shares the
// working tree — so this stays a zero-dependency harness: it typechecks under the
// app's tsconfig (`**/*.ts`) and runs standalone via `npx tsx lib/funnel.test.ts`.

import { funnelStage, FUNNEL_STEPS } from "./funnel.js";

let failures = 0;

function expectEqual<T>(label: string, actual: T, expected: T): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(`✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// has four canonical steps
expectEqual("FUNNEL_STEPS", [...FUNNEL_STEPS], ["Applied", "Aptitude", "Interview", "Decision"]);

// maps progress states to a step index
expectEqual("applied.index", funnelStage("applied").index, 0);
expectEqual("aptitude_pending.index", funnelStage("aptitude_pending").index, 1);
expectEqual("interview_pending.index", funnelStage("interview_pending").index, 2);
expectEqual("interview_in_progress.index", funnelStage("interview_in_progress").index, 2);
expectEqual("interviewed.index", funnelStage("interviewed").index, 3);
expectEqual("scored.index", funnelStage("scored").index, 3);
expectEqual("shortlisted.index", funnelStage("shortlisted").index, 3);
expectEqual("hired.index", funnelStage("hired").index, 3);

// flags ended states (terminal / gated / rejected) so the card can de-emphasise the bar
expectEqual("hired.ended", funnelStage("hired").ended, true);
expectEqual("rejected.ended", funnelStage("rejected").ended, true);
expectEqual("gated_out.ended", funnelStage("gated_out").ended, true);
expectEqual("withdrawn.ended", funnelStage("withdrawn").ended, true);
expectEqual("applied.ended", funnelStage("applied").ended, false);

// marks negative outcomes so the bar isn't drawn as success
expectEqual("rejected.negative", funnelStage("rejected").negative, true);
expectEqual("gated_out.negative", funnelStage("gated_out").negative, true);
expectEqual("hired.negative", funnelStage("hired").negative, false);

// unknown state falls back to step 0, not ended, not negative
expectEqual("unknown.index", funnelStage("__nope__").index, 0);
expectEqual("unknown.ended", funnelStage("__nope__").ended, false);

if (failures > 0) {
  console.error(`\nfunnel.test: ${failures} assertion(s) failed`);
  process.exit(1);
} else {
  console.log("funnel.test: all assertions passed");
}
