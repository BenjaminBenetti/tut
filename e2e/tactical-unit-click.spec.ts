import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TutTestHooks } from "../src/app/model/test-hooks";
import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`, with both hook sets. */
interface HookGlobal {
  __tut__?: TutTestHooks;
  __tutTactical__?: TacticalTestHooks;
}

/** Days to advance before giving up on a mission appearing for the fixed seed. */
const MAX_DAYS = 40;

/** Highest ground layer to search when looking for a tile that exists. */
const MAX_LAYER = 12;

/**
 * Client-pixel position of a unit's feet, once it has stopped moving:
 * two reads a frame apart that agree. Undefined means it never settled,
 * which the caller treats as a failure rather than clicking blindly.
 */
async function settledFeet(page: Page, unitId: string) {
  let previous: { x: number; y: number } | undefined;
  for (let attempt = 0; attempt < 40; attempt++) {
    const now = await page.evaluate(
      (id) =>
        (globalThis as HookGlobal).__tutTactical__?.unitScreenPosition(id),
      unitId,
    );
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
 * Screen distance between two tile centres one step apart, which is the
 * scale everything else on the map is drawn at. Derived rather than
 * assumed so this survives a camera or map-scale change (#829, ADR 0009).
 *
 * The layer a column's ground sits on varies with the terrain, so this
 * searches the layers for a pair that both project rather than assuming
 * one: a tile that is not there projects to nothing.
 */
async function tilePitch(page: Page, x: number, z: number) {
  const project = (tile: { x: number; y: number; z: number }) =>
    page.evaluate(
      (t) => (globalThis as HookGlobal).__tutTactical__?.tileScreenPosition(t),
      tile,
    );
  for (let y = 0; y <= MAX_LAYER; y++) {
    const [here, next] = await Promise.all([
      project({ x, y, z }),
      project({ x: x + 1, y, z }),
    ]);
    if (here && next) {
      return Math.hypot(here.x - next.x, here.y - next.y);
    }
  }
  return undefined;
}

/**
 * Clicking a unit on the tactical map selects it, which is the only way
 * a player has of selecting one — the side rail shows the selection, it
 * does not offer a list to pick from.
 *
 * Every other tactical spec reaches for the `selectUnit` hook, and the
 * one spec that clicks a unit's projected position runs on the map lab
 * page. So the game screen's only selection path had no coverage, which
 * is what this closes (found while verifying the 2026-09-08 map fixes).
 *
 * ```
 *        ██   <- body: a click here selects the unit
 *        ██
 *   ─────▼▼─────  <- feet: unitScreenPosition, and a click here is the
 *      tile          ground under it, which selects the tile instead
 * ```
 *
 * The starter mech's visible torso is two projected ground-tile pitches
 * above its feet at this fixture's scale and arrival view. Half a pitch
 * shoots through the leg gap after #911 moves the landing. This is an
 * authored-art target, not a generic body-position formula; the real click
 * must hit the model, with pitch measured at the current zoom.
 */
test("clicking a unit on the tactical map selects it and arms its actions", async ({
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
  await expect(body).toHaveAttribute("data-tactical-units", /\d+/);

  const feet = await settledFeet(page, "unit-1");
  expect(feet, "unit-1 never settled on screen").toBeDefined();
  // Any column near the middle of the map; the search finds its layer.
  const pitch = await tilePitch(page, 20, 20);
  expect(pitch, "could not measure the tile pitch").toBeDefined();

  // The click under test: the visible starter-mech torso, clear of its leg gap.
  await page.mouse.click(feet!.x, feet!.y - pitch! * 2);

  await expect(body).toHaveAttribute("data-selected-unit", "unit-1");
  await expect(body).toHaveAttribute("data-last-intent", "select-unit");
  // Selecting a unit is what the strip shows; without this the
  // attribute could be set while the HUD holds no selection.
  await expect(
    page.locator('[data-role="squad-list"] li[data-unit-id="unit-1"]'),
  ).toHaveAttribute("data-selected", "true");

  expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});
