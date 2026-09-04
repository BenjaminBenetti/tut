import { expect, test } from "@playwright/test";

import type { TutTestHooks } from "../src/app/model/test-hooks";

/** The page's global object as seen from `page.evaluate`, with the dev hooks. */
interface HookGlobal {
  __tut__?: TutTestHooks;
}

const AUTOSAVE_KEY = "tut:save:autosave";

/** Just the fields this test reads out of the stored save. */
interface StoredSave {
  state: {
    overworld: {
      map: { cities: { id: string; layout: { x: number; y: number } }[] };
    };
  };
}

/** How far apart two cities must be in layout space to be worth comparing. */
const MIN_SEPARATION = 0.05;

/**
 * The strategic map is read straight on with north up (#420): a city
 * further east than another is further right on screen, a city further
 * south is further down, and the two axes never mix. Under the isometric
 * camera this failed, because a step due east moved a marker diagonally.
 */
test("the world map is axis aligned: east is right, south is down", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  await page.goto("/");
  const body = page.locator("body");
  await expect(body).toHaveAttribute("data-app-state", "ready");
  await page.locator('[data-field="seed"]').fill("4242");
  await page.locator('[data-action="new-game"]').click();
  await expect(body).toHaveAttribute("data-screen", "overworld");

  const cities = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("no autosave");
    const save = JSON.parse(raw) as StoredSave;
    return save.state.overworld.map.cities.map((city) => ({
      id: city.id,
      layout: city.layout,
    }));
  }, AUTOSAVE_KEY);
  expect(cities.length).toBeGreaterThan(8);

  const placed: { layout: { x: number; y: number }; x: number; y: number }[] =
    [];
  for (const city of cities.slice(0, 12)) {
    const at = await page.evaluate(
      (id) => (globalThis as HookGlobal).__tut__?.cityScreenPosition(id),
      city.id,
    );
    if (at) {
      placed.push({ layout: city.layout, x: at.x, y: at.y });
    }
  }
  expect(placed.length).toBeGreaterThan(8);

  const ratios: number[] = [];
  for (const a of placed) {
    for (const b of placed) {
      if (Math.abs(b.layout.x - a.layout.x) > MIN_SEPARATION) {
        // Further east is further right, and moving east alone never
        // walks a marker up or down the screen.
        expect(Math.sign(b.x - a.x)).toBe(Math.sign(b.layout.x - a.layout.x));
        ratios.push((b.x - a.x) / (b.layout.x - a.layout.x));
      }
      if (Math.abs(b.layout.y - a.layout.y) > MIN_SEPARATION) {
        expect(Math.sign(b.y - a.y)).toBe(Math.sign(b.layout.y - a.layout.y));
      }
    }
  }
  // One scale for the whole map: no skew, no rotation.
  const first = ratios[0] ?? 0;
  expect(first).toBeGreaterThan(0);
  for (const ratio of ratios) {
    expect(ratio).toBeCloseTo(first, 1);
  }

  expect(errors).toEqual([]);
});
