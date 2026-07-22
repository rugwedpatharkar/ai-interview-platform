// Spec for the in-memory saved-jobs client.

import { it } from "vitest";

import { expectEqual } from "../test-harness.js";
import { makeMockSavedJobsClient } from "./saved-jobs-client.js";

it("save then list includes the job; unsave removes it", async () => {
  const c = makeMockSavedJobsClient();
  await c.save("1");
  expectEqual("save.includes", (await c.list()).some((j) => j.jobId === "1"), true);
  await c.unsave("1");
  expectEqual("unsave.removes", (await c.list()).some((j) => j.jobId === "1"), false);
});

it("save is idempotent (no duplicate row)", async () => {
  const c = makeMockSavedJobsClient();
  await c.save("1");
  await c.save("1");
  expectEqual("save.idempotent", (await c.list()).filter((j) => j.jobId === "1").length, 1);
});
