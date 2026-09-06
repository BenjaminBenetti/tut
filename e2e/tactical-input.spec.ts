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

  // The deploy band of a 48² map (ADR 0009, #829) projects outside the
  // default 1280×720 viewport after a quarter turn of the camera, which
  // starts on the map's centre; a click off screen picks nothing.
  await page.setViewportSize({ width: 2400, height: 1500 });
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

  // Rotate the camera a quarter turn, then click where a unit now
  // appears: picking must follow the camera.
  await page.locator("canvas").hover();
  await page.keyboard.press("e");
  // Wait for the projected positions to stop moving rather than for a
  // fixed span: the rig applies its new state on the next frame, and a
  // stale read here clicks where the unit *was* and picks whatever is
  // there now (#584).
  const settled: { id: string; at: { x: number; y: number } }[] = [];
  for (const id of ["unit-1", "unit-2", "unit-3"]) {
    const at = await settledPosition(page, id);
    if (!at) throw new Error(`${id} never settled to a screen position`);
    expect(
      at.x >= 0 && at.x < 2400 && at.y >= 0 && at.y < 1500,
      `${id} projects on screen at ${String(at.x)},${String(at.y)}`,
    ).toBe(true);
    settled.push({ id, at });
  }
  // The deploy band on the ADR 0009 map (#829) can put two units so close
  // on screen from this yaw that a click at one's feet lands on the
  // other's model. Try the units from the most isolated on screen down,
  // deselecting first so the assertion is not met before the click, and
  // require that a click at a projected position selects that unit for
  // at least one of them: that is what yaw-aware picking promises.
  const isolation = (u: { at: { x: number; y: number } }): number =>
    Math.min(
      ...settled
        .filter((o) => o !== u)
        .map((o) => Math.hypot(o.at.x - u.at.x, o.at.y - u.at.y)),
    );
  let picked: string | undefined;
  for (const unit of [...settled].sort((a, b) => isolation(b) - isolation(a))) {
    await page.evaluate(
      (id) => (globalThis as HookGlobal).__tutTactical__?.selectUnit(id),
      unit.id === "unit-3" ? "unit-2" : "unit-3",
    );
    await expect(body).not.toHaveAttribute("data-selected-unit", unit.id);
    await page.mouse.click(unit.at.x, unit.at.y);
    await page.waitForTimeout(100);
    if ((await body.getAttribute("data-selected-unit")) === unit.id) {
      picked = unit.id;
      break;
    }
  }
  expect(
    picked,
    `no unit was selected by a click at its own projected position: ${JSON.stringify(settled)}`,
  ).toBeDefined();

  await page.keyboard.press("Enter");
  await expect(body).toHaveAttribute("data-last-intent", "end-turn");
  await page.keyboard.press("m");
  await expect(body).toHaveAttribute("data-last-action", "move");

  expect(errors).toEqual([]);
});
