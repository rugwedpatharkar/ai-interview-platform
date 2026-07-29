import { expect, test } from "@playwright/test";

/**
 * Regression guard for BUG-20260728-05 (fixed in 7eb1c96,
 * "feat(fe): sync marketplace filter/sort/page state to the URL").
 *
 * Before the fix, /jobs marketplace held params in useState only and never
 * pushed back to the URL. Reload / share / back all lost the search. The
 * fix threads router.replace into every filter change; these two tests
 * lock that behaviour in so a future regression doesn't slip through.
 */

test(
  "typing a search + hitting Search updates the URL query string (guards BUG-05)",
  async ({ page }) => {
    await page.goto("/jobs");
    await page.getByPlaceholder(/job title, skill, or company/i).fill("frontend");
    await page.getByRole("button", { name: /search/i }).click();
    // The router push is async; wait for the URL to reflect the new state.
    await page.waitForURL(/[?&]q=frontend/);
    expect(page.url()).toMatch(/[?&]q=frontend/);
  },
);

test(
  "clicking a work-mode filter chip updates the URL (guards BUG-05)",
  async ({ page }) => {
    await page.goto("/jobs");
    await page.getByRole("button", { name: /^Remote/i }).first().click();
    await page.waitForURL(/mode=|remote|work/i);
    expect(page.url()).toMatch(/mode=|remote|work/i);
  },
);
