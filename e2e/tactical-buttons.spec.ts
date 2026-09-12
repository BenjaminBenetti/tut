import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { launchMission } from "./mission-capture.helper";
import { CITY_MISSION_FIXTURE } from "./fixtures/mission-maps";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** Starts a real mission on the fixed seed and returns its id. */
async function startMission(page: Page): Promise<void> {
  await launchMission(page, "4242", CITY_MISSION_FIXTURE);
}

/** Where a unit's feet are on screen, or undefined. */
async function unitAt(page: Page, id: string) {
  return page.evaluate(
    (u) => (globalThis as HookGlobal).__tutTactical__?.unitScreenPosition(u),
    id,
  );
}

/**
 * Left click asks, right click walks (#520, #1112). Playtest 1: "Right
 * click should be the 'invoke action' trigger not left click." The wheel
 * replaced the bar and its digits: a left click on a tile opens the
 * actions for that tile, and only the right button moves.
 */
test("left click opens the wheel on a tile, right click moves to it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await startMission(page);
  const body = page.locator("body");
  const menu = page.locator("#radial-menu");

  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");
  // The unit's model loads asynchronously, so its screen position only
  // exists once the mesh is placed.
  await expect
    .poll(async () => (await unitAt(page, "unit-1")) !== undefined)
    .toBe(true);
  const before = await unitAt(page, "unit-1");
  if (!before) throw new Error("unit-1 has no screen position");

  // A tile a short walk away: two tiles along, in screen space.
  const target = { x: before.x + 60, y: before.y + 30 };

  // Left click opens the wheel there and does not move the unit.
  await page.mouse.click(target.x, target.y);
  await expect(body).toHaveAttribute("data-last-intent", "select-tile");
  await expect(menu).toHaveAttribute("data-open", "true");
  await expect(menu.locator('button[data-item^="move:"]')).toHaveCount(1);
  const afterLeft = await unitAt(page, "unit-1");
  expect(afterLeft).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  // Right click on the same spot walks there, with no wheel.
  await page.mouse.click(target.x, target.y, { button: "right" });
  await expect(body).toHaveAttribute("data-last-intent", "invoke");
  await expect(menu).toBeHidden();
  await expect
    .poll(async () => {
      const now = await unitAt(page, "unit-1");
      return now ? `${String(now.x)},${String(now.y)}` : "gone";
    })
    .not.toBe(`${String(before.x)},${String(before.y)}`);

  expect(errors).toEqual([]);
});

test("the number row and the letters arm and cancel, and the bar shows the digits", async ({
  page,
}) => {
  await startMission(page);
  const body = page.locator("body");
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");
  await page.locator("#tactical-viewport canvas").hover();

  await page.keyboard.press("f");
  await expect(body).toHaveAttribute("data-last-intent", "attack");
  await page.keyboard.press("Escape");
  await expect(body).toHaveAttribute("data-last-intent", "cancel");

  // The number row arms in the bar's order, and the bar says so.
  await page.keyboard.press("2");
  await expect(body).toHaveAttribute("data-last-intent", "attack");
  await page.keyboard.press("Escape");
  await expect(
    page.locator('#action-bar [data-action="attack"] [data-role="shortcut"]'),
  ).toHaveText("2");
  // A bar press goes straight to the HUD, not through the input
  // controller, so the body's last-intent stays put; the bar itself
  // shows the aim it armed.
  await page.locator('#action-bar [data-action="attack"]').click();
  await expect(
    page.locator('#action-bar [data-action="attack"]'),
  ).toHaveAttribute("aria-pressed", "true");
});

test("the browser menu is suppressed on the map, not on the document", async ({
  page,
}) => {
  await startMission(page);
  const suppressed = await page.evaluate(() => {
    const viewport = document.querySelector("#tactical-viewport");
    // The HUD is mounted inside the viewport, so it is covered too; what
    // must keep its menu is everything outside, which `body` stands for.
    const outside = document.body;
    const fire = (el: Element | null): boolean => {
      if (!el) return false;
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(event);
      return event.defaultPrevented;
    };
    return { onMap: fire(viewport), offMap: fire(outside) };
  });
  expect(suppressed.onMap).toBe(true);
  expect(suppressed.offMap).toBe(false);
});
