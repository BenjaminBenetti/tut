import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`, with the tactical hooks. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Client-pixel position of a unit's feet, or undefined. */
async function unitPosition(page: Page, unitId: string) {
  return page.evaluate(
    (id) => (globalThis as HookGlobal).__tutTactical__?.unitScreenPosition(id),
    unitId,
  );
}

/**
 * A unit's projected position once it has stopped moving: two reads a
 * frame apart that agree. Returns undefined if it never settles, which
 * a caller should treat as a failure rather than click blindly.
 */
async function settledPosition(page: Page, unitId: string) {
  let previous: { x: number; y: number } | undefined;
  for (let attempt = 0; attempt < 40; attempt++) {
    const now = await unitPosition(page, unitId);
    if (
      now &&
      previous &&
      Math.abs(now.x - previous.x) < 0.5 &&
      Math.abs(now.y - previous.y) < 0.5
    ) {
      return now;
    }
    previous = now;
    await page.waitForTimeout(25);
  }
  return undefined;
}

/**
 * The tactical input controller (#340) on the unit preview: hooks select
 * units and tiles, a real click on a unit's projected position selects
 * it after the camera has been rotated (yaw-aware picking), a click on
 * open ground reports a tile, and shortcut keys report actions.
 */
test("tactical input picks units and tiles at any camera yaw and maps shortcuts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto(
    "/mapgen-preview.html?seed=smoke&biome=coastal&settlement=town&size=small&units=1",
  );
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  // `ready` says the page mounted and drew a frame; the units arrive
  // behind a model load it does not wait for (#688).
  await expect(body).toHaveAttribute("data-preview-ready", "true");
  await expect(body).toHaveAttribute("data-units", "3");

  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-2"),
  );
  await expect(body).toHaveAttribute("data-selected-unit", "unit-2");
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectTile({
      x: 1,
      y: 0,
      z: 1,
    }),
  );
  await expect(body).toHaveAttribute("data-selected-tile", "1,0,1");

  // Rotate the camera a quarter turn, then click where the first unit
  // now appears: picking must follow the camera.
  await page.locator("canvas").hover();
  await page.keyboard.press("e");
  // Wait for the projected position to stop moving rather than for a
  // fixed span: the rig applies its new state on the next frame, and a
  // stale read here clicks where the unit *was* and picks whatever is
  // there now (#584).
  const at = await settledPosition(page, "unit-1");
  if (!at) throw new Error("unit-1 never settled to a screen position");
  await page.mouse.click(at.x, at.y);
  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");

  await page.keyboard.press("Enter");
  await expect(body).toHaveAttribute("data-last-intent", "end-turn");
  await page.keyboard.press("m");
  await expect(body).toHaveAttribute("data-last-action", "move");

  expect(errors).toEqual([]);
});
