import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  assertNoAssetFallback,
  drawnFrame,
  tacticalModelsReady,
  tapCameraKey,
  watchAssetFallback,
} from "./capture-frame.helper";
import { launchMission, settleForShot } from "./mission-capture.helper";

import type { TacticalTestHooks } from "../src/ui/model/tactical-intent";

/** The page's global object as seen from `page.evaluate`. */
interface HookGlobal {
  __tutTactical__?: TacticalTestHooks;
}

/** A tile in the mission's map. */
interface Tile {
  x: number;
  y: number;
  z: number;
}

/** A point in client pixels. */
interface Point {
  x: number;
  y: number;
}

/** Where the frames go. */
const FRAMES = process.env.LAYER_FRAMES ?? "docs/design/storey-cut";

/** The autosave slot every read below goes through. */
const SAVE_KEY = "tut:save:autosave";

/**
 * A ground-floor tile of the building that best shows #1136: at least
 * two floors, standing highest up the hill, and how far up it stands.
 *
 * @param page - The page holding the live mission.
 * @returns The tile, the building's floor count and its step above the lowest ground, or null.
 */
async function hillBuildingTile(
  page: Page,
): Promise<{ tile: Tile; floors: number; step: number } | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return null;
    }
    const save = JSON.parse(raw) as {
      state: {
        activeMission?: {
          map: {
            tiles: (Tile & { buildingId?: string; floorIndex?: number })[];
            buildings: {
              id: string;
              groundLevel: number;
              floors: unknown[];
            }[];
          };
        };
      };
    };
    const map = save.state.activeMission?.map;
    if (!map || map.buildings.length === 0) {
      return null;
    }
    const terrainFloor = Math.min(
      ...map.tiles.filter((t) => t.buildingId === undefined).map((t) => t.y),
    );
    const tall = map.buildings
      .filter((b) => b.floors.length >= 2)
      .sort((a, b) => b.groundLevel - a.groundLevel)[0];
    const tile = map.tiles.find(
      (t) => t.buildingId === tall?.id && t.floorIndex === 0,
    );
    return tile && tall
      ? {
          tile: { x: tile.x, y: tile.y, z: tile.z },
          floors: tall.floors.length,
          step: tall.groundLevel - terrainFloor,
        }
      : null;
  }, SAVE_KEY);
}

/** Where a tile is drawn, in client pixels. */
async function tileAt(page: Page, tile: Tile): Promise<Point | undefined> {
  return page.evaluate(
    (t) => (globalThis as HookGlobal).__tutTactical__?.tileScreenPosition(t),
    tile,
  );
}

/** Delivers one atomic camera tap, then verifies the rendered movement. */
async function tapOnce(
  page: Page,
  key: string,
  at: () => Promise<Point | undefined>,
): Promise<Point> {
  const before = await at();
  if (!before) {
    throw new Error(`cannot pan: nothing to measure before pressing ${key}`);
  }
  await tapCameraKey(page, key);
  const now = await at();
  if (!now || Math.hypot(now.x - before.x, now.y - before.y) <= 1) {
    throw new Error(`pressing ${key} moved the camera nowhere`);
  }
  return { x: now.x - before.x, y: now.y - before.y };
}

/**
 * Pans until `tile` is within half a tap of the middle of the viewport,
 * greedily and with every tap verified, as the hillside capture does.
 *
 * @param page - The page holding the live mission.
 * @param tile - The tile to centre.
 */
async function centreOn(page: Page, tile: Tile): Promise<void> {
  const at = () => tileAt(page, tile);
  const box = await page.locator("#tactical-viewport").boundingBox();
  if (!box) {
    return;
  }
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const tolerance = 48;
  const moved = { x: 0, y: 0 };
  for (let step = 0; step < 40; step++) {
    const now = await at();
    if (!now) {
      return;
    }
    const dx = centre.x - now.x;
    const dy = centre.y - now.y;
    if (Math.abs(dx) <= tolerance && Math.abs(dy) <= tolerance) {
      break;
    }
    const horizontal = Math.abs(dx) > Math.abs(dy);
    if (horizontal && moved.x === 0) {
      moved.x = Math.sign((await tapOnce(page, "d", at)).x);
      continue;
    }
    if (!horizontal && moved.y === 0) {
      moved.y = Math.sign((await tapOnce(page, "s", at)).y);
      continue;
    }
    const key = horizontal
      ? dx > 0 === moved.x > 0
        ? "d"
        : "a"
      : dy > 0 === moved.y > 0
        ? "s"
        : "w";
    await tapOnce(page, key, at);
  }
}

