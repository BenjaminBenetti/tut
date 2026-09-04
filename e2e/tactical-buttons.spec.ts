import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TutTestHooks } from "../src/app/model/test-hooks";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

interface HookGlobal {
  __tut__?: TutTestHooks;
  __tutTactical__?: TacticalTestHooks;
}

const MAX_DAYS = 40;

/** Starts a real mission on the fixed seed and returns its id. */
async function startMission(page: Page): Promise<void> {
  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill("4242");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");
  const rows = page.locator('[data-role="mission-list"] [data-mission-id]');
  const advance = page.locator('[data-action="advance-day"]');
  const choice = page.locator('[data-role="event-dialog"] [data-choice-id]');
  for (let day = 0; day < MAX_DAYS && (await rows.count()) === 0; day++) {
    if (await choice.first().isVisible()) {
      await choice.first().click();
    }
    await expect(advance).toBeEnabled();
    await advance.click();
  }
  const missionId = await rows.first().getAttribute("data-mission-id");
  await page.evaluate(
    (id) => (globalThis as HookGlobal).__tut__?.startTacticalMission(id),
    missionId ?? "",
  );
  await expect(body).toHaveAttribute("data-screen", "tactical");
  await expect(page.locator("#tactical-viewport canvas")).toBeVisible();
}

/** Where a unit's feet are on screen, or undefined. */
async function unitAt(page: Page, id: string) {
  return page.evaluate(
    (u) => (globalThis as HookGlobal).__tutTactical__?.unitScreenPosition(u),
    id,
  );
}

/**
 * Right click invokes, left click selects, digits arm (#520). Playtest 1:
 * "Right click should be the 'invoke action' trigger not left click.
 * Perhaps number keys could be used to quick cycle actions."
 */
test("left click selects a tile, right click moves to it", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  await startMission(page);
  const body = page.locator("body");

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

  // Arm Move with its digit rather than a bar click.
  await page.locator("#tactical-viewport canvas").hover();
  await page.keyboard.press("1");
  await expect(body).toHaveAttribute("data-last-intent", "move");

  // A tile a short walk away: two tiles along, in screen space.
  const target = { x: before.x + 60, y: before.y + 30 };

  // Left click points at it and does not move the unit.
  await page.mouse.click(target.x, target.y);
  await expect(body).toHaveAttribute("data-last-intent", "select-tile");
  const afterLeft = await unitAt(page, "unit-1");
  expect(afterLeft).toEqual(before);

  // Right click on the same spot invokes the armed action, and it walks.
  await page.mouse.click(target.x, target.y, { button: "right" });
  await expect(body).toHaveAttribute("data-last-intent", "invoke");
  await expect
    .poll(async () => {
      const now = await unitAt(page, "unit-1");
      return now ? `${String(now.x)},${String(now.y)}` : "gone";
    })
    .not.toBe(`${String(before.x)},${String(before.y)}`);

  expect(errors).toEqual([]);
});

test("the number row arms actions in action-bar order", async ({ page }) => {
  await startMission(page);
  const body = page.locator("body");
  await page.evaluate(() =>
    (globalThis as HookGlobal).__tutTactical__?.selectUnit("unit-1"),
  );
  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");
  await page.locator("#tactical-viewport canvas").hover();

  await page.keyboard.press("2");
  await expect(body).toHaveAttribute("data-last-intent", "attack");
  await expect(
    page.locator('#action-bar [data-action="attack"]'),
  ).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("1");
  await expect(body).toHaveAttribute("data-last-intent", "move");
  await expect(
    page.locator('#action-bar [data-action="move"]'),
  ).toHaveAttribute("aria-pressed", "true");

  // The bar documents the digits it answers to.
  await expect(
    page.locator('#action-bar [data-action="move"] [data-role="shortcut"]'),
  ).toHaveText("1");
  await expect(
    page.locator('#action-bar [data-action="attack"] [data-role="shortcut"]'),
  ).toHaveText("2");
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
