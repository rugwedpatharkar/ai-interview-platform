// Spec for summarizeAlert + the in-memory job-alerts client. Zero-dependency harness
// (no test runner wired; adding vitest would churn the shared lockfile) — mirrors
// lib/funnel.test.ts: typechecks under the app tsconfig and runs via
// `npx tsx lib/job-alerts-client.test.ts`.

import { makeMockJobAlertsClient, summarizeAlert } from "./job-alerts-client.js";

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

// renders keyword + active filters as a human label
expectEqual(
  "summarize.full",
  summarizeAlert({
    alertId: "a1",
    keyword: "react",
    frequency: "daily",
    createdAt: "",
    lastRunAt: null,
    filters: { remoteMode: "remote", skills: ["ts", "react"] },
  }),
  '"react" · remote · ts, react',
);
// falls back to 'All jobs' when keyword + filters are empty
expectEqual(
  "summarize.empty",
  summarizeAlert({
    alertId: "a2",
    keyword: "",
    frequency: "weekly",
    createdAt: "",
    lastRunAt: null,
    filters: {},
  }),
  "All jobs",
);

async function run(): Promise<void> {
  // create → list includes it; remove drops it
  const c = makeMockJobAlertsClient();
  const a = await c.create({ keyword: "go", filters: {}, frequency: "weekly" });
  expectEqual("crud.created", (await c.list()).some((x) => x.alertId === a.alertId), true);
  await c.remove(a.alertId);
  expectEqual("crud.removed", (await c.list()).some((x) => x.alertId === a.alertId), false);

  if (failures > 0) {
    console.error(`\njob-alerts-client.test: ${failures} assertion(s) failed`);
    process.exit(1);
  } else {
    console.log("job-alerts-client.test: all assertions passed");
  }
}

void run();
