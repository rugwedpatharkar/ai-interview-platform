import { expect, test } from "@playwright/test";

/**
 * Guards the bug this suite exists because of: the Aptura mark once had three
 * independent definitions — an inline <LogoMark>, a `#ap-mark` sprite symbol, and a
 * favicon — that drifted into visibly different geometry. Nothing failed; it was
 * caught by eye, late.
 *
 * These are structural assertions rather than screenshot diffs on purpose. Pixel
 * baselines are per-platform (macOS renders differently from a Linux CI runner), so
 * they would need Linux baselines generated in Docker before CI could ever be green.
 * Geometry equality catches the drift that actually happened and is deterministic
 * everywhere. True pixel regression remains open work.
 */

/** Reduce an <svg>/<symbol> to a comparable geometry fingerprint. */
const GEOMETRY_FN = `(root) => {
  if (!root) return null;
  const shape = (el) => el.tagName.toLowerCase() + ":" +
    [...el.attributes]
      .filter((a) => !["class", "style"].includes(a.name))
      .map((a) => a.name + "=" + a.value)
      .sort()
      .join(",");
  return {
    viewBox: root.getAttribute("viewBox"),
    shapes: [...root.querySelectorAll("circle,line,path,rect,polygon")].map(shape).sort(),
  };
}`;

test("the inline mark and the sprite symbol draw identical geometry", async ({ page }) => {
  // The landing nav renders <LogoMark> inline — but only after hydration: HomeClient
  // returns null until `mounted`, so the server HTML is empty and a bare goto() would
  // read the DOM too early. Wait for the mark itself rather than a fixed delay.
  await page.goto("/");
  await page.locator("svg.mark").first().waitFor({ state: "attached", timeout: 30_000 });
  const inline = await page.evaluate(
    `(${GEOMETRY_FN})(document.querySelector('svg.mark'))`,
  );
  expect(inline, "no inline svg.mark on the landing").toBeTruthy();

  // The sign-in card renders the sprite via <use href="#ap-mark">.
  await page.goto("/login");
  const symbol = await page.evaluate(
    `(${GEOMETRY_FN})(document.querySelector('#ap-mark'))`,
  );
  expect(symbol, "no #ap-mark symbol in the sprite").toBeTruthy();

  // Same viewBox and the same set of drawn shapes — one mark, two render paths.
  expect(symbol).toEqual(inline);
});

test("the mark renders bare, with no tile behind it", async ({ page }) => {
  // The pre-unification mark sat on a filled rounded tile. If a tile creeps back in,
  // the landing and the app chrome stop matching again.
  await page.goto("/");
  await page.locator("svg.mark").first().waitFor({ state: "attached", timeout: 30_000 });
  const wrapperBg = await page.evaluate(`(() => {
    const svg = document.querySelector('svg.mark');
    if (!svg || !svg.parentElement) return null;
    return getComputedStyle(svg.parentElement).backgroundColor;
  })()`);
  expect(wrapperBg === null || /rgba\(0, 0, 0, 0\)|transparent/.test(String(wrapperBg))).toBe(
    true,
  );
});

test("the brand token still resolves to the Lucent violet", async ({ page }) => {
  await page.goto("/");
  const brand = await page.evaluate(
    `getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()`,
  );
  // --teal / --coral / --gold are aliases of this; a change here silently restyles
  // every surface at once.
  expect(brand).toBe("oklch(0.53 0.24 300)");
});