/** Steps the view `delta` storeys through the same path the keys take. */
async function step(page: Page, delta: number): Promise<void> {
  await page.evaluate(
    (d) => (globalThis as HookGlobal).__tutTactical__?.stepLayer(d),
    delta,
  );
}

/** Screenshots the viewport once the scene has drawn the change. */
async function shoot(page: Page, path: string): Promise<Buffer> {
  await drawnFrame(page);
  // Refuse the frame if anything drew a placeholder (#1021).
  assertNoAssetFallback(page, path);
  return page.locator("#tactical-viewport").screenshot({ path });
}

/**
 * The #1136 triptych: a building of two or more floors up a hill, at
 * the roofed top, with the roofs off, and at the ground floor. The hill
 * must be intact in all three — the storey view cuts buildings only —
 * and the middle frame must show the top floor with no roof over it,
 * which is the step the Executive Director could not find.
 *
 * Not an assertion of how it looks — that is the Director's call. What
 * it asserts is that the shot is of the real thing: a live mission on a
 * generated map with the building the frame is about, stepped through
 * the same intent path the keys use, with the readout agreeing at every
 * step and every frame different from the last.
 *
 *   CAPTURE=1 pnpm exec playwright test e2e/storey-cut-roof-screenshot.spec.ts
 */
test("captures a hill building at the top, with the roofs off, and at the ground floor", async ({
  page,
}) => {
  test.skip(
    process.env.CAPTURE === undefined,
    "set CAPTURE=1 to regenerate the storey cut roof frames",
  );
  test.setTimeout(180_000);
  const seed = process.env.LAYER_SEED ?? "555";
  watchAssetFallback(page);
  await page.setViewportSize({ width: 1400, height: 800 });
  await launchMission(page, seed);
  await tacticalModelsReady(page);
  await settleForShot(page);

  const body = page.locator("body");
  const readout = page.locator('#turn-banner [data-field="floor"]');
  const subject = await hillBuildingTile(page);
  expect(
    subject,
    "the capture seed must have a building of two or more floors",
  ).not.toBeNull();
  if (!subject) {
    return;
  }
  // A building on the lowest ground would say nothing about the hills
  // staying, so it is a hard requirement rather than a skip.
  expect(
    subject.step,
    "the capture seed must have a tall building up a hill",
  ).toBeGreaterThan(0);
  const storeys = Number(await body.getAttribute("data-tactical-storeys"));
  const floors = storeys - 1;
  expect(floors).toBeGreaterThanOrEqual(subject.floors);

  await centreOn(page, subject.tile);

  // The top: the map as it opens, roofs on.
  await expect(readout).toHaveText("All");
  const top = await shoot(page, `${FRAMES}-top.png`);

  // One down: every roof off, the tallest building's top floor on show,
  // the hill intact.
  await step(page, -1);
  await expect(body).toHaveAttribute("data-tactical-storey", String(floors));
  await expect(readout).toHaveText(`${floors} / ${floors}`);
  const roofOff = await shoot(page, `${FRAMES}-roof-off.png`);
  expect(
    roofOff.equals(top),
    "taking the roofs off must change the frame",
  ).toBe(false);

  // The ground floor: upper floors gone, the hill still intact.
  await step(page, -storeys);
  await expect(body).toHaveAttribute("data-tactical-storey", "1");
  await expect(readout).toHaveText(`1 / ${floors}`);
  const ground = await shoot(page, `${FRAMES}-ground.png`);
  expect(
    ground.equals(roofOff),
    "cutting to the ground floor must change the frame",
  ).toBe(false);
});
