import { expect, test } from "@playwright/test";

/**
 * Smoke suite: does the app boot, render and navigate?
 *
 * Scoped to things that break loudly and are cheap to assert. It runs against the
 * mock dev server, so it proves the frontend works — never that the backend does.
 */

test("landing renders and the audience switch swaps the body", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /Get seen/i }).first()).toBeVisible();

  // The switch is pure client state — no route change — so assert on content, not URL.
  const before = await page.locator("main, body").first().innerText();
  await page.getByRole("button", { name: /hiring teams/i }).first().click();
  await expect
    .poll(async () => (await page.locator("main, body").first().innerText()) !== before, {
      timeout: 5000,
    })
    .toBe(true);
});

test("sign-in page renders its form", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: /Sign in to Aptura/i })).toBeVisible();
  await expect(page.getByPlaceholder(/you@company\.com/i)).toBeVisible();
});

test("job listings render", async ({ page }) => {
  await page.goto("/jobs");

  await expect(page.locator("body")).toContainText(/Senior Frontend Engineer/i, {
    timeout: 15_000,
  });
});

test("job detail emits valid JobPosting structured data", async ({ page }) => {
  await page.goto("/jobs/1");

  await expect(page.getByRole("heading", { name: /Senior Frontend Engineer/i }).first()).toBeVisible();

  // Guards the Google Jobs eligibility added alongside this suite: a malformed or
  // missing block would silently cost search traffic with nothing else failing.
  const raw = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(raw, "no ld+json block on the job page").toBeTruthy();

  const data = JSON.parse(raw!);
  expect(data["@type"]).toBe("JobPosting");
  for (const field of ["title", "description", "datePosted", "hiringOrganization"]) {
    expect(data[field], `JobPosting.${field} missing`).toBeTruthy();
  }
});

// Separate tests on purpose: each route pays its own first-request compile, and
// bundling both put the second one over the deadline with no budget left.
test("robots.txt is served", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("Sitemap:");
});

test("sitemap.xml is served", async ({ request }) => {
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain("<urlset");
});
