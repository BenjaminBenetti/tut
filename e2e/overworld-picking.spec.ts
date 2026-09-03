import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { TutTestHooks } from "../src/app/model/test-hooks";
import { EARTH_MAP } from "../src/overworld/data/earth-map";

/** The page's global object as seen from `page.evaluate`, with the dev hooks. */
interface HookGlobal {
  __tut__?: TutTestHooks;
}

/** A client-pixel point. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/** A client-pixel rectangle, as Playwright's `boundingBox` reports it. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Client-pixel position of a city's marker, or undefined when unprojectable. */
async function markerPosition(
  page: Page,
  cityId: string,
): Promise<Point | undefined> {
  return page.evaluate(
    (id) => (globalThis as HookGlobal).__tut__?.cityScreenPosition(id),
    cityId,
  );
}

/** True when the point is inside `box`. */
function inside(point: Point, box: Box): boolean {
  return (
    point.x >= box.x &&
    point.y >= box.y &&
    point.x <= box.x + box.width &&
    point.y <= box.y + box.height
  );
}

/** True when the point is inside the viewport and not covered by the overworld panel. */
function isClickable(
  position: Point,
  viewport: Box,
  panel: Box | null,
): boolean {
  if (!inside(position, viewport)) {
    return false;
  }
  return panel === null || !inside(position, panel);
}

/**
 * Every city in the shipped Earth map is pickable with a real pointer
 * click at its projected marker position, and the selection is mirrored
 * to `body[data-selected-city]` and the panel's `#selected-city` label.
 * Cities hidden under the overworld panel are skipped, but the test
 * insists that almost all of them were actually exercised so a layout
 * change cannot hollow it out silently.
 */
test("every city marker picks itself with a pointer click", async ({
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
  await expect(page.locator("body")).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-action="new-game"]').click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-screen",
    "overworld",
  );

  const size = page.viewportSize();
  if (!size) {
    throw new Error("Test needs a fixed viewport");
  }
  const viewport: Box = { x: 0, y: 0, ...size };
  const panel = await page
    .locator('section[data-screen="overworld"]')
    .boundingBox();

  const skipped: string[] = [];
  const misses: string[] = [];
  for (const city of EARTH_MAP.cities) {
    const position = await markerPosition(page, city.id);
    if (!position || !isClickable(position, viewport, panel)) {
      skipped.push(city.id);
      continue;
    }
    await page.mouse.click(position.x, position.y);
    const selected = await page.getAttribute("body", "data-selected-city");
    const label = await page.locator("#selected-city").textContent();
    if (selected !== city.id || label !== city.name) {
      misses.push(`${city.id}: selected=${selected ?? "none"} label=${label}`);
    }
  }

  expect(misses).toEqual([]);
  expect(skipped.length).toBeLessThanOrEqual(
    Math.floor(EARTH_MAP.cities.length / 10),
  );
  expect(errors).toEqual([]);
});
