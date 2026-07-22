import { defineConfig, devices } from "@playwright/test";

// Port 3200 so a suite run never collides with a dev server on :3000 or a
// `next start` on :3100.
const PORT = 3200;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Serial on purpose: parallel workers competing for the same server produced
  // deadline failures that had nothing to do with the assertions.
  fullyParallel: false,
  workers: 1,
  // Dev compiles each route on first request, and the server slows as a sequential
  // run accumulates compiles — the final test is the one that starves. This is
  // warm-up cost, not a real deadline, so give it room.
  timeout: 120_000,
  // A stray `test.only` must fail CI rather than silently skipping the suite.
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Dev server, deliberately. A production build would additionally exercise the
    // strict nonce CSP from middleware.ts, which dev does not (dev keeps
    // 'unsafe-inline') — but `next build` under this webServer overran even a 10min
    // ceiling from a cold cache, which is too slow and too fragile for a smoke gate.
    // Covering the production CSP is tracked as follow-up work, not solved here.
    //
    // NEXT_PUBLIC_MOCK keeps it hermetic: the suite proves the frontend renders and
    // navigates, never that a backend is up.
    command: `npx next dev -p ${PORT}`,
    cwd: "apps/candidate",
    env: { NEXT_PUBLIC_MOCK: "1" },
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
