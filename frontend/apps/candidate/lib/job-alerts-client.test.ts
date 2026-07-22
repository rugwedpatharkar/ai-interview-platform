// Spec for summarizeAlert + the in-memory job-alerts client.

import { it } from "vitest";

import { expectEqual } from "../test-harness.js";
import { makeMockJobAlertsClient, summarizeAlert } from "./job-alerts-client.js";

it("renders keyword + active filters as a human label", () => {
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
});

it("falls back to 'All jobs' when keyword + filters are empty", () => {
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
});

it("create → list includes it; remove drops it", async () => {
  const c = makeMockJobAlertsClient();
  const a = await c.create({ keyword: "go", filters: {}, frequency: "weekly" });
  expectEqual("crud.created", (await c.list()).some((x) => x.alertId === a.alertId), true);
  await c.remove(a.alertId);
  expectEqual("crud.removed", (await c.list()).some((x) => x.alertId === a.alertId), false);
});
