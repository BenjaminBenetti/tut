import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { CITY_MARKER_NUDGES } from "../src/graphics/data/city-marker-nudges";
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

/** How long to wait for the map viewport to reach its final size. */
const SETTLE_TIMEOUT_MS = 5000;

/** A point in normalised map-layout space. */
interface LayoutPoint {
  readonly x: number;
  readonly y: number;
}

/** How far apart two cities must be in layout space to be worth comparing. */
const MIN_SEPARATION = 0.05;

/**
 * Where a marker is actually drawn: the city's layout plus its
 * presentation nudge (#439), which slides a handful of coastal cities
 * onto the coastline the Earth texture draws. The camera invariant below
 * is about the layout → screen mapping, so it has to start from the same
 * point the scene builder starts from.
 *
 * @param layout - The city's true equirectangular layout.
 * @param id - The city's id, used to look up its nudge.
 * @returns The layout point the marker is placed at.
 */
function drawnLayout(layout: LayoutPoint, id: string): LayoutPoint {
  const nudge = CITY_MARKER_NUDGES[id];
  return nudge === undefined
    ? layout
    : { x: layout.x + nudge.x, y: layout.y + nudge.y };
}

/**
 * The strategic map is read straight on with north up (#420): a city
 * further east than another is further right on screen, a city further
 * south is further down, and the two axes never mix. Under the isometric
 * camera this failed, because a step due east moved a marker diagonally.
 */
/**
 * Waits until a city's projected position stops moving.
 *
 * `data-screen="overworld"` is set before the map viewport has been laid
 * out, so for the first frames the camera is still on the full-window
 * frustum and every projected position is wrong by the difference
 * between that and the map cell (#473). Reading the cities one at a time
 * across that boundary mixes two frustums and breaks the uniform-scale
 * assertion below, which is a flake, not a regression.
 *
 * @param page - The page under test.
 * @param cityId - Any city; they all settle together.
 */
async function settle(page: Page, cityId: string): Promise<void> {
  const read = async (): Promise<string> =>
    JSON.stringify(
      await page.evaluate(
        (id) => (globalThis as HookGlobal).__tut__?.cityScreenPosition(id),
        cityId,
      ),
    );
  await expect
    .poll(
      async () => {
        const first = await read();
        return first === (await read()) && first !== "undefined";
      },
      { timeout: SETTLE_TIMEOUT_MS },
    )
    .toBe(true);
}

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

  await settle(page, cities[0]?.id ?? "london");

  // Every anchor in one evaluate: one JS turn, so one camera. Reading
  // them one await at a time samples a camera that may still be moving,
  // and two cities measured a frame apart can then contradict each
  // other's order for reasons that have nothing to do with projection.
  const sample = cities.slice(0, 12);
  const anchors = await page.evaluate(
    (ids) =>
      ids.map((id) =>
        (globalThis as HookGlobal).__tut__?.cityScreenPosition(id),
      ),
    sample.map((city) => city.id),
  );

  const placed: { layout: { x: number; y: number }; x: number; y: number }[] =
    [];
  sample.forEach((city, index) => {
    const at = anchors[index];
    if (at) {
      placed.push({
        layout: drawnLayout(city.layout, city.id),
        x: at.x,
        y: at.y,
      });
    }
  });
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
