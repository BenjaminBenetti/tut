import { expect, test } from "@playwright/test";

import type { TutTestHooks } from "../src/app/model/test-hooks";

/** The page's global object as seen from `page.evaluate`, with the dev hooks. */
interface HookGlobal {
  __tut__?: TutTestHooks;
}

/**
 * QA's repro for #218: holding a pan key used to carry the whole Earth
 * map off screen. The camera target is now clamped to the map plate, so
 * after two seconds of panning left the western-most city is still
 * inside the viewport.
 */
test("holding a pan key cannot carry the overworld map off screen", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  const size = page.viewportSize();
  if (!size) {
    throw new Error("Test needs a fixed viewport");
  }

  await page.locator("#map-area").hover();
  await page.keyboard.down("a");
  await page.waitForTimeout(2000);
  await page.keyboard.up("a");
  await page.waitForTimeout(100);

  const vancouver = await page.evaluate(() =>
    (globalThis as HookGlobal).__tut__?.cityScreenPosition("vancouver"),
  );
  expect(vancouver).toBeDefined();
  if (!vancouver) throw new Error("vancouver has no screen position");
  expect(vancouver.x).toBeGreaterThanOrEqual(0);
  expect(vancouver.x).toBeLessThanOrEqual(size.width);
  expect(errors).toEqual([]);
});
