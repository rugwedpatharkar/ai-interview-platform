import { expect, test } from "@playwright/test";

/**
 * Pins BUG-20260728-05 (Medium). /jobs marketplace holds params in useState only;
 * user actions never update the URL, so reload / share / back all lose the search.
 * `test.fail` inverts the assertion: passes today because the inner assertion fails
 * (URL stays at "/jobs"). Flips to unexpected pass when the fix wires router.push,
 * prompting the marker's removal so it guards the regression going forward.
 */

test.fail(
  "typing a search + hitting Search updates the URL query string (pins BUG-05)",
  async ({ page }) => {
    await page.goto("/jobs");
    await page.getByPlaceholder(/job title, skill, or company/i).fill("frontend");
    await page.getByRole("button", { name: /search/i }).click();
    // React state updates asynchronously; give the router a beat.
    await page.waitForTimeout(500);
    expect(page.url()).toMatch(/[?&]q=frontend/);
  },
);

test.fail(
  "clicking a work-mode filter chip updates the URL (pins BUG-05)",
  async ({ page }) => {
    await page.goto("/jobs");
    await page.getByRole("button", { name: /^Remote/i }).first().click();
    await page.waitForTimeout(500);
    expect(page.url()).toMatch(/mode|remote|work/i);
  },
);
