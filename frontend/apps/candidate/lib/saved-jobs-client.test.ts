// Spec for the in-memory saved-jobs client. Zero-dependency harness (no test runner is
// wired in this monorepo, and adding vitest would churn the shared lockfile) — mirrors
// lib/funnel.test.ts: typechecks under the app tsconfig and runs via
// `npx tsx lib/saved-jobs-client.test.ts`.

import { makeMockSavedJobsClient } from "./saved-jobs-client.js";

let failures = 0;

function expectEqual<T>(label: string, actual: T, expected: T): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures += 1;
    console.error(
      `✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

async function run(): Promise<void> {
  // save then list includes the job; unsave removes it
  {
    const c = makeMockSavedJobsClient();
    await c.save("1");
    expectEqual("save.includes", (await c.list()).some((j) => j.jobId === "1"), true);
    await c.unsave("1");
    expectEqual("unsave.removes", (await c.list()).some((j) => j.jobId === "1"), false);
  }
  // save is idempotent (no duplicate row)
  {
    const c = makeMockSavedJobsClient();
    await c.save("1");
    await c.save("1");
    expectEqual(
      "save.idempotent",
      (await c.list()).filter((j) => j.jobId === "1").length,
      1,
    );
  }

  if (failures > 0) {
    console.error(`\nsaved-jobs-client.test: ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log("saved-jobs-client.test: all assertions passed");
  }
}

void run();
